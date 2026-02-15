import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdProductsService } from './ad-products.service';
import { AdProductsController } from './ad-products.controller';
import { AdProduct } from '../../../database/entities/Ad-Recreation/ad-product.entity';
import { AdCategory } from '../../../database/entities/Ad-Recreation/ad-category.entity';

/**
 * Ad Products Module
 *
 * Phase 2: Ad Recreation - Product Management
 * Handles product CRUD and image uploads within categories.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([AdProduct, AdCategory]),
    ],
    controllers: [AdProductsController],
    providers: [AdProductsService],
    exports: [AdProductsService],
})
export class AdProductsModule {}
