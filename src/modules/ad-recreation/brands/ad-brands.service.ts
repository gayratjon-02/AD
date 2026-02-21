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
import { MARKETING_ANGLES } from '../configurations/constants/marketing-angles';
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════
// STRICT EXTRACTION PROMPT (ZERO HALLUCINATION)
// ═══════════════════════════════════════════════════════════

const STRICT_EXTRACTION_SYSTEM_PROMPT = `You are a STRICT information extraction engine for the ROMIMI Platform.
Your job is NOT to be creative. Your job is to extract ONLY what is explicitly provided by the user.

ABSOLUTE RULES (ZERO TOLERANCE)
1) DO NOT add new rules, new claims, new benefits, new compliance notes, new "donts", or any inferred details.
2) DO NOT paraphrase or upgrade claims (e.g. "back-pain friendly" MUST NOT become "back-pain relief").
3) DO NOT generalize. If the user did not say it, it must not appear in JSON.
4) If a field is missing, set it to null and add a validation_issue.
5) NEVER invent disclaimers like "must include disclaimers" unless explicitly provided.
6) NEVER create "product_identity" for service brands unless the user explicitly provided product name/type.
7) Outputs must be VALID JSON ONLY. No markdown. No commentary outside JSON.

SOURCE EVIDENCE REQUIREMENT
- Every non-null field in the output MUST include evidence: the exact substring quote from the input.
- If you cannot quote it, you must NOT output it (set null) and record a validation_issue.

MEDICAL / COMPLIANCE GUARDRAILS
- If the input contains potentially medical language, you MUST preserve it exactly as written.
- You MUST NOT transform into stronger medical claims.
- If you detect a risky claim in input, do NOT remove it; keep it but flag it in compliance_risks with evidence.`;

const STRICT_EXTRACTION_USER_PROMPT = `Extract brand information from the provided input.

Return EXACTLY this JSON object (no extra keys, no markdown, no explanation):

{
  "version": "brand_playbook_extraction_v1",
  "data": {
    "brand_name": "string or null",
    "industry": "string or null",
    "website": "string or null",
    "currency": "string or null",
    "target_audience": {
      "gender": "string or null",
      "age_range": "string or null",
      "personas": ["string"] or null
    },
    "brand_colors": {
      "primary": "#HEX or null",
      "secondary": "#HEX or null",
      "background": "#HEX or null",
      "accent": "#HEX or null",
      "text_dark": "#HEX or null",
      "text_light": "#HEX or null"
    },
    "typography": {
      "headline": "string or null",
      "body": "string or null"
    },
    "tone_of_voice": "string or null",
    "tone_keywords": ["string"] or null,
    "usps": ["string"] or null,
    "compliance": {
      "region": "string or null",
      "rules": ["string"] or null
    },
    "current_offer": {
      "discount": "string or null",
      "price_original": "string or null",
      "price_sale": "string or null",
      "free_gifts": ["string"] or null,
      "free_gifts_value": "string or null",
      "delivery": "string or null"
    },
    "logo_rules": {
      "clear_space": "string or null",
      "forbidden_usage": ["string"] or null
    }
  },
  "evidence_map": {
    "field_path": "exact substring quote from input that supports this value"
  },
  "validation_issues": [
    "description of any missing, ambiguous, or conflicting fields"
  ],
  "compliance_risks": [
    "risky claims found IN the input (do NOT invent risks)"
  ]
}

RULES:
- Use null for any field not explicitly found in the input.
- Every non-null value in data MUST have a corresponding entry in evidence_map.
- DO NOT paraphrase, upgrade, or infer. Extract ONLY what is written.
- Return ONLY the JSON object.`;

// Legacy prompt constants kept for ads/copy playbook types (not affected by this change)
const BRAND_ANALYSIS_SYSTEM_PROMPT = STRICT_EXTRACTION_SYSTEM_PROMPT;
const BRAND_ANALYSIS_USER_PROMPT = STRICT_EXTRACTION_USER_PROMPT;

// ═══════════════════════════════════════════════════════════
// ADS PLAYBOOK PROMPTS
// ═══════════════════════════════════════════════════════════

