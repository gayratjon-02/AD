import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackshotGeneration } from '../database/entities/Product-Visuals/packshot-generation.entity';
import { Product } from '../database/entities/Product-Visuals/product.entity';
import { VertexImagenService } from '../ai/vertex-imagen.service';
import { GenerationStatus } from '../libs/enums';
import { FilesService } from '../files/files.service';
import { GenerationGateway } from '../generations/generation.gateway';
import { PromptBuilderService } from '../ai/prompt-builder.service';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze/analyze-product-direct.dto';

export interface PackshotJobData {
	packshotId: string;
}

const SHOT_TYPES = ['front_packshot', 'back_packshot', 'detail_1', 'detail_2'] as const;
type PackshotShotType = typeof SHOT_TYPES[number];

@Processor('packshot')
export class PackshotProcessor {
	private readonly logger = new Logger(PackshotProcessor.name);

	constructor(
		@InjectRepository(PackshotGeneration)
		private readonly packshotRepo: Repository<PackshotGeneration>,
		@InjectRepository(Product)
		private readonly productRepo: Repository<Product>,
		private readonly vertexImagenService: VertexImagenService,
		private readonly filesService: FilesService,
		private readonly generationGateway: GenerationGateway,
		private readonly promptBuilderService: PromptBuilderService,
	) {}

