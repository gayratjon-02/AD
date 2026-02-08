import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdBrandsModule } from '../brands/ad-brands.module';
import { AdConceptsModule } from '../ad-concepts/ad-concepts.module';

/**
 * Generations Module - Phase 2: Ad Recreation
 *
 * Orchestrates ad generation by combining:
 * - Brand Playbook (from AdBrandsModule)
 * - Concept Layout (from AdConceptsModule)
 * - Marketing Angle + Format (from constants)
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([AdGeneration]),
        AdBrandsModule,
        AdConceptsModule,
    ],
    controllers: [GenerationsController],
    providers: [GenerationsService],
    exports: [GenerationsService],
})
export class GenerationsModule {}
