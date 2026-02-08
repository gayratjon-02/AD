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
import Anthropic from '@anthropic-ai/sdk';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import { CreateAdBrandDto, PlaybookType } from '../../../libs/dto/AdRecreation/brands';
import {
    BrandPlaybook,
    AdsPlaybook,
    CopyPlaybook,
    BrandAssets,
} from '../../../libs/types/AdRecreation';
import { AdBrandMessage } from '../../../libs/messages';

// ═══════════════════════════════════════════════════════════
// PROMPT CONSTANTS
// ═══════════════════════════════════════════════════════════

const BRAND_ANALYSIS_SYSTEM_PROMPT = `You are a Senior Brand Strategist with 15+ years of experience extracting visual identity systems from brand guideline documents.

Your job: Analyze the attached Brand Guidelines PDF and extract strict, structured visual identity rules.

RULES:
- Return ONLY valid JSON. No markdown, no explanation, no conversational text.
- If a value is not found in the PDF, make your best professional inference based on the visual design shown.
- All color values must be valid hex codes (e.g., "#1E3A5F").
- Font names should be as specific as possible (e.g., "Montserrat Bold", not just "Montserrat").`;

const BRAND_ANALYSIS_USER_PROMPT = `Analyze this Brand Guidelines PDF and extract the following structured data.

Return EXACTLY this JSON structure (no extra keys, no missing keys):

{
  "colors": {
    "primary": "#HEXCODE",
    "secondary": "#HEXCODE",
    "accent": "#HEXCODE",
    "palette": ["#HEX1", "#HEX2", "#HEX3"]
  },
  "fonts": {
    "heading": "Font Name (e.g., Montserrat Bold)",
    "body": "Font Name (e.g., Open Sans Regular)",
    "usage_rules": "Summary of when/how to use each font"
  },
  "tone_of_voice": {
    "style": "e.g., Professional, Playful, Luxury",
    "keywords": ["word1", "word2", "word3"],
    "donts": ["avoid this", "never say that"]
  },
  "logo_rules": {
    "clear_space": "e.g., Minimum 16px around logo",
    "forbidden_usage": ["don't rotate", "don't change color", "don't place on busy backgrounds"]
  }
}

Return ONLY the JSON object. No markdown code fences. No explanation.`;

/**
 * Ad Brands Service - Phase 2: Ad Recreation
 *
 * Handles brand creation, asset uploads, and AI-powered playbook analysis.
 * Uses Anthropic Claude API for real PDF analysis.
 */
@Injectable()
export class AdBrandsService {
    private readonly logger = new Logger(AdBrandsService.name);
    private readonly model: string;
    private anthropicClient: Anthropic | null = null;

    constructor(
        @InjectRepository(AdBrand)
        private adBrandsRepository: Repository<AdBrand>,
        private readonly configService: ConfigService,
    ) {
        this.model = this.configService.get<string>('CLAUDE_MODEL') || 'claude-sonnet-4-20250514';
    }

    // ═══════════════════════════════════════════════════════════
    // CREATE BRAND
    // ═══════════════════════════════════════════════════════════

