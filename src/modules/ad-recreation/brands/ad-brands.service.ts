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

const BRAND_ANALYSIS_SYSTEM_PROMPT = `You are a Senior Brand Strategist with 15+ years of experience extracting visual identity systems and product profiles from brand guideline documents.

Your job: Analyze the attached Brand Guidelines PDF and extract strict, structured data covering visual identity, product identity, target audience, and compliance.

RULES:
- Return ONLY valid JSON. No markdown, no explanation, no conversational text.
- If a value is not found in the PDF, make your best professional inference based on the visual design and content shown.
- All color values must be valid hex codes (e.g., "#1E3A5F").
- Font names should be as specific as possible (e.g., "Montserrat Bold", not just "Montserrat").
- For product_identity: describe the PRIMARY product shown or referenced in the document. Be specific about its physical appearance for image generation.`;

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
  },
  "product_identity": {
    "product_name": "The primary product name as stated in the document",
    "product_type": "Category (e.g., Foldable Pilates Reformer, Running Shoe, SaaS Platform)",
    "visual_description": "A detailed paragraph describing the product's physical appearance for image generation. Include shape, size, material, texture, and distinguishing visual features.",
    "key_features": ["feature1", "feature2", "feature3"],
    "colors": {"part_name": "#HEX", "another_part": "#HEX"},
    "negative_traits": ["What the product is NOT (e.g., NOT a traditional X)", "Does NOT have Y"]
  },
  "target_audience": {
    "gender": "Female / Male / All",
    "age_range": "e.g., 25-45",
    "body_type": "For human model selection (e.g., Fit and athletic, Average build)",
    "clothing_style": "For model wardrobe (e.g., Premium activewear, Business casual)",
    "personas": ["Persona 1 description", "Persona 2 description"]
  },
  "compliance": {
    "region": "UK / USA / Global",
    "rules": ["Regulatory constraint 1", "Regulatory constraint 2"]
  },
  "usp_offers": {
    "key_benefits": ["benefit1", "benefit2"],
    "current_offer": "e.g., 50% off, Free Shipping, or null if not found"
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
    private async analyzeBrandPlaybookWithClaude(filePath: string, logoLightPath?: string, logoDarkPath?: string): Promise<BrandPlaybook> {
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
        this.logger.log(`=== CLAUDE PDF ANALYSIS REQUEST ===`);
        this.logger.log(`Model: ${this.model}`);
        this.logger.log(`PDF size: ${(pdfBase64.length * 0.75 / 1024 / 1024).toFixed(2)} MB`);
        this.logger.log(`System Prompt: ${BRAND_ANALYSIS_SYSTEM_PROMPT.substring(0, 300)}...`);
        this.logger.log(`User Prompt: ${BRAND_ANALYSIS_USER_PROMPT.substring(0, 300)}...`);

        // Build content array with PDF + optional logo images
        const contentBlocks: any[] = [
            {
                type: 'document',
                source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: pdfBase64,
                },
            },
        ];

        // Add logo images if provided
        if (logoLightPath || logoDarkPath) {
            const logoImages = this.buildLogoImageBlocks(logoLightPath, logoDarkPath);
            contentBlocks.push(...logoImages);
        }

        contentBlocks.push({
            type: 'text',
            text: (logoLightPath || logoDarkPath)
                ? BRAND_ANALYSIS_USER_PROMPT + '\n\nIMPORTANT: I have also attached the brand logos (light and/or dark versions). Please analyze these logos carefully and include detailed logo_rules in your response based on the actual logo design, colors, and style you observe.'
                : BRAND_ANALYSIS_USER_PROMPT,
        });

        let responseText: string;
        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: BRAND_ANALYSIS_SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: contentBlocks,
                    },
                ],
            });

            // Extract text from response
            const textBlock = message.content.find((block) => block.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
                throw new Error('No text response from Claude');
            }
            responseText = textBlock.text;

            this.logger.log(`=== CLAUDE PDF ANALYSIS RESPONSE ===`);
            this.logger.log(`Input tokens: ${message.usage?.input_tokens}, Output tokens: ${message.usage?.output_tokens}`);
            this.logger.log(`Raw response (first 500 chars): ${responseText.substring(0, 500)}`);
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

        // Validate product_identity (optional but normalize if present)
        if (parsed.product_identity) {
            if (!parsed.product_identity.product_name) {
                parsed.product_identity.product_name = '';
            }
            if (!parsed.product_identity.product_type) {
                parsed.product_identity.product_type = '';
            }
            if (!parsed.product_identity.visual_description) {
                parsed.product_identity.visual_description = '';
            }
            if (!Array.isArray(parsed.product_identity.key_features)) {
                parsed.product_identity.key_features = [];
            }
            if (!parsed.product_identity.colors || typeof parsed.product_identity.colors !== 'object') {
                parsed.product_identity.colors = {};
            }
            if (!Array.isArray(parsed.product_identity.negative_traits)) {
                parsed.product_identity.negative_traits = [];
            }
        }

        // Validate target_audience (optional)
        if (parsed.target_audience) {
            if (!Array.isArray(parsed.target_audience.personas)) {
                parsed.target_audience.personas = [];
            }
        }

        // Validate compliance (optional)
        if (parsed.compliance) {
            if (!Array.isArray(parsed.compliance.rules)) {
                parsed.compliance.rules = [];
            }
        }

        // Validate usp_offers (optional)
        if (parsed.usp_offers) {
            if (!Array.isArray(parsed.usp_offers.key_benefits)) {
                parsed.usp_offers.key_benefits = [];
            }
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
    // ANALYZE ONLY (No brand creation)
    // Returns analyzed playbook JSON for user to review/edit
    // ═══════════════════════════════════════════════════════════

    async analyzeOnly(
        name: string,
        website: string,
        filePath?: string,
        textContent?: string,
        logoLightPath?: string,
        logoDarkPath?: string,
    ): Promise<any> {
        this.logger.log(`Analyze Only (no brand creation): ${name}`);
        this.logger.log(`=== ANALYZE ONLY INPUT ===`);
        this.logger.log(`Name: ${name}`);
        this.logger.log(`Website: ${website}`);
        this.logger.log(`FilePath: ${filePath || 'NONE'}`);
        this.logger.log(`TextContent: ${textContent ? textContent.substring(0, 200) + '...' : 'NONE'}`);
        this.logger.log(`LogoLight: ${logoLightPath || 'NONE'}`);
        this.logger.log(`LogoDark: ${logoDarkPath || 'NONE'}`);

        let playbook: any;

        if (filePath) {
            // Detect file type by extension
            const ext = filePath.toLowerCase().split('.').pop();
            this.logger.log(`Analyzing file with extension: ${ext}`);

            if (ext === 'pdf') {
                // Analyze PDF file with Claude vision
                playbook = await this.analyzeBrandPlaybookWithClaude(filePath, logoLightPath, logoDarkPath);
            } else if (ext === 'txt' || ext === 'docx') {
                // Read text file and analyze with Claude text
                const fileContent = await this.readTextFile(filePath, ext);
                playbook = await this.analyzeTextWithClaude(fileContent, name, website, logoLightPath, logoDarkPath);
            } else {
                // Unsupported file type - generate default
                this.logger.warn(`Unsupported file type: ${ext}, using default playbook`);
                playbook = this.generateDefaultPlaybook(name, website);
            }
        } else if (textContent) {
            // Analyze manual text content
            playbook = await this.analyzeTextWithClaude(textContent, name, website, logoLightPath, logoDarkPath);
        } else {
            // Generate default playbook based on name/website
            playbook = this.generateDefaultPlaybook(name, website);
        }

        this.logger.log(`Analysis complete for ${name}`);
        return playbook;
    }

    // ═══════════════════════════════════════════════════════════
    // CREATE WITH PLAYBOOK (User-edited playbook)
    // Called when user clicks "Save Brand" after reviewing JSON
    // ═══════════════════════════════════════════════════════════

    async createWithPlaybook(
        userId: string,
        name: string,
        website: string,
        industry: string,
        currency: string,
        playbook: any,
    ): Promise<AdBrand> {
        this.logger.log(`Create brand with playbook: ${name} for user ${userId}`);

        // Create brand with the user-edited playbook
        const brand = this.adBrandsRepository.create({
            name,
            website,
            industry,
            currency,
            user_id: userId,
            brand_playbook: playbook,
        });

        const savedBrand = await this.adBrandsRepository.save(brand);
        this.logger.log(`Brand created with playbook: ${savedBrand.id}`);

        return savedBrand;
    }

    // ═══════════════════════════════════════════════════════════
    // LEGACY: ANALYZE AND CREATE BRAND (Combined wizard flow)
    // Kept for backward compatibility - consider deprecating
    // ═══════════════════════════════════════════════════════════

    async analyzeAndCreate(
        userId: string,
        name: string,
        website: string,
        filePath?: string,
        textContent?: string,
        industry?: string,
    ): Promise<{ brand: AdBrand; playbook: any }> {
        this.logger.log(`[LEGACY] Analyze and Create Brand: ${name} for user ${userId}`);

        // Step 1: Create the brand first
        const brand = this.adBrandsRepository.create({
            name,
            website,
            industry: industry || 'General',
            user_id: userId,
        });

        const savedBrand = await this.adBrandsRepository.save(brand);
        this.logger.log(`Created brand: ${savedBrand.id}`);

        // Step 2: Analyze playbook (PDF, text file, or manual text)
        const playbook = await this.analyzeOnly(name, website, filePath, textContent);

        // Step 3: Save playbook to brand
        savedBrand.brand_playbook = playbook;
        await this.adBrandsRepository.save(savedBrand);

        return { brand: savedBrand, playbook };
    }

    // ═══════════════════════════════════════════════════════════
    // READ TEXT FILE (TXT or DOCX)
    // ═══════════════════════════════════════════════════════════

    private async readTextFile(filePath: string, ext: string): Promise<string> {
        try {
            if (ext === 'txt') {
                // Read plain text file
                const content = readFileSync(filePath, 'utf-8');
                this.logger.log(`Read TXT file: ${content.length} characters`);
                return content;
            } else if (ext === 'docx') {
                // For DOCX, read as binary and extract text (basic extraction)
                // In production, use a library like mammoth.js
                const buffer = readFileSync(filePath);
                // Basic text extraction - look for text between XML tags
                const text = buffer.toString('utf-8');
                const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                this.logger.log(`Read DOCX file: ${cleanText.length} characters (basic extraction)`);
                return cleanText;
            }
            return '';
        } catch (error) {
            this.logger.error(`Failed to read text file: ${error.message}`);
            throw new BadRequestException('Failed to read uploaded file');
        }
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
    // ANALYZE TEXT WITH CLAUDE (for manual text input or TXT files)
    // Uses enhanced prompt for strict JSON output with all required fields
    // ═══════════════════════════════════════════════════════════

    private async analyzeTextWithClaude(
        textContent: string,
        brandName: string,
        website: string,
        logoLightPath?: string,
        logoDarkPath?: string,
    ): Promise<any> {
        this.logger.log(`Analyzing brand from text input for: ${brandName}`);

        const client = this.getAnthropicClient();

        const systemPrompt = `Role: You are an expert Brand Strategist and Creative Director. Your task is to analyze raw brand documents (PDF text, website copy, or manual descriptions) and extract a strictly structured JSON Playbook.

Objective: Extract specific brand details to ensure future AI-generated ads are on-brand and legally compliant. You must not summarize vaguely; be specific.

Strict JSON Output Schema: You must return ONLY a valid JSON object matching this exact structure. Do not include markdown formatting (like \`\`\`json).

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
    "forbidden_usage": ["don't rotate", "don't change color"]
  },
  "product_identity": {
    "product_name": "The primary product name",
    "product_type": "Category (e.g., Foldable Pilates Reformer, Running Shoe)",
    "visual_description": "Detailed paragraph describing the product's physical appearance for image generation",
    "key_features": ["feature1", "feature2", "feature3"],
    "colors": {"part_name": "#HEX"},
    "negative_traits": ["What the product is NOT"]
  },
  "target_audience": {
    "gender": "Female / Male / All",
    "age_range": "e.g., 25-45",
    "body_type": "For model selection (e.g., Fit and athletic)",
    "clothing_style": "For model wardrobe (e.g., Premium activewear)",
    "personas": ["Persona 1", "Persona 2"]
  },
  "compliance": {
    "region": "UK / USA / Global",
    "rules": ["Constraint 1", "Constraint 2"]
  },
  "usp_offers": {
    "key_benefits": ["benefit1", "benefit2"],
    "current_offer": "e.g., 50% off, or null"
  }
}

Instructions:

1. Analyze Deeply: Read the input text thoroughly. Look for explicit mentions of colors, fonts, product details, and rules.

2. Infer if Necessary:
   - If Colors are named (e.g., "Lavender") but no Hex is provided, provide a standard Hex code for that color (e.g., #E6E6FA).
   - If Compliance is not explicitly stated, infer standard rules based on the industry.
   - If Personas are described in a paragraph, extract them into the list.
   - For product_identity: describe the PRIMARY product. Be specific about physical appearance for image generation.

3. Formatting: Ensure all Hex codes start with #. Ensure specific fields like compliance and personas are NEVER empty arrays if context allows inference.

CRITICAL: Return ONLY the JSON object. No explanation, no markdown.`;

        const userPrompt = `Input Text to Analyze:

Brand Name: ${brandName}
Website: ${website}

Brand Description/Guidelines:
${textContent}`;

        this.logger.log(`=== CLAUDE TEXT ANALYSIS REQUEST ===`);
        this.logger.log(`Model: ${this.model}`);
        this.logger.log(`System Prompt (first 300 chars): ${systemPrompt.substring(0, 300)}...`);
        this.logger.log(`User Prompt: ${userPrompt}`);
        this.logger.log(`Logo Light: ${logoLightPath || 'NONE'}, Logo Dark: ${logoDarkPath || 'NONE'}`);

        // Build content: text + optional logo images
        const hasLogos = logoLightPath || logoDarkPath;
        let messageContent: any;

        if (hasLogos) {
            const contentBlocks: any[] = [];
            const logoImages = this.buildLogoImageBlocks(logoLightPath, logoDarkPath);
            contentBlocks.push(...logoImages);
            contentBlocks.push({
                type: 'text',
                text: userPrompt + '\n\nIMPORTANT: I have also attached the brand logos (light and/or dark versions). Please analyze these logos carefully and include detailed logo_rules in your response based on the actual logo design, colors, and style you observe.',
            });
            messageContent = contentBlocks;
        } else {
            messageContent = userPrompt;
        }

        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: messageContent,
                    },
                ],
            });

            const textBlock = message.content.find((block) => block.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
                throw new Error('No text response from Claude');
            }

            this.logger.log(`=== CLAUDE TEXT ANALYSIS RESPONSE ===`);
            this.logger.log(`Input tokens: ${message.usage?.input_tokens}`);
            this.logger.log(`Output tokens: ${message.usage?.output_tokens}`);
            this.logger.log(`Raw response (first 500 chars): ${textBlock.text.substring(0, 500)}`);

            // Parse and validate through the same pipeline as PDF analysis
            const playbook = this.parseAndValidatePlaybook(textBlock.text);
            this.logger.log(`Text analysis complete for ${brandName}`);
            this.logger.log(`=== PARSED PLAYBOOK ===`);
            this.logger.log(JSON.stringify(playbook, null, 2));
            return playbook;
        } catch (error) {
            this.logger.error(`Text analysis failed: ${error.message}`);
            // Return default playbook on error
            return this.generateDefaultPlaybook(brandName, website);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // GENERATE DEFAULT PLAYBOOK (fallback)
    // Matches the comprehensive schema with all required fields
    // ═══════════════════════════════════════════════════════════

    /**
     * Build Claude image content blocks from logo file paths.
     * Reads logo files from disk and converts to base64 for Claude vision.
     */
    private buildLogoImageBlocks(logoLightPath?: string, logoDarkPath?: string): any[] {
        const blocks: any[] = [];

        const addLogoBlock = (path: string, label: string) => {
            try {
                const buffer = readFileSync(path);
                const ext = path.toLowerCase().split('.').pop();
                let mediaType = 'image/png';
                if (ext === 'jpg' || ext === 'jpeg') mediaType = 'image/jpeg';
                else if (ext === 'webp') mediaType = 'image/webp';
                else if (ext === 'svg') mediaType = 'image/png'; // SVG sent as-is may not work, fallback

                const base64 = buffer.toString('base64');
                this.logger.log(`Logo ${label} loaded: ${(buffer.length / 1024).toFixed(1)} KB, type: ${mediaType}`);

                blocks.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: mediaType,
                        data: base64,
                    },
                });
                blocks.push({
                    type: 'text',
                    text: `[Above image: Brand ${label}]`,
                });
            } catch (err) {
                this.logger.warn(`Failed to read logo ${label} at ${path}: ${err.message}`);
            }
        };

        if (logoLightPath) addLogoBlock(logoLightPath, 'Light Logo (for dark backgrounds)');
        if (logoDarkPath) addLogoBlock(logoDarkPath, 'Dark Logo (for light backgrounds)');

        return blocks;
    }

    private generateDefaultPlaybook(brandName: string, website: string): BrandPlaybook {
        return {
            colors: {
                primary: '#7c4dff',
                secondary: '#9575cd',
                accent: '#ff6b6b',
                palette: ['#7c4dff', '#9575cd', '#ff6b6b'],
            },
            fonts: {
                heading: 'Inter',
                body: 'Inter',
                usage_rules: '',
            },
            tone_of_voice: {
                style: 'Professional',
                keywords: [],
                donts: [],
            },
            logo_rules: {
                clear_space: '',
                forbidden_usage: [],
            },
            product_identity: {
                product_name: brandName,
                product_type: 'Product',
                visual_description: `A product by ${brandName}. Update this field with a detailed visual description for accurate image generation.`,
                key_features: [],
                colors: {},
                negative_traits: [],
            },
            target_audience: {
                gender: 'All',
                age_range: '25-54',
                personas: [],
            },
            compliance: {
                region: 'Global',
                rules: [],
            },
            usp_offers: {
                key_benefits: [],
            },
        };
    }
}

