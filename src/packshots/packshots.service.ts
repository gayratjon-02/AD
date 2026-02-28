import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PackshotGeneration } from '../database/entities/Product-Visuals/packshot-generation.entity';
import { Product } from '../database/entities/Product-Visuals/product.entity';
import { CreatePackshotDto } from '../libs/dto/packshot';
import { NotFoundMessage, PermissionMessage, GenerationStatus } from '../libs/enums';
import { PackshotJobData } from './packshot.processor';

@Injectable()
export class PackshotsService {
	private readonly logger = new Logger(PackshotsService.name);

	constructor(
		@InjectRepository(PackshotGeneration)
		private readonly packshotRepo: Repository<PackshotGeneration>,
		@InjectRepository(Product)
		private readonly productRepo: Repository<Product>,
		@InjectQueue('packshot')
		private readonly packshotQueue: Queue<PackshotJobData>,
	) {}

	async create(userId: string, dto: CreatePackshotDto): Promise<PackshotGeneration> {
		// Validate product exists and user owns it
		const product = await this.productRepo.findOne({
			where: { id: dto.product_id },
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		if (product.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		// Check product has been analyzed
		const productJson = product.final_product_json || product.analyzed_product_json;
		if (!productJson) {
			throw new BadRequestException('Product must be analyzed before generating packshots');
		}

		// Create packshot generation record
		const packshot = this.packshotRepo.create({
			product_id: dto.product_id,
			user_id: userId,
			hanger_mode: dto.hanger_mode ?? true,
			detail_1_focus: dto.detail_1_focus || null,
			detail_2_focus: dto.detail_2_focus || null,
			status: GenerationStatus.PENDING,
		});

		const saved = await this.packshotRepo.save(packshot);
		this.logger.log(`📦 Created packshot ${saved.id} for product ${dto.product_id}`);

		// Add to Bull queue
		await this.packshotQueue.add({ packshotId: saved.id });
		this.logger.log(`📦 Queued packshot job for ${saved.id}`);

		return saved;
	}

	async findAll(userId: string): Promise<PackshotGeneration[]> {
		return this.packshotRepo.find({
			where: { user_id: userId },
			order: { created_at: 'DESC' },
			relations: ['product'],
		});
	}

	async findOne(userId: string, id: string): Promise<PackshotGeneration> {
		const packshot = await this.packshotRepo.findOne({
			where: { id },
			relations: ['product'],
		});

		if (!packshot) {
			throw new NotFoundException(NotFoundMessage.PACKSHOT_NOT_FOUND);
		}

		if (packshot.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return packshot;
	}

	async findByProduct(userId: string, productId: string): Promise<PackshotGeneration[]> {
		// Verify product ownership
		const product = await this.productRepo.findOne({ where: { id: productId } });
		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}
		if (product.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return this.packshotRepo.find({
			where: { product_id: productId, user_id: userId },
			order: { created_at: 'DESC' },
		});
	}
}
