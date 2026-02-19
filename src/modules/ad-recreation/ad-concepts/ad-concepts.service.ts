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

const CONCEPT_ANALYSIS_SYSTEM_PROMPT = `You are a STRICT visual pattern extraction engine for the ROMIMI Ad Recreation system.

Your job is to analyze a static ad inspiration image and extract ONLY the structural pattern.

You are NOT allowed to:
- Copy competitor brand names, product names, or exact copy text
- Paraphrase or summarize their marketing message
- Infer missing elements — if it's not visible, don't include it
- Invent zones that do not exist
- Assume fixed dimensions (like 1080x1920)

You MUST:
- Read the real image width and height from the image itself
- Base all y_start/y_end coordinates on actual image pixel dimensions
- Extract only structural and visual patterns
- Use GENERIC PLACEHOLDERS in descriptions (e.g. "Brand logo placement" not "Nike logo")
- Return VALID JSON only — no markdown, no commentary

═══════════════════════════════════════════════════════════
CONTROLLED VOCABULARIES (use ONLY these values)
═══════════════════════════════════════════════════════════

layout.type ALLOWED VALUES:
  product_hero_center, product_left_text_right, product_right_text_left,
  split_screen, text_only, testimonial_grid, product_with_overlays,
  ugc_style, app_screenshot, feature_stack, minimalist_product, custom_layout

content_type ALLOWED VALUES:
  headline, subheadline, feature_badges, product_image, image,
  testimonial_overlay, composite_product_social_proof, cta_button,
  cta_subtext, social_proof_line, background_only, logo, ui_element, body

hook_type ALLOWED VALUES:
  pattern_interrupt, contrast_statement, direct_benefit, problem_agitation,
  bold_claim, social_proof_hook, question_hook, feature_announcement,
  comparison_hook

═══════════════════════════════════════════════════════════
ZONE RULES (CRITICAL)
═══════════════════════════════════════════════════════════

1. Zones MUST NOT overlap (y_start of zone N+1 >= y_end of zone N)
2. Coordinates must use ACTUAL image height (read from image, not assumed)
3. If a product image has floating testimonial bubbles → use "composite_product_social_proof"
4. If CTA area has a button AND subtext → create TWO separate zones
5. Every zone must have: id, y_start, y_end, content_type
6. height_percent (0-100) should be calculated from real image height`;

