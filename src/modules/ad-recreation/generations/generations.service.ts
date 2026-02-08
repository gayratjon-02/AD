import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdBrandsService } from '../brands/ad-brands.service';
import { AdConceptsService } from '../ad-concepts/ad-concepts.service';
import { MARKETING_ANGLES } from '../configurations/constants/marketing-angles';
import { AD_FORMATS } from '../configurations/constants/ad-formats';
import { AdGenerationStatus } from '../../../libs/enums/AdRecreationEnums';
import { AdGenerationMessage } from '../../../libs/messages';
import { GenerateAdDto } from './dto/generate-ad.dto';

// ═══════════════════════════════════════════════════════════
// MOCK AD COPY RESULT TYPE
// ═══════════════════════════════════════════════════════════

interface AdCopyResult {
    headline: string;
    subheadline: string;
    cta: string;
    image_prompt: string;
}

/**
 * Generations Service - Phase 2: Ad Recreation
 *
 * Orchestrates the ad generation pipeline:
 * Brand Playbook + Concept Layout + Marketing Angle → Ad Copy
 */
@Injectable()
export class GenerationsService {
    private readonly logger = new Logger(GenerationsService.name);

    constructor(
        @InjectRepository(AdGeneration)
        private generationsRepository: Repository<AdGeneration>,
        private readonly adBrandsService: AdBrandsService,
        private readonly adConceptsService: AdConceptsService,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // GENERATE AD (main entry point)
    // ═══════════════════════════════════════════════════════════

    async generateAd(
        userId: string,
        dto: GenerateAdDto,
    ): Promise<{ generation: AdGeneration; ad_copy: AdCopyResult }> {
        this.logger.log(`Starting ad generation for user ${userId}`);

        // Step 1: Validate marketing angle and format
        const angle = MARKETING_ANGLES.find((a) => a.id === dto.marketing_angle_id);
        if (!angle) {
            throw new BadRequestException(AdGenerationMessage.INVALID_MARKETING_ANGLE);
        }

        const format = AD_FORMATS.find((f) => f.id === dto.format_id);
        if (!format) {
            throw new BadRequestException(AdGenerationMessage.INVALID_AD_FORMAT);
        }

        // Step 2: Fetch brand and concept (with ownership checks)
        const brand = await this.adBrandsService.findOne(dto.brand_id, userId);
        const concept = await this.adConceptsService.findOne(dto.concept_id, userId);

        // Step 3: Verify brand has a playbook
        if (!brand.brand_playbook) {
            throw new BadRequestException(AdGenerationMessage.BRAND_PLAYBOOK_REQUIRED);
        }

        // Step 4: Create generation record
        const generation = this.generationsRepository.create({
            user_id: userId,
            brand_id: dto.brand_id,
            concept_id: dto.concept_id,
            selected_angles: [dto.marketing_angle_id],
            selected_formats: [dto.format_id],
            status: AdGenerationStatus.PROCESSING,
            progress: 10,
        });
        const saved = await this.generationsRepository.save(generation);

        // Step 5: Build prompt and call AI (mock for now)
        let adCopy: AdCopyResult;
        try {
            const prompt = this.buildPrompt(
                brand.brand_playbook,
                concept.analysis_json,
                angle,
                format,
                dto.product_input,
            );

            this.logger.log(`Prompt built (${prompt.length} chars), calling AI...`);

            adCopy = this.mockAiResponse(angle.label, format.label, dto.product_input);

            // Update generation status to completed
            saved.status = AdGenerationStatus.COMPLETED;
            saved.progress = 100;
            saved.completed_at = new Date();
            await this.generationsRepository.save(saved);

            this.logger.log(`Ad generation completed: ${saved.id}`);
        } catch (error) {
            saved.status = AdGenerationStatus.FAILED;
            saved.failure_reason = error.message;
            await this.generationsRepository.save(saved);

            this.logger.error(`Ad generation failed: ${error.message}`);
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        return { generation: saved, ad_copy: adCopy };
    }

    // ═══════════════════════════════════════════════════════════
    // GET GENERATION BY ID (with ownership check)
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdGeneration> {
        const generation = await this.generationsRepository.findOne({
            where: { id },
        });

        if (!generation) {
            throw new NotFoundException(AdGenerationMessage.GENERATION_NOT_FOUND);
        }

        if (generation.user_id !== userId) {
            throw new ForbiddenException(AdGenerationMessage.GENERATION_ACCESS_DENIED);
        }

        return generation;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL GENERATIONS FOR USER
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string): Promise<AdGeneration[]> {
        return this.generationsRepository.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDER
    // ═══════════════════════════════════════════════════════════

    private buildPrompt(
        playbook: any,
        conceptAnalysis: any,
        angle: { id: string; label: string; description: string },
        format: { id: string; label: string; ratio: string; dimensions: string },
        productInput: string,
    ): string {
        const zones = conceptAnalysis?.layout?.zones || [];
        const zoneDescriptions = zones
            .map((z: any) => `  - ${z.id}: ${z.content_type} (${z.y_start}%-${z.y_end}%) → ${z.description}`)
            .join('\n');

        return `
=== AD GENERATION BRIEF ===

BRAND IDENTITY:
- Tone: ${playbook.tone_of_voice?.style || 'N/A'}
- Keywords: ${playbook.tone_of_voice?.keywords?.join(', ') || 'N/A'}
- Primary Color: ${playbook.colors?.primary || 'N/A'}
- Secondary Color: ${playbook.colors?.secondary || 'N/A'}
- Heading Font: ${playbook.fonts?.heading || 'N/A'}

LAYOUT PATTERN (from competitor analysis):
- Type: ${conceptAnalysis?.layout?.type || 'N/A'}
- Format: ${format.label} (${format.ratio}, ${format.dimensions})
- Mood: ${conceptAnalysis?.visual_style?.mood || 'N/A'}
- Zones:
${zoneDescriptions || '  (no zones detected)'}

MARKETING ANGLE:
- Strategy: ${angle.label}
- Description: ${angle.description}

PRODUCT INFO:
${productInput}

TASK:
Generate ad copy for this product using the above layout pattern and marketing angle.
Return JSON with: headline, subheadline, cta, image_prompt.
`.trim();
    }

    // ═══════════════════════════════════════════════════════════
    // MOCK AI RESPONSE (will be replaced with real AI call)
    // ═══════════════════════════════════════════════════════════

    private mockAiResponse(
        angleLabel: string,
        formatLabel: string,
        productInput: string,
    ): AdCopyResult {
        const productName = productInput.split(' ').slice(0, 3).join(' ');

        return {
            headline: `Transform Your Life with ${productName}`,
            subheadline: `Using the ${angleLabel} approach — designed for ${formatLabel} format. See why thousands are switching today.`,
            cta: 'Get Started Now',
            image_prompt: `A professional ${formatLabel} ad featuring a modern, clean design showcasing ${productInput}. High-end product photography with soft lighting, minimalist background, bold typography for the headline area.`,
        };
    }
}
