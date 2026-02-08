import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdBrandsModule } from '../brands/ad-brands.module';
import { AdConceptsModule } from '../ad-concepts/ad-concepts.module';

/**
 * Generations Module - Phase 2: Ad Recreation
 *
 * Orchestrates ad generation using real Claude AI by combining:
 * - Brand Playbook (from AdBrandsModule)
 * - Concept Layout (from AdConceptsModule)
 * - Marketing Angle + Format (from constants)
 * - Claude API (via ConfigModule for CLAUDE_API_KEY)
 */
@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([AdGeneration]),
        AdBrandsModule,
        AdConceptsModule,
    ],
    controllers: [GenerationsController],
    providers: [GenerationsService],
    exports: [GenerationsService],
})
export class GenerationsModule {}