    async create(userId: string, dto: CreateAdBrandDto): Promise<AdBrand> {
        this.logger.log(`Creating Ad Brand: ${dto.name} for user ${userId}`);

        const brand = this.adBrandsRepository.create({
            ...dto,
            user_id: userId,
        });

        const saved = await this.adBrandsRepository.save(brand);
        this.logger.log(`Created Ad Brand: ${saved.id}`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET BRAND BY ID (with ownership check)
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdBrand> {
        const brand = await this.adBrandsRepository.findOne({
            where: { id },
            relations: ['user'],
        });

        if (!brand) {
            throw new NotFoundException(AdBrandMessage.BRAND_NOT_FOUND);
        }

        if (brand.user_id !== userId) {
            throw new ForbiddenException(AdBrandMessage.BRAND_ACCESS_DENIED);
        }

        return brand;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL BRANDS
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string): Promise<AdBrand[]> {
        return this.adBrandsRepository.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPLOAD BRAND ASSETS (both logos required)
    // ═══════════════════════════════════════════════════════════

    async uploadAssets(
        id: string,
        userId: string,
        logoLightUrl: string,
        logoDarkUrl: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        const updatedAssets: BrandAssets = {
            logo_light: logoLightUrl,
            logo_dark: logoDarkUrl,
        };

        brand.assets = updatedAssets;
        const saved = await this.adBrandsRepository.save(brand);

        this.logger.log(`Updated assets for Ad Brand ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE PLAYBOOK (brand / ads / copy)
    // Brand type uses real Claude AI; ads/copy use mocks for now.
    // ═══════════════════════════════════════════════════════════

    async analyzePlaybook(
        id: string,
        userId: string,
        type: PlaybookType,
        filePath?: string,
        pdfUrl?: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        this.logger.log(`Analyzing ${type} playbook for Ad Brand ${id}`);

        switch (type) {
            case PlaybookType.BRAND: {
                const brandPlaybook = await this.analyzeBrandPlaybookWithClaude(filePath!);
                brand.brand_playbook = brandPlaybook;
                break;
            }
            case PlaybookType.ADS: {
                const adsPlaybook = await this.mockAdsPlaybookAnalysis(pdfUrl);
                brand.ads_playbook = adsPlaybook;
                break;
            }
            case PlaybookType.COPY: {
                const copyPlaybook = await this.mockCopyPlaybookAnalysis(pdfUrl);
                brand.copy_playbook = copyPlaybook;
                break;
            }
        }

        const saved = await this.adBrandsRepository.save(brand);
        this.logger.log(`Saved ${type} playbook for Ad Brand ${id}`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // REAL CLAUDE AI PIPELINE - Brand Playbook Analysis
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyzes a Brand Guidelines PDF using Claude API.
     *
     * Pipeline:
     * 1. Read PDF file → Buffer → Base64
     * 2. Send to Claude as document content block
     * 3. Parse and validate JSON response
     * 4. Return typed BrandPlaybook
     */
    private async analyzeBrandPlaybookWithClaude(filePath: string): Promise<BrandPlaybook> {
        this.logger.log(`Analyzing brand playbook PDF with Claude: ${filePath}`);

        // Step 1: Read file and convert to Base64
        let pdfBase64: string;
        try {
            const fileBuffer = readFileSync(filePath);

            // Validate PDF header: Must allow %PDF
            // Checks if first 4 bytes are %PDF
            const header = fileBuffer.subarray(0, 4).toString('utf8');
            if (header !== '%PDF') {
                this.logger.error(`Invalid PDF header: ${header}`);
                throw new BadRequestException('Invalid PDF file: usage of a real PDF is required');
            }

            pdfBase64 = fileBuffer.toString('base64');
            this.logger.log(`PDF loaded: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Failed to read PDF file: ${error.message}`);
            throw new BadRequestException(AdBrandMessage.AI_PDF_UNREADABLE);
        }

        // Step 2: Initialize Anthropic client
        const client = this.getAnthropicClient();

        // Step 3: Send to Claude with prompt engineering
        let responseText: string;
        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: BRAND_ANALYSIS_SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'document',
                                source: {
                                    type: 'base64',
                                    media_type: 'application/pdf',
                                    data: pdfBase64,
                                },
                            },
                            {
                                type: 'text',
                                text: BRAND_ANALYSIS_USER_PROMPT,
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

            this.logger.log(`Claude response received (${message.usage?.input_tokens} in / ${message.usage?.output_tokens} out tokens)`);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Claude API call failed: ${error.message}`);
            throw new InternalServerErrorException(AdBrandMessage.AI_ANALYSIS_FAILED);
        }

        // Step 4: Parse JSON and validate
        const playbook = this.parseAndValidatePlaybook(responseText);

        this.logger.log(`Brand playbook extracted: ${playbook.colors.primary} primary, ${playbook.fonts.heading} heading`);
        return playbook;
    }

    // ═══════════════════════════════════════════════════════════
    // JSON PARSING & VALIDATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Parse Claude's response text into a validated BrandPlaybook.
     * Strips markdown code fences if present.
     */
    private parseAndValidatePlaybook(responseText: string): BrandPlaybook {
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
            throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
        }

        // Validate required top-level keys
        const requiredKeys = ['colors', 'fonts', 'tone_of_voice', 'logo_rules'];
        for (const key of requiredKeys) {
            if (!parsed[key]) {
                this.logger.error(`Missing required key in playbook: ${key}`);
                throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
            }
        }

        // Validate colors structure
        if (!parsed.colors.primary || !parsed.colors.secondary) {
            this.logger.error('Missing primary/secondary colors in playbook');
            throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
        }

        // Ensure palette is an array
        if (!Array.isArray(parsed.colors.palette)) {
            parsed.colors.palette = [parsed.colors.primary, parsed.colors.secondary];
        }

        // Ensure arrays exist
        if (!Array.isArray(parsed.tone_of_voice.keywords)) {
            parsed.tone_of_voice.keywords = [];
        }
        if (!Array.isArray(parsed.tone_of_voice.donts)) {
            parsed.tone_of_voice.donts = [];
        }
        if (!Array.isArray(parsed.logo_rules.forbidden_usage)) {
            parsed.logo_rules.forbidden_usage = [];
        }

        return parsed as BrandPlaybook;
    }

    // ═══════════════════════════════════════════════════════════
    // ANTHROPIC CLIENT (lazy init, cached)
    // ═══════════════════════════════════════════════════════════

    private getAnthropicClient(): Anthropic {
        if (this.anthropicClient) return this.anthropicClient;

        const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
        if (!apiKey) {
            throw new InternalServerErrorException(AdBrandMessage.AI_API_KEY_MISSING);
        }

        this.anthropicClient = new Anthropic({ apiKey });
        this.logger.log('Anthropic client initialized');

        return this.anthropicClient;
    }

    // ═══════════════════════════════════════════════════════════
    // MOCK ANALYSIS METHODS (ads / copy - to be replaced later)
    // ═══════════════════════════════════════════════════════════

    private async mockAdsPlaybookAnalysis(pdfUrl?: string): Promise<AdsPlaybook> {
        this.logger.log(`[MOCK] Analyzing ads playbook${pdfUrl ? `: ${pdfUrl}` : ''}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            layout_rules: {
                preferred_formats: ['9:16', '1:1', '4:5'],
                grid_system: '12-column grid',
                safe_zones: {
                    top: '10%',
                    bottom: '15%',
                    left: '5%',
                    right: '5%',
                },
            },
            visual_style: {
                image_treatment: 'high-contrast',
                overlay_opacity: 0.3,
                corner_radius: 12,
            },
        };
    }

    private async mockCopyPlaybookAnalysis(pdfUrl?: string): Promise<CopyPlaybook> {
        this.logger.log(`[MOCK] Analyzing copy playbook${pdfUrl ? `: ${pdfUrl}` : ''}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            hooks: [
                'Tired of {{pain_point}}?',
                'What if you could {{desired_outcome}}?',
                'Stop {{bad_habit}}. Start {{good_habit}}.',
            ],
            angles: [
                {
                    name: 'Problem-Solution',
                    description: 'Lead with the pain point, then present the product as the solution',
                    example_headlines: ['Still struggling with X?', 'The #1 solution for Y'],
                },
                {
                    name: 'Social Proof',
                    description: 'Leverage testimonials and numbers to build trust',
                    example_headlines: ['Join 10,000+ happy customers', 'Rated #1 by experts'],
                },
            ],
            cta_variations: ['Shop Now', 'Get Started', 'Try Free', 'Learn More'],
            forbidden_words: ['cheap', 'guarantee', 'best ever', 'miracle'],
        };
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE AND CREATE BRAND (Combined wizard flow)
    // Creates brand and analyzes playbook in one step
    // ═══════════════════════════════════════════════════════════

    async analyzeAndCreate(
        userId: string,
        name: string,
        website: string,
        filePath?: string,
        textContent?: string,
        industry?: string,
    ): Promise<{ brand: AdBrand; playbook: any }> {
        this.logger.log(`Analyze and Create Brand: ${name} for user ${userId}`);

        // Step 1: Create the brand first
        const brand = this.adBrandsRepository.create({
            name,
            website,
            industry: industry || 'General',
            user_id: userId,
        });

        const savedBrand = await this.adBrandsRepository.save(brand);
        this.logger.log(`Created brand: ${savedBrand.id}`);

        // Step 2: Analyze playbook (PDF or text)
        let playbook: any;

        if (filePath) {
            // Analyze PDF file
            playbook = await this.analyzeBrandPlaybookWithClaude(filePath);
        } else if (textContent) {
            // Analyze text content
            playbook = await this.analyzeTextWithClaude(textContent, name, website);
        } else {
            // Generate default playbook based on name/website
            playbook = this.generateDefaultPlaybook(name, website);
        }

        // Step 3: Save playbook to brand
        savedBrand.brand_playbook = playbook;
        await this.adBrandsRepository.save(savedBrand);

        return { brand: savedBrand, playbook };
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE BRAND PLAYBOOK (for Step 2 - user edits JSON)
    // ═══════════════════════════════════════════════════════════

    async updatePlaybook(
        brandId: string,
        userId: string,
        playbook: any,
    ): Promise<AdBrand> {
        const brand = await this.findOne(brandId, userId);

        brand.brand_playbook = playbook;
        const saved = await this.adBrandsRepository.save(brand);

        this.logger.log(`Updated playbook for brand ${brandId}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE TEXT WITH CLAUDE (for manual text input)
    // ═══════════════════════════════════════════════════════════

    private async analyzeTextWithClaude(
        textContent: string,
        brandName: string,
        website: string,
    ): Promise<any> {
        this.logger.log(`Analyzing brand from text input for: ${brandName}`);

        const client = this.getAnthropicClient();

        const systemPrompt = `You are a Senior Brand Strategist. Extract structured brand identity from the provided information.

RULES:
- Return ONLY valid JSON. No markdown, no explanation.
- Make professional inferences for missing values.
- All color values must be valid hex codes.`;

        const userPrompt = `Based on this brand information, create a structured brand playbook:

Brand Name: ${brandName}
Website: ${website}

Brand Description/Guidelines:
${textContent}

Return EXACTLY this JSON structure:
{
  "brand_name": "${brandName}",
  "website": "${website}",
  "brand_colors": {
    "primary": "#HEXCODE",
    "secondary": "#HEXCODE", 
    "background": "#F5F5F5",
    "text_dark": "#1a1a1e"
  },
  "typography": {
    "headline": "Font Name",
    "body": "Font Name"
  },
  "tone_of_voice": "describe the brand voice",
  "target_audience": {
    "gender": "male/female/all",
    "age_range": "25-44"
  }
}

Return ONLY the JSON object.`;

        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 2048,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: userPrompt,
                    },
                ],
            });

            const textBlock = message.content.find((block) => block.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
                throw new Error('No text response from Claude');
            }

            // Parse and return JSON
            let cleaned = textBlock.text.trim();
            if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
            if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
            if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
            cleaned = cleaned.trim();

            const parsed = JSON.parse(cleaned);
            this.logger.log(`Text analysis complete for ${brandName}`);
            return parsed;
        } catch (error) {
            this.logger.error(`Text analysis failed: ${error.message}`);
            // Return default playbook on error
            return this.generateDefaultPlaybook(brandName, website);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // GENERATE DEFAULT PLAYBOOK (fallback)
    // ═══════════════════════════════════════════════════════════

    private generateDefaultPlaybook(brandName: string, website: string): any {
        return {
            brand_name: brandName,
            website: website,
            brand_colors: {
                primary: '#7c4dff',
                secondary: '#9575cd',
                background: '#f5f5f5',
                text_dark: '#1a1a1e',
            },
            typography: {
                headline: 'Inter',
                body: 'Inter',
            },
            tone_of_voice: 'professional, friendly, trustworthy',
            target_audience: {
                gender: 'all',
                age_range: '25-54',
            },
        };
    }
}

