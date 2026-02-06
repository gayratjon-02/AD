import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdBrandsService } from './ad-brands.service';
import { AdBrandsController } from './ad-brands.controller';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';

/**
 * Ad Brands Module
 * 
 * Phase 2: Ad Recreation - Brand Foundation
 * Handles brand creation, asset uploads, and playbook analysis.
 */
@Module({
    imports: [TypeOrmModule.forFeature([AdBrand])],
    controllers: [AdBrandsController],
    providers: [AdBrandsService],
    exports: [AdBrandsService],
})
export class AdBrandsModule { }
