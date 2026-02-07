import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdConcept } from '../database/entities/Ad-Recreation/ad-concept.entity';
import { AdConceptAnalysis } from '../libs/types/AdRecreation';
import { AdConceptMessage } from '../libs/messages';

/**
 * Ad Concepts Service - Phase 2: Ad Recreation
 *
 * Handles image upload analysis and database persistence
 * for competitor ad concept analysis.
 */
@Injectable()
export class AdConceptsService {
    private readonly logger = new Logger(AdConceptsService.name);

    constructor(
        @InjectRepository(AdConcept)
        private adConceptsRepository: Repository<AdConcept>,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // ANALYZE CONCEPT
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyze an uploaded ad image and save the concept record
     */
    async analyze(userId: string, imageUrl: string): Promise<AdConcept> {
        this.logger.log(`Analyzing concept for user ${userId}: ${imageUrl}`);

        // Mock Claude Vision analysis
        // TODO: Replace with actual ClaudeService.analyzeImage() call
        const analysisResult = await this.mockClaudeAnalysis(imageUrl);

        const concept = this.adConceptsRepository.create({
            user_id: userId,
            original_image_url: imageUrl,
            analysis_json: analysisResult,
        });

        const saved = await this.adConceptsRepository.save(concept);
        this.logger.log(`Saved Ad Concept: ${saved.id}`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET CONCEPT BY ID (with ownership check)
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdConcept> {
        const concept = await this.adConceptsRepository.findOne({
            where: { id },
        });

        if (!concept) {
            throw new NotFoundException(AdConceptMessage.CONCEPT_NOT_FOUND);
        }

        if (concept.user_id !== userId) {
            throw new ForbiddenException(AdConceptMessage.CONCEPT_ACCESS_DENIED);
        }

        return concept;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL CONCEPTS FOR USER
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string): Promise<AdConcept[]> {
        return this.adConceptsRepository.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // MOCK CLAUDE VISION ANALYSIS
    // TODO: Replace with real Claude Vision integration
    // ═══════════════════════════════════════════════════════════

    private async mockClaudeAnalysis(imageUrl: string): Promise<AdConceptAnalysis> {
        this.logger.log(`[MOCK] Analyzing image: ${imageUrl}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            layout: {
                type: 'split_screen_vertical',
                format: '9:16',
                zones: [
                    {
                        id: 'zone_1',
                        type: 'headline',
                        y_start: 50,
                        y_end: 300,
                        content_description: 'Bold text at top',
                    },
                    {
                        id: 'zone_2',
                        type: 'visual',
                        y_start: 300,
                        y_end: 1200,
                        content_description: 'Product hero image',
                    },
                    {
                        id: 'zone_3',
                        type: 'cta',
                        y_start: 1200,
                        y_end: 1500,
                        content_description: 'Button at bottom',
                    },
                ],
            },
            visual_style: {
                mood: 'minimalist_clean',
                background_code: '#F5F5F5',
                lighting: 'soft_studio',
            },
            typography: {
                primary_font_style: 'Sans Serif Bold',
                secondary_font_style: 'Sans Serif Regular',
            },
        };
    }
}
