import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { ImageGenerationService } from './image-generation.service';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdBrandsModule } from '../brands/ad-brands.module';
import { AdConceptsModule } from '../ad-concepts/ad-concepts.module';

/**
 * Generations Module - Phase 2: Ad Recreation
 *
 * Full ad generation pipeline:
 * - Claude AI for ad copy (Brand + Concept + Angle → headline/subheadline/cta/image_prompt)
 * - Gemini Imagen for image rendering (image_prompt → PNG file)
 */
@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([AdGeneration]),
        AdBrandsModule,
        AdConceptsModule,
    ],
    controllers: [GenerationsController],
    providers: [GenerationsService, ImageGenerationService],
    exports: [GenerationsService],
})
export class GenerationsModule {}