const ADS_PLAYBOOK_SYSTEM_PROMPT = `You are a Senior Ad Creative Director with 15+ years of experience analyzing ad style guides, brand visual standards, and layout systems.

Your job: Analyze the attached PDF document and extract structured layout rules and visual style guidelines for ad generation.

RULES:
- Return ONLY valid JSON. No markdown, no explanation, no conversational text.
- If a value is not found in the PDF, make your best professional inference based on the visual design, layout examples, and content shown.
- Be specific about layout preferences, grid systems, and safe zones.
- For visual_style, describe the image treatment approach (e.g., high-contrast, muted tones, vibrant saturation).`;

const ADS_PLAYBOOK_USER_PROMPT = `Analyze this PDF and extract ad layout rules and visual style guidelines.

Return EXACTLY this JSON structure:

{
  "layout_rules": {
    "preferred_formats": ["9:16", "1:1", "4:5"],
    "grid_system": "e.g., 12-column grid, rule of thirds, center-aligned",
    "safe_zones": {
      "top": "percentage or pixel value for top safe zone",
      "bottom": "percentage or pixel value for bottom safe zone",
      "left": "percentage or pixel value for left safe zone",
      "right": "percentage or pixel value for right safe zone"
    }
  },
  "visual_style": {
    "image_treatment": "e.g., high-contrast, soft lighting, editorial, lifestyle, flat-lay",
    "overlay_opacity": 0.3,
    "corner_radius": 12
  }
}

Notes:
- preferred_formats: List ad aspect ratios shown or recommended in the document (e.g., "9:16", "1:1", "4:5", "16:9").
- grid_system: Describe the layout grid or alignment system used.
- safe_zones: Extract any safe zone / margin / padding guidelines.
- image_treatment: Describe the overall photo/image style.
- overlay_opacity: If overlays are used, estimate opacity (0.0-1.0). Default to 0.3 if not specified.
- corner_radius: If rounded corners are used, estimate radius in pixels. Default to 0 if not specified.

Return ONLY the JSON object. No markdown code fences. No explanation.`;

// ═══════════════════════════════════════════════════════════
// COPY PLAYBOOK PROMPTS
// ═══════════════════════════════════════════════════════════

const COPY_PLAYBOOK_SYSTEM_PROMPT = `You are a Senior Copywriter and Brand Voice Strategist with 15+ years of experience analyzing brand documents to extract copywriting guidelines, messaging frameworks, and tone-of-voice rules.

Your job: Analyze the attached PDF document and extract structured copywriting guidelines for ad generation.

RULES:
- Return ONLY valid JSON. No markdown, no explanation, no conversational text.
- If a value is not found in the PDF, make your best professional inference based on the brand's tone, messaging examples, and content shown.
- Hooks should use template variables like {{pain_point}}, {{desired_outcome}}, {{product_name}} where appropriate.
- Extract at least 3-5 hooks, 2-4 angles, and 3-6 CTA variations.`;

