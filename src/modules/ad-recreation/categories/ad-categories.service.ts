import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdCategory } from '../../../database/entities/Ad-Recreation/ad-category.entity';
import { AdCollection } from '../../../database/entities/Ad-Recreation/ad-collection.entity';
import { CreateAdCategoryDto, UpdateAdCategoryDto } from '../../../libs/dto/AdRecreation/categories';
import { AdCategoryMessage, AdCollectionMessage } from '../../../libs/messages';

@Injectable()
export class AdCategoriesService {
    private readonly logger = new Logger(AdCategoriesService.name);

    constructor(
        @InjectRepository(AdCategory)
        private categoriesRepository: Repository<AdCategory>,
        @InjectRepository(AdCollection)
        private collectionsRepository: Repository<AdCollection>,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // CREATE CATEGORY
    // ═══════════════════════════════════════════════════════════

    async create(userId: string, dto: CreateAdCategoryDto): Promise<AdCategory> {
        this.logger.log(`Creating Ad Category: ${dto.name} for user ${userId}`);

        // Verify collection ownership
        const collection = await this.collectionsRepository.findOne({ where: { id: dto.collection_id } });
        if (!collection) {
            throw new NotFoundException(AdCollectionMessage.COLLECTION_NOT_FOUND);
        }
        if (collection.user_id !== userId) {
            throw new ForbiddenException(AdCollectionMessage.COLLECTION_ACCESS_DENIED);
        }

        const category = this.categoriesRepository.create({
            ...dto,
            user_id: userId,
        });

        const saved = await this.categoriesRepository.save(category);
        this.logger.log(`Created Ad Category: ${saved.id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET CATEGORY BY ID
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdCategory> {
        const category = await this.categoriesRepository.findOne({
            where: { id },
            relations: ['products'],
        });

        if (!category) {
            throw new NotFoundException(AdCategoryMessage.CATEGORY_NOT_FOUND);
        }
        if (category.user_id !== userId) {
            throw new ForbiddenException(AdCategoryMessage.CATEGORY_ACCESS_DENIED);
        }

        return category;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL CATEGORIES
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string, collectionId?: string): Promise<AdCategory[]> {
        const where: any = { user_id: userId };
        if (collectionId) {
            where.collection_id = collectionId;
        }

        return this.categoriesRepository.find({
            where,
            relations: ['products'],
            order: { sort_order: 'ASC', created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE CATEGORY
    // ═══════════════════════════════════════════════════════════

    async update(id: string, userId: string, dto: UpdateAdCategoryDto): Promise<AdCategory> {
        const category = await this.findOne(id, userId);

        Object.assign(category, dto);
        const saved = await this.categoriesRepository.save(category);

        this.logger.log(`Updated Ad Category: ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE IMAGE
    // ═══════════════════════════════════════════════════════════

    async updateImage(id: string, userId: string, imageUrl: string): Promise<AdCategory> {
        const category = await this.findOne(id, userId);

        category.image_url = imageUrl;
        const saved = await this.categoriesRepository.save(category);

        this.logger.log(`Updated image for Ad Category: ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE CATEGORY
    // ═══════════════════════════════════════════════════════════

    async remove(id: string, userId: string): Promise<void> {
        const category = await this.findOne(id, userId);
        await this.categoriesRepository.remove(category);
        this.logger.log(`Deleted Ad Category: ${id}`);
    }
}
