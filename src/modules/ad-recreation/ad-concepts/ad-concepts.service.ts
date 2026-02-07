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

const CONCEPT_ANALYSIS_SYSTEM_PROMPT = `You are an expert Ad Creative Director with 15+ years of experience deconstructing ad layouts for recreation.

Your job: Analyze this ad image to extract its "Layout Pattern" — the structural skeleton that can be cloned for a different brand.

RULES:
1. IGNORE specific brand text, logos, and product names (e.g., if it says "Nike", ignore "Nike").
2. FOCUS on the spatial structure: Where is the headline zone? Where is the product/hero image? Where is the CTA button?
3. Zone coordinates (y_start, y_end) must be percentages from 0 to 100 (top to bottom of the image).
4. Return ONLY valid JSON. No markdown, no explanation, no conversational text.
5. All hex color codes must be valid (e.g., "#1E3A5F").`;

const CONCEPT_ANALYSIS_USER_PROMPT = `Analyze this ad image and extract its layout pattern for recreation.

Return EXACTLY this JSON structure (no extra keys, no missing keys):

{
  "layout": {
    "type": "layout_name (e.g., split_screen_vertical, centered_hero, z_pattern, full_bleed)",
    "format": "aspect_ratio (e.g., 9:16, 1:1, 4:5, 16:9)",
    "zones": [
      {
        "id": "zone_1",
        "y_start": 0,
        "y_end": 20,
        "content_type": "text | image | video | cta",
        "description": "What occupies this zone (e.g., Large bold headline at top)"
      }
    ]
  },
  "visual_style": {
    "mood": "e.g., minimalist_clean, bold_vibrant, luxury_dark, playful_colorful",
    "background_hex": "#HEXCODE",
    "font_color_primary": "#HEXCODE"
  }
}

Return ONLY the JSON object. No markdown code fences. No explanation.`;

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
 * Extracts layout patterns for ad recreation.
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
    ) {}

    // ═══════════════════════════════════════════════════════════
    // ANALYZE CONCEPT (main entry point)
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyze an uploaded ad image with Claude Vision and save the concept.
     *
     * Pipeline:
     * 1. Read image file → Buffer → Base64
     * 2. Detect media type from file extension
     * 3. Send to Claude Vision with layout extraction prompt
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

        this.logger.log(`Concept extracted: ${analysis.layout.type} (${analysis.layout.format}), ${analysis.layout.zones.length} zones, mood: ${analysis.visual_style.mood}`);
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

        // Ensure zones is an array
        if (!Array.isArray(parsed.layout.zones)) {
            parsed.layout.zones = [];
        }

        // Validate each zone has required fields
        for (const zone of parsed.layout.zones) {
            if (!zone.id) zone.id = `zone_${parsed.layout.zones.indexOf(zone) + 1}`;
            if (zone.y_start === undefined) zone.y_start = 0;
            if (zone.y_end === undefined) zone.y_end = 100;
            if (!zone.content_type) zone.content_type = 'text';
            if (!zone.description) zone.description = '';
        }

        // Validate visual_style
        if (!parsed.visual_style.mood) parsed.visual_style.mood = 'neutral';
        if (!parsed.visual_style.background_hex) parsed.visual_style.background_hex = '#FFFFFF';
        if (!parsed.visual_style.font_color_primary) parsed.visual_style.font_color_primary = '#000000';

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
