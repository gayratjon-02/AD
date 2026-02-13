import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdBrandsModule } from '../brands/ad-brands.module';
import { AdConceptsModule } from '../ad-concepts/ad-concepts.module';
import { AiModule } from '../../../ai/ai.module';
import { Product } from '../../../database/entities/Product-Visuals/product.entity';

/**
 * Generations Module - Phase 2: Ad Recreation
 *
 * Full ad generation pipeline:
 * - Claude AI for ad copy (Brand + Concept + Angle → headline/subheadline/cta/image_prompt)
 * - Gemini for image rendering (image_prompt → PNG file)
 */
@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([AdGeneration, Product]),
        AdBrandsModule,
        AdConceptsModule,
        AiModule, // Provides GeminiService for image generation
    ],
    controllers: [GenerationsController],
    providers: [GenerationsService],
    exports: [GenerationsService],
})
export class GenerationsModule { }

