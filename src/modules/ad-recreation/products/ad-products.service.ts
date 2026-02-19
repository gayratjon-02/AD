import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdProduct } from '../../../database/entities/Ad-Recreation/ad-product.entity';
import { AdCategory } from '../../../database/entities/Ad-Recreation/ad-category.entity';
import { CreateAdProductDto, UpdateAdProductDto } from '../../../libs/dto/AdRecreation/products';
import { AdProductMessage, AdCategoryMessage } from '../../../libs/messages';
import { ClaudeService } from '../../../ai/claude.service';

@Injectable()
export class AdProductsService {
    private readonly logger = new Logger(AdProductsService.name);

    constructor(
        @InjectRepository(AdProduct)
        private productsRepository: Repository<AdProduct>,
        @InjectRepository(AdCategory)
        private categoriesRepository: Repository<AdCategory>,
        private readonly claudeService: ClaudeService,
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

    // ═══════════════════════════════════════════════════════════
    // ANALYZE PRODUCT (Single Reference Image)
    // ═══════════════════════════════════════════════════════════

    /**
     * Accepts a single reference image URL, creates an AdProduct record,
     * analyzes it with Claude (same quality as Product Visuals), and
     * returns the product_id + full analysis JSON for use in generation.
     */
    async analyzeProductDirect(
        userId: string,
        referenceImageUrl: string,
    ): Promise<{
        product_id: string;
        image_url: string;
        analysis: Record<string, any>;
    }> {
        if (!referenceImageUrl) {
            throw new BadRequestException(AdProductMessage.REFERENCE_IMAGE_REQUIRED);
        }

        this.logger.log(`🔍 Analyzing Ad product image for user ${userId}`);

        // Analyze with Claude — treat the reference image as the front image
        const analysis = await this.claudeService.analyzeProductDirect({
            frontImages: [referenceImageUrl],
            backImages: [],
            referenceImages: [],
        });

        // Create product record without requiring a category
        // category_id is nullable for ad-recreation direct uploads
        const partial: Partial<AdProduct> = {
            user_id: userId,
            name: (analysis as any).general_info?.product_name || 'Ad Reference Product',
            front_image_url: referenceImageUrl,
            analyzed_product_json: analysis as unknown as Record<string, any>,
        };
        const product = this.productsRepository.create(partial as AdProduct);
        const saved: AdProduct = await this.productsRepository.save(product);
        this.logger.log(`💾 Ad Product analyzed & saved: ${saved.id}`);

        return {
            product_id: saved.id,
            image_url: referenceImageUrl,
            analysis: analysis as unknown as Record<string, any>,
        };
    }
}
