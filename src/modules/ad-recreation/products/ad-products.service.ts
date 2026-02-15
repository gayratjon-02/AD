import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdProduct } from '../../../database/entities/Ad-Recreation/ad-product.entity';
import { AdCategory } from '../../../database/entities/Ad-Recreation/ad-category.entity';
import { CreateAdProductDto, UpdateAdProductDto } from '../../../libs/dto/AdRecreation/products';
import { AdProductMessage, AdCategoryMessage } from '../../../libs/messages';

@Injectable()
export class AdProductsService {
    private readonly logger = new Logger(AdProductsService.name);

    constructor(
        @InjectRepository(AdProduct)
        private productsRepository: Repository<AdProduct>,
        @InjectRepository(AdCategory)
        private categoriesRepository: Repository<AdCategory>,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // CREATE PRODUCT
    // ═══════════════════════════════════════════════════════════

    async create(userId: string, dto: CreateAdProductDto): Promise<AdProduct> {
        this.logger.log(`Creating Ad Product: ${dto.name} for user ${userId}`);

        // Verify category ownership
        const category = await this.categoriesRepository.findOne({ where: { id: dto.category_id } });
        if (!category) {
            throw new NotFoundException(AdCategoryMessage.CATEGORY_NOT_FOUND);
        }
        if (category.user_id !== userId) {
            throw new ForbiddenException(AdCategoryMessage.CATEGORY_ACCESS_DENIED);
        }

        const product = this.productsRepository.create({
            ...dto,
            user_id: userId,
        });

        const saved = await this.productsRepository.save(product);
        this.logger.log(`Created Ad Product: ${saved.id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET PRODUCT BY ID
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdProduct> {
        const product = await this.productsRepository.findOne({
            where: { id },
            relations: ['generations'],
        });

        if (!product) {
            throw new NotFoundException(AdProductMessage.PRODUCT_NOT_FOUND);
        }
        if (product.user_id !== userId) {
            throw new ForbiddenException(AdProductMessage.PRODUCT_ACCESS_DENIED);
        }

        return product;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL PRODUCTS
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string, categoryId?: string): Promise<AdProduct[]> {
        const where: any = { user_id: userId };
        if (categoryId) {
            where.category_id = categoryId;
        }

        return this.productsRepository.find({
            where,
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE PRODUCT
    // ═══════════════════════════════════════════════════════════

    async update(id: string, userId: string, dto: UpdateAdProductDto): Promise<AdProduct> {
        const product = await this.findOne(id, userId);

        Object.assign(product, dto);
        const saved = await this.productsRepository.save(product);

        this.logger.log(`Updated Ad Product: ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE IMAGES
    // ═══════════════════════════════════════════════════════════

    async updateImages(
        id: string,
        userId: string,
        frontImageUrl?: string,
        backImageUrl?: string,
    ): Promise<AdProduct> {
        const product = await this.findOne(id, userId);

        if (frontImageUrl) product.front_image_url = frontImageUrl;
        if (backImageUrl) product.back_image_url = backImageUrl;

        const saved = await this.productsRepository.save(product);
        this.logger.log(`Updated images for Ad Product: ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE PRODUCT
    // ═══════════════════════════════════════════════════════════

    async remove(id: string, userId: string): Promise<void> {
        const product = await this.findOne(id, userId);
        await this.productsRepository.remove(product);
        this.logger.log(`Deleted Ad Product: ${id}`);
    }
}
