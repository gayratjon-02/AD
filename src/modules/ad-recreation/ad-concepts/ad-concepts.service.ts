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
import { readFileSync } from 'fs';
import { extname } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AdConcept } from '../../../database/entities/Ad-Recreation/ad-concept.entity';
import { AdConceptAnalysis } from '../../../libs/types/AdRecreation';
import { AdConceptMessage } from '../../../libs/messages';

// ═══════════════════════════════════════════════════════════
// PROMPT CONSTANTS
// ═══════════════════════════════════════════════════════════

// ─── Resolution reference table for absolute pixel coordinates ───
const FORMAT_RESOLUTIONS: Record<string, { width: number; height: number }> = {
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '16:9': { width: 1920, height: 1080 },
};

const CONCEPT_ANALYSIS_SYSTEM_PROMPT = `Role: You are an expert Ad Creative Director specializing in reverse-engineering Visual DNA from advertisement images for recreation by a DIFFERENT brand.

Task: Analyze the uploaded ad image and return a strictly structured JSON object describing its Layout Pattern, Visual Style, and Content Strategy.

═══════════════════════════════════════════════════════════
ABSOLUTE RULES (VIOLATION = INVALID OUTPUT)
═══════════════════════════════════════════════════════════

1. ABSOLUTE PIXELS ONLY — NEVER PERCENTAGES
   First, detect the ad format aspect ratio from the image dimensions.
   Then map ALL y_start and y_end values to ABSOLUTE PIXEL coordinates
   based on these standard resolutions:
     • 9:16 → 1080×1920  (height = 1920px)
     • 1:1  → 1080×1080  (height = 1080px)
     • 4:5  → 1080×1350  (height = 1350px)
     • 16:9 → 1920×1080  (height = 1080px)
   Example: A headline at the top 15% of a 9:16 ad → y_start: 0, y_end: 288
   NEVER return values like 0-100. Always return actual pixel integers.

2. EXTRACT THE VISUAL PATTERN — NOT THE CONTENT
   You are extracting the STRUCTURE and LAYOUT PATTERN, not the competitor's content.
   • NEVER output the competitor's brand name, product name, or exact copy text.
   • Use GENERIC PLACEHOLDERS in descriptions:
     WRONG: "Nike logo in top-left"
     RIGHT: "Brand logo placement, top-left corner"
     WRONG: "Text says 'Just Do It'"
     RIGHT: "Short motivational hook, centered, bold sans-serif"

3. ZONE COVERAGE
   Zones MUST cover the full vertical span of the image (from pixel 0 to full height).
   Every zone must have: id, y_start (int px), y_end (int px), content_type.
   Zone y_start of one zone should equal y_end of the previous zone (no gaps).

4. STRICT JSON
   Return ONLY valid JSON. No markdown. No code fences. No explanation.
   No conversational text before or after the JSON object.`;

const CONCEPT_ANALYSIS_USER_PROMPT = `Analyze this ad image and extract its Visual DNA for recreation by a different brand.

STEP 1: Detect the aspect ratio (9:16, 1:1, 4:5, or 16:9) from the image.
STEP 2: Determine the reference height in pixels (9:16→1920, 1:1→1080, 4:5→1350, 16:9→1080).
STEP 3: Map each visual zone to ABSOLUTE PIXEL y_start and y_end values.

Return ONLY this JSON structure:

{
  "layout": {
    "type": "split_screen | centered_hero | notes_app | tweet_style | text_overlay | product_showcase",
    "format": "9:16 | 1:1 | 4:5 | 16:9",
    "zones": [
      {
        "id": "string (e.g. header, headline, body, cta, image_main, logo)",
        "y_start": 0,
        "y_end": 288,
        "content_type": "headline | body | cta_button | image | logo | ui_element",
        "typography_style": "string (e.g. Bold Sans-Serif White, Elegant Serif Black)",
        "description": "string — describe the PATTERN, not the competitor's content"
      }
    ]
  },
  "visual_style": {
    "mood": "string (energetic | calm | luxury | native_ugc | clean_editorial | bold_graphic)",
    "background": {
      "type": "solid_color | image | gradient",
      "hex": "#HEXCODE or null"
    },
    "overlay": "dark_dim_layer | white_box_opacity | none"
  },
  "content_pattern": {
    "hook_type": "question | direct_benefit | controversial_statement | revolutionary_claim | social_proof",
    "narrative_structure": "problem_solution | feature_highlight | storytelling | before_after | disruptive_product_announcement",
    "cta_style": "pill_button | text_link_with_arrow | swipe_up_icon | implicit_editorial_style",
    "requires_product_image": true
  }
}

REMINDER: y_start and y_end are ABSOLUTE PIXEL values (integers), NOT percentages.
Return ONLY the JSON. No markdown. No explanation.`;