const COPY_PLAYBOOK_USER_PROMPT = `Analyze this PDF and extract copywriting guidelines, messaging hooks, and tone-of-voice rules.

Return EXACTLY this JSON structure:

{
  "hooks": [
    "Tired of {{pain_point}}?",
    "What if you could {{desired_outcome}}?",
    "Stop {{bad_habit}}. Start {{good_habit}}.",
    "The secret to {{desired_outcome}} that nobody talks about",
    "Why {{target_audience}} are switching to {{product_name}}"
  ],
  "angles": [
    {
      "name": "Problem-Solution",
      "description": "Lead with the pain point, then present the product as the solution",
      "example_headlines": ["Still struggling with X?", "The #1 solution for Y"]
    },
    {
      "name": "Social Proof",
      "description": "Leverage testimonials and numbers to build trust",
      "example_headlines": ["Join 10,000+ happy customers", "Rated #1 by experts"]
    }
  ],
  "cta_variations": ["Shop Now", "Get Started", "Try Free", "Learn More", "Discover More"],
  "forbidden_words": ["cheap", "guarantee", "best ever", "miracle"]
}

Notes:
- hooks: Copywriting hooks/templates with {{variables}} for dynamic insertion. Extract from the document's messaging examples.
- angles: Marketing message angles with name, description, and example headlines. Infer from the brand's positioning.
- cta_variations: Call-to-action button texts. Extract from existing CTAs or infer from brand tone.
- forbidden_words: Words/phrases the brand should never use. Extract from brand guidelines or infer from tone.

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
    // DELETE BRAND
    // ═══════════════════════════════════════════════════════════

    async remove(id: string, userId: string): Promise<{ message: string }> {
        const brand = await this.findOne(id, userId);
        await this.adBrandsRepository.remove(brand);
        this.logger.log(`Deleted Ad Brand: ${id}`);
        return { message: AdBrandMessage.BRAND_DELETED };
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
    // CUSTOM ANGLES
    // ═══════════════════════════════════════════════════════════

    async addCustomAngle(brandId: string, userId: string, angleData: { name: string; description: string; hook: string }): Promise<AdBrand> {
        const brand = await this.findOne(brandId, userId);

        const newAngle = {
            id: `custom_${uuidv4()}`,
            category: 'custom',
            name: angleData.name,
            label: angleData.name,
            description: angleData.description,
            hook: angleData.hook,
            created_at: new Date().toISOString(),
        };

        const currentAngles = brand.custom_angles || [];
        brand.custom_angles = [...currentAngles, newAngle];

        const saved = await this.adBrandsRepository.save(brand);
        this.logger.log(`Added custom angle to Brand ${brandId}`);
        return saved;
    }

    async getAngles(brandId: string, userId: string): Promise<any[]> {
        const brand = await this.findOne(brandId, userId);
        const customAngles = brand.custom_angles || [];

        // Merge with predefined
        return [...MARKETING_ANGLES, ...customAngles];
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE PLAYBOOK (brand / ads / copy)
    // All types use real Claude AI analysis.
    // ═══════════════════════════════════════════════════════════

    async analyzePlaybook(
        id: string,
        userId: string,
        type: PlaybookType,
        filePath?: string,
        pdfUrl?: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        if (!filePath) {
            throw new BadRequestException(AdBrandMessage.PLAYBOOK_FILE_REQUIRED);
        }

        this.logger.log(`Analyzing ${type} playbook for Ad Brand ${id}`);

        switch (type) {
            case PlaybookType.BRAND: {
                const brandPlaybook = await this.analyzeBrandPlaybookWithClaude(filePath);
                brand.brand_playbook = brandPlaybook;
                break;
            }
            case PlaybookType.ADS: {
                const adsPlaybook = await this.analyzeAdsPlaybookWithClaude(filePath);
                brand.ads_playbook = adsPlaybook;
                break;
            }
            case PlaybookType.COPY: {
                const copyPlaybook = await this.analyzeCopyPlaybookWithClaude(filePath);
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
    // STRICT EXTRACTION PARSER + EVIDENCE VALIDATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Parse Claude's strict extraction response and validate evidence.
     * Returns the raw strict extraction result for logging/debugging,
     * AND converts data → BrandPlaybook for the rest of the pipeline.
     */
    private parseAndValidatePlaybook(responseText: string, inputText?: string): BrandPlaybook {
        const parsed = this.parseJsonResponse(responseText);

        // ── Check if this is the new strict extraction format ──
        if (parsed.version === 'brand_playbook_extraction_v1' && parsed.data) {
            this.logger.log(`[STRICT EXTRACTION] v1 format detected`);
            return this.processStrictExtraction(parsed, inputText);
        }

        // ── Legacy format — passthrough with minimal validation ──
        this.logger.warn(`[STRICT EXTRACTION] Legacy format detected — no evidence validation`);
        return this.legacyParsePlaybook(parsed);
    }

    /**
     * Process strict extraction result:
     * 1. Validate evidence_map completeness
     * 2. Log validation_issues and compliance_risks
     * 3. Map to BrandPlaybook
     */
    private processStrictExtraction(extraction: any, inputText?: string): BrandPlaybook {
        const { data, evidence_map, validation_issues, compliance_risks } = extraction;

        // ── Log evidence coverage ──
        const evidenceKeys = Object.keys(evidence_map || {});
        this.logger.log(`[EVIDENCE] ${evidenceKeys.length} evidence entries provided`);
        evidenceKeys.forEach(k => this.logger.log(`   ✅ ${k}: "${(evidence_map[k] || '').substring(0, 80)}..."`));

        // ── Log validation issues ──
        if (validation_issues?.length) {
            this.logger.warn(`[VALIDATION ISSUES] ${validation_issues.length} issues found:`);
            validation_issues.forEach((issue: string) => this.logger.warn(`   ⚠️ ${issue}`));
        }

        // ── Log compliance risks ──
        if (compliance_risks?.length) {
            this.logger.warn(`[COMPLIANCE RISKS] ${compliance_risks.length} risks found:`);
            compliance_risks.forEach((risk: string) => this.logger.warn(`   🚨 ${risk}`));
        }

        // ── Evidence-against-input validation (for text analysis) ──
        if (inputText && evidence_map) {
            const inputLower = inputText.toLowerCase();
            const invalidEvidence: string[] = [];
            for (const [field, quote] of Object.entries(evidence_map)) {
                if (quote && typeof quote === 'string') {
                    // Check if evidence quote exists in the input (case-insensitive fuzzy match)
                    const quoteLower = (quote as string).toLowerCase().trim();
                    if (quoteLower.length > 3 && !inputLower.includes(quoteLower)) {
                        invalidEvidence.push(`${field}: "${quote}"`);
                    }
                }
            }
            if (invalidEvidence.length > 0) {
                this.logger.warn(`[EVIDENCE VALIDATION] ${invalidEvidence.length} evidence quotes NOT found in input:`);
                invalidEvidence.forEach(e => this.logger.warn(`   ❌ ${e}`));
            }
        }

        // ── Check for additional properties in data ──
        const allowedDataKeys = [
            'brand_name', 'industry', 'website', 'currency',
            'target_audience', 'brand_colors', 'typography',
            'tone_of_voice', 'tone_keywords', 'usps',
            'compliance', 'current_offer', 'logo_rules',
        ];
        const extraKeys = Object.keys(data || {}).filter(k => !allowedDataKeys.includes(k));
        if (extraKeys.length > 0) {
            this.logger.warn(`[STRICT] Additional properties found (not in schema): ${extraKeys.join(', ')}`);
        }

        // ── Map to BrandPlaybook ──
        return this.mapStrictToBrandPlaybook(data);
    }

    /**
     * Maps the strict extraction data schema → BrandPlaybook
     * so the rest of the pipeline (ad generation, image prompts) works unchanged.
     */
    private mapStrictToBrandPlaybook(data: any): BrandPlaybook {
        const d = data || {};
        const colors = d.brand_colors || {};
        const typography = d.typography || {};
        const ta = d.target_audience || {};
        const compliance = d.compliance || {};
        const offer = d.current_offer || {};
        const logoRules = d.logo_rules || {};

        // Build palette from available colors (only non-null)
        const palette = [colors.primary, colors.secondary, colors.accent, colors.background]
            .filter((c: string | null) => c != null) as string[];

        // Build current_offer string
        let currentOfferStr: string | undefined;
        const offerParts: string[] = [];
        if (offer.discount) offerParts.push(offer.discount);
        if (offer.price_sale && offer.price_original) offerParts.push(`${offer.price_original} → ${offer.price_sale}`);
        else if (offer.price_sale) offerParts.push(offer.price_sale);
        if (offer.delivery) offerParts.push(offer.delivery);
        if (offer.free_gifts?.length) offerParts.push(`Free: ${offer.free_gifts.join(', ')}`);
        if (offerParts.length > 0) currentOfferStr = offerParts.join(' | ');

        const playbook: BrandPlaybook = {
            colors: {
                primary: colors.primary || '#000000',
                secondary: colors.secondary || '#666666',
                accent: colors.accent || '#ff6b6b',
                palette: palette.length > 0 ? palette : ['#000000', '#666666'],
            },
            fonts: {
                heading: typography.headline || '',
                body: typography.body || '',
                usage_rules: '',
            },
            tone_of_voice: {
                style: (typeof d.tone_of_voice === 'string') ? d.tone_of_voice : '',
                keywords: Array.isArray(d.tone_keywords) ? d.tone_keywords : [],
                donts: [], // Not in strict schema — never hallucinated
            },
            logo_rules: {
                clear_space: logoRules.clear_space || '',
                forbidden_usage: Array.isArray(logoRules.forbidden_usage) ? logoRules.forbidden_usage : [],
            },
        };

        // Target audience (optional)
        if (ta.gender || ta.age_range || ta.personas) {
            playbook.target_audience = {
                gender: ta.gender || 'All',
                age_range: ta.age_range || '',
                personas: Array.isArray(ta.personas) ? ta.personas : [],
            };
        }

        // Compliance (optional)
        if (compliance.region || compliance.rules?.length) {
            playbook.compliance = {
                region: compliance.region || 'Global',
                rules: Array.isArray(compliance.rules) ? compliance.rules : [],
            };
        }

        // USP offers (optional)
        if (d.usps?.length || currentOfferStr) {
            playbook.usp_offers = {
                key_benefits: Array.isArray(d.usps) ? d.usps : [],
                current_offer: currentOfferStr,
            };
        }

        this.logger.log(`[MAPPER] Strict → BrandPlaybook mapped successfully`);
        this.logger.log(`   Colors: ${playbook.colors.primary} / ${playbook.colors.secondary}`);
        this.logger.log(`   Fonts: ${playbook.fonts.heading || 'N/A'} / ${playbook.fonts.body || 'N/A'}`);
        if (playbook.target_audience) this.logger.log(`   Audience: ${playbook.target_audience.gender}, ${playbook.target_audience.age_range}`);

        return playbook;
    }

    /**
     * Legacy playbook parser — for backward compatibility with old-format responses.
     */
    private legacyParsePlaybook(parsed: any): BrandPlaybook {
        // Validate required top-level keys
        const requiredKeys = ['colors', 'fonts', 'tone_of_voice', 'logo_rules'];
        for (const key of requiredKeys) {
            if (!parsed[key]) {
                this.logger.error(`Missing required key in playbook: ${key}`);
                throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
            }
        }

        if (!parsed.colors.primary || !parsed.colors.secondary) {
            this.logger.error('Missing primary/secondary colors in playbook');
            throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
        }

        if (!Array.isArray(parsed.colors.palette)) {
            parsed.colors.palette = [parsed.colors.primary, parsed.colors.secondary];
        }
        if (!Array.isArray(parsed.tone_of_voice.keywords)) parsed.tone_of_voice.keywords = [];
        if (!Array.isArray(parsed.tone_of_voice.donts)) parsed.tone_of_voice.donts = [];
        if (!Array.isArray(parsed.logo_rules.forbidden_usage)) parsed.logo_rules.forbidden_usage = [];

        if (parsed.product_identity) {
            parsed.product_identity.product_name = parsed.product_identity.product_name || '';
            parsed.product_identity.product_type = parsed.product_identity.product_type || '';
            parsed.product_identity.visual_description = parsed.product_identity.visual_description || '';
            if (!Array.isArray(parsed.product_identity.key_features)) parsed.product_identity.key_features = [];
            if (!parsed.product_identity.colors || typeof parsed.product_identity.colors !== 'object') parsed.product_identity.colors = {};
            if (!Array.isArray(parsed.product_identity.negative_traits)) parsed.product_identity.negative_traits = [];
        }
        if (parsed.target_audience && !Array.isArray(parsed.target_audience.personas)) parsed.target_audience.personas = [];
        if (parsed.compliance && !Array.isArray(parsed.compliance.rules)) parsed.compliance.rules = [];
        if (parsed.usp_offers && !Array.isArray(parsed.usp_offers.key_benefits)) parsed.usp_offers.key_benefits = [];

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
    // REAL CLAUDE AI — Ads Playbook Analysis
    // ═══════════════════════════════════════════════════════════

    private async analyzeAdsPlaybookWithClaude(filePath: string): Promise<AdsPlaybook> {
        this.logger.log(`Analyzing ads playbook PDF with Claude: ${filePath}`);

        const pdfBase64 = this.readPdfAsBase64(filePath);
        const client = this.getAnthropicClient();

        const message = await client.messages.create({
            model: this.model,
            max_tokens: 2048,
            system: ADS_PLAYBOOK_SYSTEM_PROMPT,
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
                        { type: 'text', text: ADS_PLAYBOOK_USER_PROMPT },
                    ],
                },
            ],
        });

        const textBlock = message.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            throw new InternalServerErrorException(AdBrandMessage.AI_ANALYSIS_FAILED);
        }

        this.logger.log(`Ads playbook analysis - Input: ${message.usage?.input_tokens}, Output: ${message.usage?.output_tokens} tokens`);

        const parsed = this.parseJsonResponse(textBlock.text);

        // Normalize arrays and defaults
        if (parsed.layout_rules) {
            if (!Array.isArray(parsed.layout_rules.preferred_formats)) {
                parsed.layout_rules.preferred_formats = ['9:16', '1:1', '4:5'];
            }
            if (!parsed.layout_rules.grid_system) {
                parsed.layout_rules.grid_system = 'rule of thirds';
            }
            if (!parsed.layout_rules.safe_zones || typeof parsed.layout_rules.safe_zones !== 'object') {
                parsed.layout_rules.safe_zones = { top: '10%', bottom: '15%', left: '5%', right: '5%' };
            }
        } else {
            parsed.layout_rules = {
                preferred_formats: ['9:16', '1:1', '4:5'],
                grid_system: 'rule of thirds',
                safe_zones: { top: '10%', bottom: '15%', left: '5%', right: '5%' },
            };
        }

        if (parsed.visual_style) {
            if (typeof parsed.visual_style.overlay_opacity !== 'number') {
                parsed.visual_style.overlay_opacity = 0.3;
            }
            if (typeof parsed.visual_style.corner_radius !== 'number') {
                parsed.visual_style.corner_radius = 0;
            }
        } else {
            parsed.visual_style = {
                image_treatment: 'high-contrast',
                overlay_opacity: 0.3,
                corner_radius: 0,
            };
        }

        this.logger.log(`Ads playbook extracted: ${parsed.layout_rules.preferred_formats.length} formats, style: ${parsed.visual_style.image_treatment}`);
        return parsed as AdsPlaybook;
    }

    // ═══════════════════════════════════════════════════════════
    // REAL CLAUDE AI — Copy Playbook Analysis
    // ═══════════════════════════════════════════════════════════

    private async analyzeCopyPlaybookWithClaude(filePath: string): Promise<CopyPlaybook> {
        this.logger.log(`Analyzing copy playbook PDF with Claude: ${filePath}`);

        const pdfBase64 = this.readPdfAsBase64(filePath);
        const client = this.getAnthropicClient();

        const message = await client.messages.create({
            model: this.model,
            max_tokens: 2048,
            system: COPY_PLAYBOOK_SYSTEM_PROMPT,
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
                        { type: 'text', text: COPY_PLAYBOOK_USER_PROMPT },
                    ],
                },
            ],
        });

        const textBlock = message.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            throw new InternalServerErrorException(AdBrandMessage.AI_ANALYSIS_FAILED);
        }

        this.logger.log(`Copy playbook analysis - Input: ${message.usage?.input_tokens}, Output: ${message.usage?.output_tokens} tokens`);

        const parsed = this.parseJsonResponse(textBlock.text);

        // Normalize arrays and defaults
        if (!Array.isArray(parsed.hooks)) {
            parsed.hooks = [];
        }
        if (!Array.isArray(parsed.angles)) {
            parsed.angles = [];
        }
        // Normalize each angle
        parsed.angles = parsed.angles.map((angle: any) => ({
            name: angle.name || 'Unnamed Angle',
            description: angle.description || '',
            example_headlines: Array.isArray(angle.example_headlines) ? angle.example_headlines : [],
        }));
        if (!Array.isArray(parsed.cta_variations)) {
            parsed.cta_variations = ['Shop Now', 'Learn More'];
        }
        if (!Array.isArray(parsed.forbidden_words)) {
            parsed.forbidden_words = [];
        }

        this.logger.log(`Copy playbook extracted: ${parsed.hooks.length} hooks, ${parsed.angles.length} angles, ${parsed.cta_variations.length} CTAs`);
        return parsed as CopyPlaybook;
    }

    // ═══════════════════════════════════════════════════════════
    // SHARED HELPERS — PDF reading + JSON parsing
    // ═══════════════════════════════════════════════════════════

    private readPdfAsBase64(filePath: string): string {
        try {
            const fileBuffer = readFileSync(filePath);
            const header = fileBuffer.subarray(0, 4).toString('utf8');
            if (header !== '%PDF') {
                throw new BadRequestException('Invalid PDF file: a real PDF is required');
            }
            this.logger.log(`PDF loaded: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            return fileBuffer.toString('base64');
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Failed to read PDF file: ${error.message}`);
            throw new BadRequestException(AdBrandMessage.AI_PDF_UNREADABLE);
        }
    }

    private parseJsonResponse(responseText: string): any {
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

        try {
            return JSON.parse(cleaned);
        } catch {
            this.logger.error(`Failed to parse Claude response as JSON: ${cleaned.substring(0, 200)}...`);
            throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
        }
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
    // ANALYZE TEXT WITH CLAUDE — STRICT EXTRACTION MODE
    // Uses the same zero-hallucination prompt as PDF analysis.
    // Passes inputText for evidence-against-input validation.
    // ═══════════════════════════════════════════════════════════

    private async analyzeTextWithClaude(
        textContent: string,
        brandName: string,
        website: string,
        logoLightPath?: string,
        logoDarkPath?: string,
    ): Promise<any> {
        this.logger.log(`[STRICT TEXT ANALYSIS] Analyzing brand from text input for: ${brandName}`);

        const client = this.getAnthropicClient();

        // Use the same strict extraction prompt — NO inference, NO paraphrasing
        const systemPrompt = STRICT_EXTRACTION_SYSTEM_PROMPT;

        const userPrompt = `${STRICT_EXTRACTION_USER_PROMPT}

