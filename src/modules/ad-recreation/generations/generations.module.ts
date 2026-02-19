import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdProduct } from '../../../database/entities/Ad-Recreation/ad-product.entity';
import { AdBrandsModule } from '../brands/ad-brands.module';
import { AdConceptsModule } from '../ad-concepts/ad-concepts.module';
import { AiModule } from '../../../ai/ai.module';
import { Product } from '../../../database/entities/Product-Visuals/product.entity';
import { GenerationsModule as ProductVisualsGenerationsModule } from '../../../generations/generations.module';
import { FilesModule } from '../../../files/files.module';

/**
 * Generations Module - Phase 2: Ad Recreation
 *
 * Full ad generation pipeline:
 * - Claude AI for ad copy (Brand + Concept + Angle → headline/subheadline/cta/image_prompt)
 * - Gemini for image rendering (image_prompt → PNG file)
 * - Socket.IO for real-time image streaming via GenerationGateway
 */
@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([AdGeneration, Product, AdProduct]),
        AdBrandsModule,
        AdConceptsModule,
        AiModule, // Provides GeminiService for image generation
        ProductVisualsGenerationsModule, // Provides GenerationGateway for real-time Socket.IO events
        FilesModule, // Provides FilesService for local/S3 image storage
    ],
    controllers: [GenerationsController],
    providers: [GenerationsService],
    exports: [GenerationsService],
})
export class GenerationsModule { }

