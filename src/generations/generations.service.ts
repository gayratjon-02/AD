import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import archiver from 'archiver';

import { Generation } from '../database/entities/generation.entity';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { GeminiService } from '../ai/gemini.service';

import { CreateGenerationDto, GenerateDto, UpdateGenerationDto } from '../libs/dto';
import { ErrorMessage, GenerationMessage, GenerationStatus, NotFoundMessage, PermissionMessage } from '../libs/enums';

type GenerationFilters = {
	product_id?: string;
	collection_id?: string;
	generation_type?: string;
	status?: string;
	page?: number;
	limit?: number;
};

@Injectable()
export class GenerationsService {
	constructor(
		@InjectRepository(Generation)
		private readonly generationsRepository: Repository<Generation>,

		@InjectRepository(Product)
		private readonly productsRepository: Repository<Product>,

		@InjectRepository(Collection)
		private readonly collectionsRepository: Repository<Collection>,

		private readonly geminiService: GeminiService,
	) {}

	async create(userId: string, dto: CreateGenerationDto): Promise<Generation> {
		const product = await this.productsRepository.findOne({
			where: { id: dto.product_id },
			relations: ['collection', 'collection.brand'],
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		if (product.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		if (product.collection_id !== dto.collection_id) {
			throw new BadRequestException(ErrorMessage.BAD_REQUEST);
		}

		const collection = await this.collectionsRepository.findOne({
			where: { id: dto.collection_id },
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		const generation = this.generationsRepository.create({
			product_id: dto.product_id,
			collection_id: dto.collection_id,
			user_id: userId,
			generation_type: dto.generation_type,
			aspect_ratio: dto.aspect_ratio || undefined,
			resolution: dto.resolution || undefined,
		});

		return this.generationsRepository.save(generation);
	}

	async findAll(
		userId: string,
		filters: GenerationFilters,
	): Promise<{ items: Generation[]; total: number; page: number; limit: number }> {
		const page = filters.page && filters.page > 0 ? filters.page : 1;
		const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
		const skip = (page - 1) * limit;

		const query = this.generationsRepository
			.createQueryBuilder('generation')
			.where('generation.user_id = :userId', { userId })
			.orderBy('generation.created_at', 'DESC')
			.skip(skip)
			.take(limit);

		if (filters.product_id) {
			query.andWhere('generation.product_id = :productId', {
				productId: filters.product_id,
			});
		}

		if (filters.collection_id) {
			query.andWhere('generation.collection_id = :collectionId', {
				collectionId: filters.collection_id,
			});
		}

		if (filters.generation_type) {
			query.andWhere('generation.generation_type = :generationType', {
				generationType: filters.generation_type,
			});
		}

		if (filters.status) {
			query.andWhere('generation.status = :status', {
				status: filters.status,
			});
		}

		const [items, total] = await query.getManyAndCount();
		return { items, total, page, limit };
	}

	async findOne(id: string, userId: string): Promise<Generation> {
		const generation = await this.generationsRepository.findOne({
			where: { id, user_id: userId },
		});

		if (!generation) {
			throw new NotFoundException(NotFoundMessage.GENERATION_NOT_FOUND);
		}

		return generation;
	}

	async previewPrompts(id: string, userId: string): Promise<{ prompts: string[] }> {
		const generation = await this.findOne(id, userId);
		const prompts = this.extractPrompts(generation.visuals || []);
		return { prompts };
	}

	async updatePrompts(id: string, userId: string, dto: UpdateGenerationDto): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		if (!dto.prompts || dto.prompts.length === 0) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		generation.visuals = dto.prompts;
		generation.status = GenerationStatus.PENDING;
		generation.completed_at = null;

		return this.generationsRepository.save(generation);
	}

	async generate(id: string, userId: string, dto: GenerateDto): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		if (generation.status === GenerationStatus.PROCESSING) {
			throw new BadRequestException(GenerationMessage.GENERATION_IN_PROGRESS);
		}

		const prompts = dto.prompts?.length ? dto.prompts : this.extractPrompts(generation.visuals || []);

		if (!prompts.length) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		generation.status = GenerationStatus.PROCESSING;
		await this.generationsRepository.save(generation);

		try {
			const results = await this.geminiService.generateBatch(prompts, dto.model);

			generation.visuals = results.map((result, index) => ({
				prompt: prompts[index],
				mimeType: result.mimeType,
				data: result.data,
				text: result.text,
				generated_at: new Date().toISOString(),
			}));

			generation.status = GenerationStatus.COMPLETED;
			generation.completed_at = new Date();

			return await this.generationsRepository.save(generation);
		} catch (error) {
			generation.status = GenerationStatus.FAILED;
			await this.generationsRepository.save(generation);

			throw new InternalServerErrorException(GenerationMessage.GENERATION_FAILED);
		}
	}

	async createDownloadArchive(id: string, userId: string): Promise<{ archive: archiver.Archiver; filename: string }> {
		const generation = await this.findOne(id, userId);
		const items = this.extractGeneratedImages(generation.visuals || []);

		if (!items.length) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		const archive = archiver('zip', { zlib: { level: 9 } });

		items.forEach((item, index) => {
			const ext = this.extensionFromMime(item.mimeType);
			const buffer = Buffer.from(item.data, 'base64');

			archive.append(buffer, { name: `image-${index + 1}.${ext}` });
		});

		archive.finalize();

		return {
			archive,
			filename: `generation-${generation.id}.zip`,
		};
	}

	private extractPrompts(visuals: any[]): string[] {
		return visuals
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}

				if (item && typeof item === 'object') {
					return item.prompt || item.text || item.description || null;
				}

				return null;
			})
			.filter(Boolean) as string[];
	}

	private extractGeneratedImages(visuals: any[]): Array<{ data: string; mimeType: string }> {
		return visuals
			.map((item) => {
				if (item && typeof item === 'object' && item.data && item.mimeType) {
					return { data: item.data, mimeType: item.mimeType };
				}
				return null;
			})
			.filter(Boolean) as Array<{ data: string; mimeType: string }>;
	}

	private extensionFromMime(mimeType: string): string {
		switch (mimeType) {
			case 'image/png':
				return 'png';
			case 'image/webp':
				return 'webp';
			case 'image/gif':
				return 'gif';
			case 'image/jpeg':
			default:
				return 'jpg';
		}
	}
}
