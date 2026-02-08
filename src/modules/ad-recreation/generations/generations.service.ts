import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdBrandsService } from '../brands/ad-brands.service';
import { AdConceptsService } from '../ad-concepts/ad-concepts.service';
import { MARKETING_ANGLES } from '../configurations/constants/marketing-angles';
import { AD_FORMATS } from '../configurations/constants/ad-formats';
import { AdGenerationStatus } from '../../../libs/enums/AdRecreationEnums';
import { AdGenerationMessage } from '../../../libs/messages';
import { GenerateAdDto } from './dto/generate-ad.dto';

// ═══════════════════════════════════════════════════════════
// AD COPY RESULT TYPE
// ═══════════════════════════════════════════════════════════

interface AdCopyResult {
    headline: string;
    subheadline: string;
    cta: string;
    image_prompt: string;
}

// ═══════════════════════════════════════════════════════════
// PROMPT CONSTANTS
// ═══════════════════════════════════════════════════════════

const AD_GENERATION_SYSTEM_PROMPT = `You are a world-class Ad Copywriter and Creative Director with 15+ years of experience crafting high-converting advertisements.

Your job: Generate ad copy that perfectly matches the provided brand identity, layout structure, and marketing angle.

RULES:
1. The headline must be punchy, attention-grabbing, and fit within the layout zone designated for text.
2. The subheadline must expand on the headline with a benefit-driven statement.
3. The CTA must be action-oriented and create urgency.
4. The image_prompt must be a highly detailed description for an image generation AI (Midjourney/DALL-E style), including composition, lighting, color palette, mood, and product placement.
5. Return ONLY valid JSON. No markdown, no explanation, no conversational text.
6. All text must match the brand's tone of voice and style guidelines.`;

/**
 * Generations Service - Phase 2: Ad Recreation
 *
 * Orchestrates the ad generation pipeline using real Claude AI:
 * Brand Playbook + Concept Layout + Marketing Angle → Ad Copy
 */
@Injectable()
export class GenerationsService {
    private readonly logger = new Logger(GenerationsService.name);
    private readonly model: string;
    private anthropicClient: Anthropic | null = null;

    constructor(
        @InjectRepository(AdGeneration)
        private generationsRepository: Repository<AdGeneration>,
        private readonly adBrandsService: AdBrandsService,
        private readonly adConceptsService: AdConceptsService,
        private readonly configService: ConfigService,
    ) {
        this.model = this.configService.get<string>('CLAUDE_MODEL') || 'claude-sonnet-4-20250514';
    }

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