	@Process()
	async processPackshot(job: Job<PackshotJobData>): Promise<void> {
		const { packshotId } = job.data;
		this.logger.log(`📦 [PACKSHOT] Starting job ${job.id} for packshot ${packshotId}`);

		try {
			const packshot = await this.packshotRepo.findOne({
				where: { id: packshotId },
				relations: ['product'],
			});

			if (!packshot) {
				throw new Error(`Packshot ${packshotId} not found`);
			}

			const product = packshot.product;
			if (!product) {
				throw new Error(`Product not found for packshot ${packshotId}`);
			}

			const productJson = (product.final_product_json || product.analyzed_product_json) as AnalyzeProductDirectResponse;
			if (!productJson) {
				throw new Error('Product must be analyzed first (no product JSON found)');
			}

			// Mark as processing
			packshot.status = GenerationStatus.PROCESSING;
			packshot.started_at = new Date();
			await this.packshotRepo.save(packshot);

			// Build reference images for Gemini
			const referenceImages: string[] = [];
			if (product.front_image_url) referenceImages.push(product.front_image_url);
			if (product.back_image_url) referenceImages.push(product.back_image_url);
			if (product.reference_images?.length) referenceImages.push(...product.reference_images);

			this.logger.log(`📦 [PACKSHOT] Reference images: ${referenceImages.length}`);

			// Build all 4 prompts
			const prompts = this.promptBuilderService.buildPackshotPrompts(
				productJson,
				packshot.hanger_mode,
				packshot.detail_1_focus || undefined,
				packshot.detail_2_focus || undefined,
			);

			// Save prompts and resolved detail focus areas
			packshot.prompts = prompts;
			packshot.detail_1_focus = prompts.detail_1_focus;
			packshot.detail_2_focus = prompts.detail_2_focus;
			await this.packshotRepo.save(packshot);

			// Emit initial progress
			this.generationGateway.emitProgress(packshotId, {
				progress_percent: 0,
				completed: 0,
				total: 4,
				elapsed_seconds: 0,
			});

			const startTime = Date.now();
			let completedCount = 0;

			// Map shot types to their prompts
			const shotPrompts: Record<PackshotShotType, string> = {
				front_packshot: prompts.front_packshot,
				back_packshot: prompts.back_packshot,
				detail_1: prompts.detail_1,
				detail_2: prompts.detail_2,
			};

			// URL column mapping
			const urlColumns: Record<PackshotShotType, keyof PackshotGeneration> = {
				front_packshot: 'front_packshot_url',
				back_packshot: 'back_packshot_url',
				detail_1: 'detail_1_url',
				detail_2: 'detail_2_url',
			};

			// Generate all 4 images in parallel
			const imagePromises = SHOT_TYPES.map(async (shotType, i) => {
				const prompt = shotPrompts[shotType];
				this.logger.log(`📦 [${i + 1}/4] Starting ${shotType}...`);

				this.generationGateway.emitVisualProcessing(packshotId, {
					type: shotType,
					index: i,
					status: 'processing',
				});

				try {
					const result = referenceImages.length > 0
						? await this.vertexImagenService.generateImageWithReference(
							prompt,
							referenceImages,
							'4:5',
							'4K',
						)
						: await this.vertexImagenService.generateImage(
							prompt,
							process.env.VERTEX_IMAGEN_MODEL || 'imagen-3.0-generate-002',
							'4:5',
							'4K',
						);

					let imageUrl: string | null = null;
					if (result.data) {
						try {
							const storedFile = await this.filesService.storeBase64Image(result.data, result.mimeType);
							imageUrl = storedFile.url;
						} catch (fileError: any) {
							this.logger.error(`❌ Save failed for ${shotType}: ${fileError.message}`);
							imageUrl = `data:${result.mimeType};base64,${result.data}`;
						}
					}

					// Update URL column directly
					const columnName = urlColumns[shotType];
					(packshot as any)[columnName] = imageUrl;
					completedCount++;
					packshot.completed_shots_count = completedCount;
					packshot.progress_percent = Math.round((completedCount / 4) * 100);
					await this.packshotRepo.save(packshot);

					const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
					this.generationGateway.emitVisualCompleted(packshotId, {
						type: shotType,
						index: i,
						image_url: imageUrl || '',
						generated_at: new Date().toISOString(),
						status: 'completed',
						prompt,
					});

					this.generationGateway.emitProgress(packshotId, {
						progress_percent: packshot.progress_percent,
						completed: completedCount,
						total: 4,
						elapsed_seconds: elapsedSeconds,
					});

					this.logger.log(`✅ [${i + 1}/4] ${shotType} completed!`);
					return { success: true, shotType };
				} catch (error: any) {
					this.logger.error(`❌ [${i + 1}/4] ${shotType} failed: ${error?.message}`);
					completedCount++;
					packshot.completed_shots_count = completedCount;
					packshot.progress_percent = Math.round((completedCount / 4) * 100);
					await this.packshotRepo.save(packshot);

					this.generationGateway.emitVisualCompleted(packshotId, {
						type: shotType,
						index: i,
						image_url: '',
						generated_at: new Date().toISOString(),
						status: 'failed',
						error: error?.message,
						prompt,
					});

					return { success: false, shotType, error: error?.message };
				}
			});

			const results = await Promise.allSettled(imagePromises);
			job.progress(100);

			// Determine final status
			const allResults = results.map(r => r.status === 'fulfilled' ? r.value : { success: false });
			const successCount = allResults.filter(r => r.success).length;
			const failCount = allResults.filter(r => !r.success).length;

			this.logger.log(`📦 [PACKSHOT] Results: ${successCount} success, ${failCount} failed`);

			if (failCount === 4) {
				packshot.status = GenerationStatus.FAILED;
				packshot.error = 'All 4 packshot images failed to generate';
			} else {
				packshot.status = GenerationStatus.COMPLETED;
				packshot.completed_at = new Date();
			}

			packshot.progress_percent = 100;
			await this.packshotRepo.save(packshot);

			this.generationGateway.emitComplete(packshotId, {
				status: packshot.status === GenerationStatus.FAILED ? 'failed' : 'completed',
				completed: successCount,
				total: 4,
				visuals: SHOT_TYPES.map((type, i) => ({
					type,
					index: i,
					status: allResults[i]?.success ? 'completed' : 'failed',
					image_url: (packshot as any)[urlColumns[type]] || '',
				})),
			});
		} catch (error: any) {
			this.logger.error(`📦 [PACKSHOT] Fatal error: ${error.message}`, error.stack);

			const packshot = await this.packshotRepo.findOne({ where: { id: packshotId } });
			if (packshot) {
				packshot.status = GenerationStatus.FAILED;
				packshot.error = error.message;
				await this.packshotRepo.save(packshot);
			}

			throw error;
		}
	}

	@OnQueueActive()
	onActive(job: Job) {
		this.logger.log(`📦 [PACKSHOT] Processing job ${job.id}`);
	}

	@OnQueueCompleted()
	onCompleted(job: Job) {
		this.logger.log(`📦 [PACKSHOT] Job ${job.id} completed`);
	}

	@OnQueueFailed()
	onFailed(job: Job, error: Error) {
		this.logger.error(`📦 [PACKSHOT] Job ${job.id} failed: ${error.message}`, error.stack);
	}
}
