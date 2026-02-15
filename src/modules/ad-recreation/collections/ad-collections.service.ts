import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdCollection } from '../../../database/entities/Ad-Recreation/ad-collection.entity';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import { CreateAdCollectionDto } from '../../../libs/dto/AdRecreation/collections';
import { UpdateAdCollectionDto } from '../../../libs/dto/AdRecreation/collections';
import { AdCollectionMessage } from '../../../libs/messages';
import { AdBrandMessage } from '../../../libs/messages';

@Injectable()
export class AdCollectionsService {
    private readonly logger = new Logger(AdCollectionsService.name);

    constructor(
        @InjectRepository(AdCollection)
        private collectionsRepository: Repository<AdCollection>,
        @InjectRepository(AdBrand)
        private brandsRepository: Repository<AdBrand>,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // CREATE COLLECTION
    // ═══════════════════════════════════════════════════════════

    async create(userId: string, dto: CreateAdCollectionDto): Promise<AdCollection> {
        this.logger.log(`Creating Ad Collection: ${dto.name} for user ${userId}`);

        // Verify brand ownership
        const brand = await this.brandsRepository.findOne({ where: { id: dto.brand_id } });
        if (!brand) {
            throw new NotFoundException(AdBrandMessage.BRAND_NOT_FOUND);
        }
        if (brand.user_id !== userId) {
            throw new ForbiddenException(AdBrandMessage.BRAND_ACCESS_DENIED);
        }

        const collection = this.collectionsRepository.create({
            ...dto,
            user_id: userId,
        });

        const saved = await this.collectionsRepository.save(collection);
        this.logger.log(`Created Ad Collection: ${saved.id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET COLLECTION BY ID
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdCollection> {
        const collection = await this.collectionsRepository.findOne({
            where: { id },
            relations: ['categories'],
        });

        if (!collection) {
            throw new NotFoundException(AdCollectionMessage.COLLECTION_NOT_FOUND);
        }
        if (collection.user_id !== userId) {
            throw new ForbiddenException(AdCollectionMessage.COLLECTION_ACCESS_DENIED);
        }

        return collection;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL COLLECTIONS
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string, brandId?: string): Promise<AdCollection[]> {
        const where: any = { user_id: userId };
        if (brandId) {
            where.brand_id = brandId;
        }

        return this.collectionsRepository.find({
            where,
            relations: ['categories'],
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE COLLECTION
    // ═══════════════════════════════════════════════════════════

    async update(id: string, userId: string, dto: UpdateAdCollectionDto): Promise<AdCollection> {
        const collection = await this.findOne(id, userId);

        Object.assign(collection, dto);
        const saved = await this.collectionsRepository.save(collection);

        this.logger.log(`Updated Ad Collection: ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE COVER IMAGE
    // ═══════════════════════════════════════════════════════════

    async updateCoverImage(id: string, userId: string, coverImageUrl: string): Promise<AdCollection> {
        const collection = await this.findOne(id, userId);

        collection.cover_image_url = coverImageUrl;
        const saved = await this.collectionsRepository.save(collection);

        this.logger.log(`Updated cover image for Ad Collection: ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE COLLECTION
    // ═══════════════════════════════════════════════════════════

    async remove(id: string, userId: string): Promise<void> {
        const collection = await this.findOne(id, userId);
        await this.collectionsRepository.remove(collection);
        this.logger.log(`Deleted Ad Collection: ${id}`);
    }
}