Input Text to Analyze:

Brand Name: ${brandName}
Website: ${website}

Brand Description/Guidelines:
${textContent}`;

        this.logger.log(`=== CLAUDE STRICT TEXT ANALYSIS REQUEST ===`);
        this.logger.log(`Model: ${this.model}`);
        this.logger.log(`System Prompt: STRICT_EXTRACTION_SYSTEM_PROMPT (zero hallucination mode)`);
        this.logger.log(`Input text length: ${textContent.length} chars`);
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
                text: userPrompt + '\n\nI have also attached the brand logos (light and/or dark versions). Extract logo_rules ONLY from what you actually observe in the logos. Do NOT invent rules.',
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

            this.logger.log(`=== CLAUDE STRICT TEXT ANALYSIS RESPONSE ===`);
            this.logger.log(`Input tokens: ${message.usage?.input_tokens}`);
            this.logger.log(`Output tokens: ${message.usage?.output_tokens}`);
            this.logger.log(`Raw response (first 500 chars): ${textBlock.text.substring(0, 500)}`);

            // Parse with evidence validation — pass the original textContent for quote checking
            const playbook = this.parseAndValidatePlaybook(textBlock.text, textContent);
            this.logger.log(`Strict text analysis complete for ${brandName}`);
            this.logger.log(`=== PARSED PLAYBOOK ===`);
            this.logger.log(JSON.stringify(playbook, null, 2));
            return playbook;
        } catch (error) {
            this.logger.error(`Strict text analysis failed: ${error.message}`);
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

