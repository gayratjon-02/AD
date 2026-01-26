import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { GenerationsService } from './generations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateGenerationDto, GenerateDto, UpdateGenerationDto, MergePromptsDto, UpdateMergedPromptsDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Generation } from '../database/entities/generation.entity';
import { MergedPrompts } from '../common/interfaces/merged-prompts.interface';

@Controller('generations')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
	constructor(private readonly generationsService: GenerationsService) {}

	@Post('createGeneration')
	async createGeneration(@CurrentUser() user: User, @Body() dto: CreateGenerationDto): Promise<Generation> {
		return this.generationsService.create(user.id, dto);
	}

	@Get('getAllGenerations')
	async getAllGenerations(
		@CurrentUser() user: User,
		@Query('product_id') productId?: string,
		@Query('collection_id') collectionId?: string,
		@Query('generation_type') generationType?: string,
		@Query('status') status?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	): Promise<{ items: Generation[]; total: number; page: number; limit: number }> {
		return this.generationsService.findAll(user.id, {
			product_id: productId,
			collection_id: collectionId,
			generation_type: generationType,
			status,
			page: page ? parseInt(page, 10) : undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		});
	}

	@Get('getGeneration/:id')
	async getGeneration(@Param('id') id: string, @CurrentUser() user: User): Promise<Generation> {
		return this.generationsService.getWithDetails(id, user.id);
	}

	/**
	 * STEP 3: Merge Product + DA (STEP 3)
	 * POST /api/generations/:id/merge
	 */
	@Post(':id/merge')
	async mergePrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() mergePromptsDto?: MergePromptsDto,
	): Promise<{ generation_id: string; merged_prompts: MergedPrompts; status: string; merged_at: string }> {
		const mergedPrompts = await this.generationsService.mergePrompts(id, user.id);
		return {
			generation_id: id,
			merged_prompts: mergedPrompts,
			status: 'merged',
			merged_at: new Date().toISOString(),
		};
	}

	/**
	 * STEP 6: Update Merged Prompts (User Edits)
	 * PUT /api/generations/:id/prompts
	 */
	@Post('updateMergedPrompts/:id')
	async updateMergedPrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateMergedPromptsDto: UpdateMergedPromptsDto,
	): Promise<{ merged_prompts: MergedPrompts; updated_at: string }> {
		const mergedPrompts = await this.generationsService.updatePrompts(id, user.id, updateMergedPromptsDto.prompts);
		return {
			merged_prompts: mergedPrompts,
			updated_at: new Date().toISOString(),
		};
	}

	/**
	 * STEP 6: Preview Merged Prompts (Before Generation)
	 * GET /api/generations/:id/prompts
	 */
	@Get('getPrompts/:id')
	async getPrompts(@Param('id') id: string, @CurrentUser() user: User): Promise<{
		generation_id: string;
		merged_prompts: MergedPrompts;
		product_json: any;
		da_json: any;
		can_edit: boolean;
	}> {
		const generation = await this.generationsService.getWithDetails(id, user.id);
		if (!generation.merged_prompts) {
			throw new BadRequestException('Prompts must be merged first');
		}
		return {
			generation_id: id,
			merged_prompts: generation.merged_prompts as MergedPrompts,
			product_json: generation.product.final_product_json || generation.product.analyzed_product_json,
			da_json: generation.collection.analyzed_da_json,
			can_edit: true,
		};
	}

	@Post(':id/generate')
	async generate(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: GenerateDto): Promise<Generation> {
		return this.generationsService.generate(id, user.id, dto);
	}

	@Post('reset/:id')
	async resetGeneration(@Param('id') id: string, @CurrentUser() user: User): Promise<Generation> {
		return this.generationsService.resetGeneration(id, user.id);
	}

	@Get('debug/config')
	async debugConfig(@CurrentUser() user: User): Promise<{
		gemini_configured: boolean;
		model: string;
		redis_connected: boolean;
	}> {
		return this.generationsService.debugConfig();
	}

	@Post('debug/test-sse/:id')
	@Public() // Make this endpoint public for testing
	async testSSE(@Param('id') generationId: string): Promise<{ message: string }> {
		const testUserId = 'test-user-123'; // Use a test user ID
		console.log(`🧪 Testing SSE events for generation ${generationId}, user ${testUserId}`);
		
		// Simulate 6 images being generated with SSE events
		for (let i = 0; i < 6; i++) {
			setTimeout(() => {
				console.log(`🎯 Test: Emitting processing event for visual ${i}`);
				this.generationsService.emitVisualProcessing(generationId, testUserId, i, `test-type-${i}`);
			}, i * 1000); // Each event 1 second apart
			
			setTimeout(() => {
				console.log(`🎯 Test: Emitting completed event for visual ${i}`);
				this.generationsService.emitVisualCompleted(generationId, testUserId, i, {
					type: `test-type-${i}`,
					status: 'completed',
					image_url: `data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`,
					generated_at: new Date().toISOString(),
					prompt: `Test prompt for image ${i}`
				});
			}, (i * 1000) + 500); // Completion 500ms after processing
		}
		
		return { message: `Test SSE events started for generation ${generationId}` };
	}

	@Post('debug/test-job')
	async testJob(@CurrentUser() user: User): Promise<{ message: string }> {
		return this.generationsService.testJob();
	}

	@Post('debug/clear-queue')
	async clearQueue(@CurrentUser() user: User): Promise<{ message: string }> {
		return this.generationsService.clearQueue();
	}

	@Get('getProgress/:id')
	async getProgress(@Param('id') id: string, @CurrentUser() user: User) {
		return this.generationsService.getGenerationProgress(id, user.id);
	}

	@Get('download/:id')
	async download(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		// Check if pre-generated ZIP exists
		const preGeneratedZip = await this.generationsService.getPreGeneratedZip(id, user.id);
		
		if (preGeneratedZip) {
			// Use pre-generated ZIP for instant download
			res.set({
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${preGeneratedZip.filename}"`,
			});
			return new StreamableFile(preGeneratedZip.fileStream);
		}

		// Fallback: generate on-demand (slower)
		const { archive, filename } = await this.generationsService.createDownloadArchive(id, user.id);

		res.set({
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
		});

		return new StreamableFile(archive);
	}

	@Post(':generationId/visual/:index/retry')
	async retryVisual(
		@Param('generationId') generationId: string,
		@Param('index') index: string,
		@CurrentUser() user: User,
		@Body() dto?: { model?: string },
	): Promise<Generation> {
		const visualIndex = parseInt(index, 10);
		if (isNaN(visualIndex) || visualIndex < 0) {
			throw new BadRequestException('Invalid visual index');
		}

		return this.generationsService.retryVisual(generationId, user.id, visualIndex, dto?.model);
	}
}