        // Step 5: Build prompt and call real Claude AI
        let adCopy: AdCopyResult;
        try {
            const userPrompt = this.buildUserPrompt(
                brand.name,
                brand.brand_playbook,
                concept.analysis_json,
                angle,
                format,
                dto.product_input,
            );

            this.logger.log(`Prompt built (${userPrompt.length} chars), calling Claude AI...`);
            saved.progress = 30;
            await this.generationsRepository.save(saved);

            // Real Claude AI call
            adCopy = await this.callClaudeForAdCopy(userPrompt);

            // Update generation status to completed
            saved.status = AdGenerationStatus.COMPLETED;
            saved.progress = 100;
            saved.completed_at = new Date();
            await this.generationsRepository.save(saved);

            this.logger.log(`Ad generation completed: ${saved.id}`);
        } catch (error) {
            saved.status = AdGenerationStatus.FAILED;
            saved.failure_reason = error instanceof Error ? error.message : String(error);
            await this.generationsRepository.save(saved);

            this.logger.error(`Ad generation failed: ${error instanceof Error ? error.message : String(error)}`);
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
    // REAL CLAUDE AI CALL
    // ═══════════════════════════════════════════════════════════

    private async callClaudeForAdCopy(userPrompt: string): Promise<AdCopyResult> {
        const client = this.getAnthropicClient();

        let responseText: string;
        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 2048,
                system: AD_GENERATION_SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: userPrompt,
                    },
                ],
            });

            // Extract text from response
            const textBlock = message.content.find((block) => block.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
                throw new Error('No text response from Claude');
            }
            responseText = textBlock.text;

            this.logger.log(`Claude response received (${message.usage?.input_tokens} in / ${message.usage?.output_tokens} out tokens)`);
        } catch (error) {
            if (error instanceof InternalServerErrorException) throw error;
            this.logger.error(`Claude API call failed: ${error instanceof Error ? error.message : String(error)}`);
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        // Parse and validate the JSON response
        return this.parseAndValidateAdCopy(responseText);
    }

    // ═══════════════════════════════════════════════════════════
    // JSON PARSING & VALIDATION
    // ═══════════════════════════════════════════════════════════

    private parseAndValidateAdCopy(responseText: string): AdCopyResult {
        // Strip markdown code fences if Claude wrapped the JSON
        let cleaned = responseText.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        let parsed: any;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            this.logger.error(`Failed to parse Claude response as JSON: ${cleaned.substring(0, 200)}...`);
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        // Validate required keys
        if (!parsed.headline || !parsed.subheadline || !parsed.cta || !parsed.image_prompt) {
            this.logger.error('Missing required keys in AI response: headline, subheadline, cta, or image_prompt');
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        return {
            headline: String(parsed.headline),
            subheadline: String(parsed.subheadline),
            cta: String(parsed.cta),
            image_prompt: String(parsed.image_prompt),
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDER
    // ═══════════════════════════════════════════════════════════

    private buildUserPrompt(
        brandName: string,
        playbook: any,
        conceptAnalysis: any,
        angle: { id: string; label: string; description: string },
        format: { id: string; label: string; ratio: string; dimensions: string },
        productInput: string,
    ): string {
        const zones = conceptAnalysis?.layout?.zones || [];
        const zonesJson = JSON.stringify(zones, null, 2);

        return `You are a professional copywriter for the brand "${brandName}".

=== BRAND IDENTITY ===
- Tone Style: ${playbook.tone_of_voice?.style || 'Professional'}
- Tone Keywords: ${playbook.tone_of_voice?.keywords?.join(', ') || 'N/A'}
- Words to Avoid: ${playbook.tone_of_voice?.donts?.join(', ') || 'N/A'}
- Primary Color: ${playbook.colors?.primary || 'N/A'}
- Secondary Color: ${playbook.colors?.secondary || 'N/A'}
- Accent Color: ${playbook.colors?.accent || 'N/A'}
- Heading Font: ${playbook.fonts?.heading || 'N/A'}
- Body Font: ${playbook.fonts?.body || 'N/A'}

=== LAYOUT STRUCTURE (from competitor ad analysis) ===
- Layout Type: ${conceptAnalysis?.layout?.type || 'N/A'}
- Visual Mood: ${conceptAnalysis?.visual_style?.mood || 'N/A'}
- Background Color: ${conceptAnalysis?.visual_style?.background_hex || 'N/A'}
- Font Color: ${conceptAnalysis?.visual_style?.font_color_primary || 'N/A'}
- Zones:
${zonesJson}

=== MARKETING ANGLE ===
- Strategy: ${angle.label}
- Apply this approach: ${angle.description}

=== AD FORMAT ===
- Format: ${format.label} (${format.ratio}, ${format.dimensions})

=== PRODUCT INFO ===
${productInput}

=== YOUR TASK ===
Generate ad copy for the product above using the "${angle.label}" marketing angle.
The ad must follow the layout structure zones above and match the brand's tone of voice.

Return ONLY this JSON object (no markdown, no explanation):

{
  "headline": "A short, punchy headline (max 8 words) that fits the text zone",
  "subheadline": "A benefit-driven supporting statement (max 20 words)",
  "cta": "An action-oriented call-to-action button text (2-5 words)",
  "image_prompt": "A highly detailed image generation prompt describing: composition, product placement, lighting, color palette (using brand colors), mood, background, and style. Must be optimized for ${format.label} format (${format.ratio}, ${format.dimensions})."
}`;
    }

    // ═══════════════════════════════════════════════════════════
    // ANTHROPIC CLIENT (lazy init, cached)
    // ═══════════════════════════════════════════════════════════

    private getAnthropicClient(): Anthropic {
        if (this.anthropicClient) return this.anthropicClient;

        const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
        if (!apiKey) {
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        this.anthropicClient = new Anthropic({ apiKey });
        this.logger.log('Anthropic client initialized for ad generation');

        return this.anthropicClient;
    }
}