const CONCEPT_ANALYSIS_USER_PROMPT = `Analyze this ad image and extract its Visual DNA for recreation by a different brand.

STEP 1 — Read the actual image width and height.
STEP 2 — Classify the layout type using ONLY the allowed list.
STEP 3 — Map each visual zone with ABSOLUTE PIXEL y_start and y_end values.
STEP 4 — Classify the hook type using ONLY the controlled vocabulary.
STEP 5 — Extract visual style (background, lighting, product position).
STEP 6 — Identify CTA structure (button vs subtext).

Return ONLY this JSON structure:

{
  "concept_name": "string — short descriptive name (3-6 words)",
  "concept_tags": ["string — 3-6 lowercase_underscore tags"],
  "image_meta": {
    "width": number,
    "height": number,
    "aspect_ratio": number,
    "orientation": "vertical|square|horizontal"
  },
  "layout": {
    "type": "one of allowed layout types",
    "format": "auto-detected aspect ratio (e.g. 9:16, 1:1, 4:5, 16:9)",
    "zones": [
      {
        "id": "string (e.g. header, headline, hero_image, cta)",
        "y_start": 0,
        "y_end": 288,
        "height_percent": 15,
        "content_type": "one of allowed content_type values",
        "structural_role": "string describing role (e.g. primary_headline, hero_product_area)",
        "typography_style": "string (e.g. Bold Sans-Serif White)",
        "description": "describe the PATTERN, not competitor content"
      }
    ]
  },
  "visual_style": {
    "mood": "energetic|calm|luxury|native_ugc|clean_editorial|bold_graphic",
    "background": {
      "type": "solid_color|image|gradient|textured",
      "hex": "#HEXCODE or null"
    },
    "overlay": "dark_dim_layer|white_box_opacity|none",
    "dominant_background_color": "#HEX or null",
    "product_position": "center|left|right|bottom|null",
    "lighting_style": "flat|studio|natural|high_contrast|null",
    "ui_elements_present": false
  },
  "content_pattern": {
    "hook_type": "one of allowed hook_type values",
    "narrative_structure": "problem_solution|feature_highlight|storytelling|before_after|disruptive_product_announcement",
    "cta_style": "pill_button|text_link_with_arrow|swipe_up_icon|implicit_editorial_style",
    "requires_product_image": true
  },
  "cta_structure": {
    "has_cta_button": true,
    "has_cta_subtext": false
  }
}

STRICT VALIDATION RULES:
1. If zones overlap → INVALID
2. If image height is assumed without reading → INVALID
3. If competitor brand name appears in JSON → INVALID
4. If full headline text is copied → INVALID
5. If content_type not in allowed list → INVALID
6. If hook_type not in controlled vocabulary → INVALID

Return VALID JSON ONLY. No explanations. No markdown.`;


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

        // Auto-populate name and tags from Claude's analysis
        const autoName = analysisResult.concept_name || null;
        const autoTags = Array.isArray(analysisResult.concept_tags) ? analysisResult.concept_tags : [];

        this.logger.log(`Auto-generated name: "${autoName}", tags: [${autoTags.join(', ')}]`);

        const concept = this.adConceptsRepository.create({
            user_id: userId,
            original_image_url: imageUrl,
            analysis_json: analysisResult,
            name: autoName,
            tags: autoTags,
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
    // GET ALL CONCEPTS FOR USER (with optional tag filtering)
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string, tags?: string[]): Promise<AdConcept[]> {
        const qb = this.adConceptsRepository
            .createQueryBuilder('concept')
            .where('concept.user_id = :userId', { userId });

        // Filter by tags using JSONB overlap operator (?|)
        if (tags && tags.length > 0) {
            qb.andWhere('concept.tags ::jsonb ?| ARRAY[:...tags]', { tags });
        }

        qb.orderBy('concept.created_at', 'DESC');

        return qb.getMany();
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE CONCEPT (name, notes, tags, analysis_json)
    // ═══════════════════════════════════════════════════════════

    async updateConcept(
        id: string,
        userId: string,
        updates: { name?: string; notes?: string; tags?: string[]; analysis_json?: object },
    ): Promise<AdConcept> {
        // First verify ownership
        const concept = await this.findOne(id, userId);

        // Apply only provided fields
        if (updates.name !== undefined) concept.name = updates.name;
        if (updates.notes !== undefined) concept.notes = updates.notes;
        if (updates.tags !== undefined) concept.tags = updates.tags;
        if (updates.analysis_json !== undefined) concept.analysis_json = updates.analysis_json as any;

        const saved = await this.adConceptsRepository.save(concept);
        this.logger.log(`Updated Ad Concept: ${id} (fields: ${Object.keys(updates).join(', ')})`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // INCREMENT USE COUNT (called when concept is used in generation)
    // ═══════════════════════════════════════════════════════════

    async incrementUseCount(id: string): Promise<void> {
        await this.adConceptsRepository
            .createQueryBuilder()
            .update(AdConcept)
            .set({ use_count: () => 'use_count + 1' })
            .where('id = :id', { id })
            .execute();

        this.logger.log(`Incremented use_count for concept: ${id}`);
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

        this.logger.log(`[STRICT] Concept extracted: ${analysis.layout.type} (${analysis.layout.format || 'auto'}), ${analysis.layout.zones.length} zones, mood: ${analysis.visual_style.mood}, hook: ${analysis.content_pattern.hook_type}`);
        return analysis;
    }

    // ═══════════════════════════════════════════════════════════
    // STRICT EXTRACTION PARSER + VALIDATION
    // ═══════════════════════════════════════════════════════════

    // Controlled vocabularies for validation
    private static readonly ALLOWED_LAYOUT_TYPES = [
        'product_hero_center', 'product_left_text_right', 'product_right_text_left',
        'split_screen', 'text_only', 'testimonial_grid', 'product_with_overlays',
        'ugc_style', 'app_screenshot', 'feature_stack', 'minimalist_product', 'custom_layout',
        // Legacy values (backward compat)
        'centered_hero', 'notes_app', 'tweet_style', 'text_overlay', 'product_showcase',
    ];

    private static readonly ALLOWED_CONTENT_TYPES = [
        'headline', 'subheadline', 'body', 'feature_badges', 'product_image', 'image',
        'testimonial_overlay', 'composite_product_social_proof', 'cta_button',
        'cta_subtext', 'social_proof_line', 'background_only', 'logo', 'ui_element',
    ];

    private static readonly ALLOWED_HOOK_TYPES = [
        'pattern_interrupt', 'contrast_statement', 'direct_benefit', 'problem_agitation',
        'bold_claim', 'social_proof_hook', 'question_hook', 'feature_announcement',
        'comparison_hook',
        // Legacy values (backward compat)
        'question', 'controversial_statement', 'revolutionary_claim', 'social_proof',
    ];

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

        // ── Validate required top-level keys ──
        if (!parsed.layout || !parsed.visual_style) {
            this.logger.error('Missing required keys: layout or visual_style');
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        if (!parsed.layout.type) {
            this.logger.error('Missing layout.type');
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        // ── Validate layout.type against controlled vocabulary ──
        if (!AdConceptsService.ALLOWED_LAYOUT_TYPES.includes(parsed.layout.type)) {
            this.logger.warn(`[STRICT] layout.type "${parsed.layout.type}" not in allowed list — keeping but flagging`);
        }

        // ── Determine image height (prefer real dimensions from image_meta) ──
        let maxHeight: number;
        if (parsed.image_meta?.height && parsed.image_meta.height > 100) {
            maxHeight = parsed.image_meta.height;
            this.logger.log(`[STRICT] Using real image height: ${maxHeight}px (${parsed.image_meta.width}x${maxHeight})`);
        } else {
            const format = parsed.layout.format;
            const resolution = FORMAT_RESOLUTIONS[format];
            maxHeight = resolution ? resolution.height : 1920;
            this.logger.warn(`[STRICT] No image_meta — falling back to format-based height: ${maxHeight}px`);
        }

        // ── Auto-detect format from image_meta if missing ──
        if (!parsed.layout.format && parsed.image_meta?.width && parsed.image_meta?.height) {
            const ratio = parsed.image_meta.width / parsed.image_meta.height;
            if (ratio < 0.7) parsed.layout.format = '9:16';
            else if (ratio < 0.85) parsed.layout.format = '4:5';
            else if (ratio < 1.15) parsed.layout.format = '1:1';
            else parsed.layout.format = '16:9';
            this.logger.log(`[STRICT] Auto-detected format: ${parsed.layout.format} (ratio: ${ratio.toFixed(2)})`);
        }
        if (!parsed.layout.format) parsed.layout.format = '9:16';

        // ── Validate zones ──
        if (!Array.isArray(parsed.layout.zones)) {
            parsed.layout.zones = [];
        }

        for (let i = 0; i < parsed.layout.zones.length; i++) {
            const zone = parsed.layout.zones[i];
            if (!zone.id) zone.id = `zone_${i + 1}`;

            // Coerce to integers
            zone.y_start = typeof zone.y_start === 'number' ? Math.round(zone.y_start) : 0;
            zone.y_end = typeof zone.y_end === 'number' ? Math.round(zone.y_end) : maxHeight;

            // Auto-fix: if values look like percentages (0-100 range for tall formats)
            if (maxHeight > 100 && zone.y_end <= 100 && zone.y_start <= 100) {
                this.logger.warn(`[STRICT] Zone "${zone.id}" has percentage-like values (${zone.y_start}-${zone.y_end}), converting to pixels`);
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

            // Calculate height_percent if not provided
            if (zone.height_percent === undefined) {
                zone.height_percent = Math.round(((zone.y_end - zone.y_start) / maxHeight) * 100);
            }

            // Validate content_type against controlled vocabulary
            if (zone.content_type && !AdConceptsService.ALLOWED_CONTENT_TYPES.includes(zone.content_type)) {
                this.logger.warn(`[STRICT] Zone "${zone.id}" content_type "${zone.content_type}" not in allowed list`);
                // Map legacy "image" to "product_image" if it looks like a product zone
                if (zone.content_type === 'image') {
                    // Keep as-is — "image" is in allowed list
                }
            }

            if (!zone.content_type) zone.content_type = 'headline';
            if (!zone.typography_style) zone.typography_style = 'Sans-Serif Regular';
            if (!zone.description) zone.description = '';
        }

        // ── ZONE OVERLAP DETECTION ──
        const sortedZones = [...parsed.layout.zones].sort((a: any, b: any) => a.y_start - b.y_start);
        for (let i = 1; i < sortedZones.length; i++) {
            const prev = sortedZones[i - 1];
            const curr = sortedZones[i];
            if (curr.y_start < prev.y_end) {
                this.logger.warn(`[STRICT] ⚠️ ZONE OVERLAP: "${prev.id}" (${prev.y_start}-${prev.y_end}) overlaps with "${curr.id}" (${curr.y_start}-${curr.y_end})`);
                // Auto-fix: snap current zone's start to previous zone's end
                curr.y_start = prev.y_end;
                if (curr.y_end <= curr.y_start) {
                    curr.y_end = curr.y_start + 50;
                }
            }
        }

        // ── Validate visual_style ──
        if (!parsed.visual_style.mood) parsed.visual_style.mood = 'neutral';
        if (!parsed.visual_style.background || typeof parsed.visual_style.background !== 'object') {
            const oldHex = parsed.visual_style.background_hex || parsed.visual_style.dominant_background_color;
            parsed.visual_style.background = {
                type: 'solid_color',
                hex: oldHex || '#FFFFFF',
            };
        }
        if (!parsed.visual_style.background.type) parsed.visual_style.background.type = 'solid_color';
        if (parsed.visual_style.background.hex === undefined) parsed.visual_style.background.hex = '#FFFFFF';
        if (!parsed.visual_style.overlay) parsed.visual_style.overlay = 'none';

        // ── Validate content_pattern ──
        if (!parsed.content_pattern || typeof parsed.content_pattern !== 'object') {
            parsed.content_pattern = {
                hook_type: 'direct_benefit',
                narrative_structure: 'feature_highlight',
                cta_style: 'pill_button',
                requires_product_image: false,
            };
        }
        if (!parsed.content_pattern.hook_type) parsed.content_pattern.hook_type = 'direct_benefit';

        // Validate hook_type against controlled vocabulary
        if (!AdConceptsService.ALLOWED_HOOK_TYPES.includes(parsed.content_pattern.hook_type)) {
            this.logger.warn(`[STRICT] hook_type "${parsed.content_pattern.hook_type}" not in controlled vocabulary`);
        }

        if (!parsed.content_pattern.narrative_structure) parsed.content_pattern.narrative_structure = 'feature_highlight';
        if (!parsed.content_pattern.cta_style) parsed.content_pattern.cta_style = 'pill_button';
        if (parsed.content_pattern.requires_product_image === undefined) parsed.content_pattern.requires_product_image = false;

        // ── Validate concept_name ──
        if (parsed.concept_name && typeof parsed.concept_name !== 'string') {
            parsed.concept_name = String(parsed.concept_name);
        }

        // ── Validate concept_tags ──
        if (parsed.concept_tags) {
            if (!Array.isArray(parsed.concept_tags)) {
                parsed.concept_tags = [];
            } else {
                parsed.concept_tags = parsed.concept_tags
                    .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
                    .map((t: string) => t.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
            }
        } else {
            const autoTags: string[] = [];
            if (parsed.layout?.type) autoTags.push(parsed.layout.type);
            if (parsed.visual_style?.mood) autoTags.push(parsed.visual_style.mood);
            if (parsed.content_pattern?.hook_type) autoTags.push(parsed.content_pattern.hook_type);
            if (parsed.layout?.format) autoTags.push(parsed.layout.format.replace(':', 'x'));
            parsed.concept_tags = autoTags;
        }

        // ── Auto-generate concept_name if missing ──
        if (!parsed.concept_name) {
            const layoutLabel = (parsed.layout?.type || 'unknown').replace(/_/g, ' ');
            const moodLabel = parsed.visual_style?.mood || '';
            parsed.concept_name = `${this.capitalizeWords(layoutLabel)} ${this.capitalizeWords(moodLabel)} Ad`.trim();
        }

        // ── Clean up legacy flat fields ──
        delete parsed.visual_style.background_hex;
        delete parsed.visual_style.font_color_primary;

        // ── Log strict extraction summary ──
        this.logger.log(`[STRICT EXTRACTION] ✅ Validated: ${parsed.layout.zones.length} zones, layout=${parsed.layout.type}, hook=${parsed.content_pattern.hook_type}`);
        if (parsed.image_meta) {
            this.logger.log(`[STRICT EXTRACTION] Image: ${parsed.image_meta.width}x${parsed.image_meta.height} (${parsed.image_meta.orientation})`);
        }
        if (parsed.cta_structure) {
            this.logger.log(`[STRICT EXTRACTION] CTA: button=${parsed.cta_structure.has_cta_button}, subtext=${parsed.cta_structure.has_cta_subtext}`);
        }

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

    // ═══════════════════════════════════════════════════════════
    // STRING HELPERS
    // ═══════════════════════════════════════════════════════════

    private capitalizeWords(str: string): string {
        return str.replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