// ═══════════════════════════════════════════════════════════
// MEDIA TYPE MAP
// ═══════════════════════════════════════════════════════════

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const MEDIA_TYPE_MAP: Record<string, ClaudeImageMediaType> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

/**
 * Ad Concepts Service - Phase 2: Ad Recreation
 *
 * Handles real Claude Vision analysis of uploaded ad images.
 * Extracts Visual DNA (layout patterns, visual style, content strategy) for ad recreation.
 */
@Injectable()
export class AdConceptsService {
    private readonly logger = new Logger(AdConceptsService.name);
    private readonly model = 'claude-sonnet-4-20250514';
    private anthropicClient: Anthropic | null = null;

    constructor(
        @InjectRepository(AdConcept)
        private adConceptsRepository: Repository<AdConcept>,
        private readonly configService: ConfigService,
    ) { }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE CONCEPT (main entry point)
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyze an uploaded ad image with Claude Vision and save the concept.
     *
     * Pipeline:
     * 1. Read image file → Buffer → Base64
     * 2. Detect media type from file extension
     * 3. Send to Claude Vision with Visual DNA extraction prompt
     * 4. Parse and validate JSON response
     * 5. Save to ad_concepts table
     */
    async analyze(userId: string, imageUrl: string, filePath: string): Promise<AdConcept> {
        this.logger.log(`Analyzing concept for user ${userId}: ${imageUrl}`);

        // Real Claude Vision analysis
        const analysisResult = await this.analyzeImageWithClaude(filePath);

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
    // UPDATE CONCEPT ANALYSIS JSON
    // ═══════════════════════════════════════════════════════════

    async updateAnalysis(id: string, userId: string, analysisJson: object): Promise<AdConcept> {
        // First verify ownership
        const concept = await this.findOne(id, userId);

        // Update the analysis_json
        concept.analysis_json = analysisJson as any;

        const saved = await this.adConceptsRepository.save(concept);
        this.logger.log(`Updated Ad Concept analysis_json: ${id}`);

        return saved;
    }


    // ═══════════════════════════════════════════════════════════
    // REAL CLAUDE VISION PIPELINE
    // ═══════════════════════════════════════════════════════════

    private async analyzeImageWithClaude(filePath: string): Promise<AdConceptAnalysis> {
        this.logger.log(`Analyzing image with Claude Vision: ${filePath}`);

        // Step 1: Read file and convert to Base64
        let imageBase64: string;
        let mediaType: ClaudeImageMediaType;
        try {
            const fileBuffer = readFileSync(filePath);
            imageBase64 = fileBuffer.toString('base64');
            mediaType = this.detectMediaType(filePath);
            this.logger.log(`Image loaded: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB (${mediaType})`);
        } catch (error) {
            this.logger.error(`Failed to read image file: ${error.message}`);
            throw new BadRequestException(AdConceptMessage.AI_IMAGE_UNREADABLE);
        }

        // Step 2: Initialize Anthropic client
        const client = this.getAnthropicClient();

        // Step 3: Send to Claude Vision
        let responseText: string;
        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: CONCEPT_ANALYSIS_SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mediaType,
                                    data: imageBase64,
                                },
                            },
                            {
                                type: 'text',
                                text: CONCEPT_ANALYSIS_USER_PROMPT,
                            },
                        ],
                    },
                ],
            });

            // Extract text from response
            const textBlock = message.content.find((block) => block.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
                throw new Error('No text response from Claude');
            }
            responseText = textBlock.text;

            this.logger.log(`Claude Vision response received (${message.usage?.input_tokens} in / ${message.usage?.output_tokens} out tokens)`);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Claude Vision API call failed: ${error.message}`);
            throw new InternalServerErrorException(AdConceptMessage.AI_ANALYSIS_FAILED);
        }

        // Step 4: Parse JSON and validate
        const analysis = this.parseAndValidateAnalysis(responseText);

        this.logger.log(`Concept extracted: ${analysis.layout.type} (${analysis.layout.format}), ${analysis.layout.zones.length} zones, mood: ${analysis.visual_style.mood}, hook: ${analysis.content_pattern.hook_type}`);
        return analysis;
    }

    // ═══════════════════════════════════════════════════════════
    // JSON PARSING & VALIDATION
    // ═══════════════════════════════════════════════════════════

    private parseAndValidateAnalysis(responseText: string): AdConceptAnalysis {
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
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        // Validate required top-level keys
        if (!parsed.layout || !parsed.visual_style) {
            this.logger.error('Missing required keys: layout or visual_style');
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        // Validate layout structure
        if (!parsed.layout.type || !parsed.layout.format) {
            this.logger.error('Missing layout.type or layout.format');
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        // Determine expected height from format
        const format = parsed.layout.format;
        const resolution = FORMAT_RESOLUTIONS[format];
        const maxHeight = resolution ? resolution.height : 1920;

        // Ensure zones is an array
        if (!Array.isArray(parsed.layout.zones)) {
            parsed.layout.zones = [];
        }

        // Validate each zone: enforce absolute pixel coordinates
        for (let i = 0; i < parsed.layout.zones.length; i++) {
            const zone = parsed.layout.zones[i];
            if (!zone.id) zone.id = `zone_${i + 1}`;

            // Coerce to integers
            zone.y_start = typeof zone.y_start === 'number' ? Math.round(zone.y_start) : 0;
            zone.y_end = typeof zone.y_end === 'number' ? Math.round(zone.y_end) : maxHeight;

            // Auto-fix: if values look like percentages (0-100 range for tall formats), convert to pixels
            if (maxHeight > 100 && zone.y_end <= 100 && zone.y_start <= 100) {
                this.logger.warn(`Zone "${zone.id}" has percentage-like values (${zone.y_start}-${zone.y_end}), converting to pixels`);
                zone.y_start = Math.round((zone.y_start / 100) * maxHeight);
                zone.y_end = Math.round((zone.y_end / 100) * maxHeight);
            }

            // Clamp to valid range
            zone.y_start = Math.max(0, Math.min(zone.y_start, maxHeight));
            zone.y_end = Math.max(0, Math.min(zone.y_end, maxHeight));

            // Ensure y_end > y_start
            if (zone.y_end <= zone.y_start) {
                zone.y_end = Math.min(zone.y_start + 100, maxHeight);
            }

            if (!zone.content_type) zone.content_type = 'headline';
            if (!zone.typography_style) zone.typography_style = 'Sans-Serif Regular';
            if (!zone.description) zone.description = '';
        }

        // Validate visual_style
        if (!parsed.visual_style.mood) parsed.visual_style.mood = 'neutral';
        if (!parsed.visual_style.background || typeof parsed.visual_style.background !== 'object') {
            const oldHex = parsed.visual_style.background_hex;
            parsed.visual_style.background = {
                type: 'solid_color',
                hex: oldHex || '#FFFFFF',
            };
        }
        if (!parsed.visual_style.background.type) parsed.visual_style.background.type = 'solid_color';
        if (parsed.visual_style.background.hex === undefined) parsed.visual_style.background.hex = '#FFFFFF';
        if (!parsed.visual_style.overlay) parsed.visual_style.overlay = 'none';

        // Validate content_pattern
        if (!parsed.content_pattern || typeof parsed.content_pattern !== 'object') {
            parsed.content_pattern = {
                hook_type: 'direct_benefit',
                narrative_structure: 'feature_highlight',
                cta_style: 'pill_button',
                requires_product_image: false,
            };
        }
        if (!parsed.content_pattern.hook_type) parsed.content_pattern.hook_type = 'direct_benefit';
        if (!parsed.content_pattern.narrative_structure) parsed.content_pattern.narrative_structure = 'feature_highlight';
        if (!parsed.content_pattern.cta_style) parsed.content_pattern.cta_style = 'pill_button';
        if (parsed.content_pattern.requires_product_image === undefined) parsed.content_pattern.requires_product_image = false;

        // Clean up legacy flat fields
        delete parsed.visual_style.background_hex;
        delete parsed.visual_style.font_color_primary;

        return parsed as AdConceptAnalysis;
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    private detectMediaType(filePath: string): ClaudeImageMediaType {
        const ext = extname(filePath).toLowerCase();
        return MEDIA_TYPE_MAP[ext] || 'image/jpeg';
    }

    private getAnthropicClient(): Anthropic {
        if (this.anthropicClient) return this.anthropicClient;

        const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
        if (!apiKey) {
            throw new InternalServerErrorException(AdConceptMessage.AI_API_KEY_MISSING);
        }

        this.anthropicClient = new Anthropic({ apiKey });
        this.logger.log('Anthropic client initialized for concept analysis');

        return this.anthropicClient;
    }
}
