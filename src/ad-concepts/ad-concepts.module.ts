import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdConceptsService } from './ad-concepts.service';
import { AdConceptsController } from './ad-concepts.controller';
import { AdConcept } from '../database/entities/Ad-Recreation/ad-concept.entity';

/**
 * Ad Concepts Module
 *
 * Phase 2: Ad Recreation - Concept Analysis
 * Handles image upload, Claude Vision analysis, and concept storage.
 */
@Module({
    imports: [TypeOrmModule.forFeature([AdConcept])],
    controllers: [AdConceptsController],
    providers: [AdConceptsService],
    exports: [AdConceptsService],
})
export class AdConceptsModule {}
