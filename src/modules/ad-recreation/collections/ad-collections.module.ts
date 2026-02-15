import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdCollectionsService } from './ad-collections.service';
import { AdCollectionsController } from './ad-collections.controller';
import { AdCollection } from '../../../database/entities/Ad-Recreation/ad-collection.entity';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';

/**
 * Ad Collections Module
 *
 * Phase 2: Ad Recreation - Collection Management
 * Handles collection CRUD and cover image uploads.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([AdCollection, AdBrand]),
    ],
    controllers: [AdCollectionsController],
    providers: [AdCollectionsService],
    exports: [AdCollectionsService],
})
export class AdCollectionsModule {}
