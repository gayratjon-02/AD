import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdCategoriesService } from './ad-categories.service';
import { AdCategoriesController } from './ad-categories.controller';
import { AdCategory } from '../../../database/entities/Ad-Recreation/ad-category.entity';
import { AdCollection } from '../../../database/entities/Ad-Recreation/ad-collection.entity';

/**
 * Ad Categories Module
 *
 * Phase 2: Ad Recreation - Category Management
 * Handles category CRUD and image uploads within collections.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([AdCategory, AdCollection]),
    ],
    controllers: [AdCategoriesController],
    providers: [AdCategoriesService],
    exports: [AdCategoriesService],
})
export class AdCategoriesModule {}
