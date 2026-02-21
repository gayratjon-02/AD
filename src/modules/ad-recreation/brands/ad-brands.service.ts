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
// fs import removed — all file data now comes as Buffer from memoryStorage
import Anthropic from '@anthropic-ai/sdk';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import { CreateAdBrandDto, PlaybookType } from '../../../libs/dto/AdRecreation/brands';
import {
    BrandPlaybook,
    normalizeBrandPlaybook,
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
  "version": "brand_playbook_extraction_v2",
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
    "tone_of_voice": "single comma-separated string or null",
    "usps": ["string"] or null,
    "compliance": {
      "region": "string or null",
      "rules": ["string"] or null
    },
    "current_offer": {
      "discount": "string or null (e.g. '-50%')",
      "price_original": "number-only string or null (e.g. '179.95' — NO currency symbol)",
      "price_sale": "number-only string or null (e.g. '89.98' — NO currency symbol)",
      "free_gifts": ["string"] or null,
      "free_gifts_value": "number-only string or null (e.g. '195.75' — NO currency symbol)",
      "delivery": "string or null (e.g. 'FREE Next-Day Delivery')"
    },
    "logo": {
      "style": "string or null (e.g. 'wordmark', 'icon', 'combination')"
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
- tone_of_voice MUST be a single comma-separated string (e.g. "warm, empowering, relatable"), NOT an object.
- usps MUST be a flat array of strings at root level (e.g. ["Folds flat", "15 min/day"]).
- current_offer MUST be a structured object with separate fields, NOT a concatenated string.
- PRICES MUST BE NUMBERS ONLY — strip ALL currency symbols (£, $, €, etc.). The currency is stored separately in the "currency" field. Example: "£179.95" → "179.95", "$89.98" → "89.98".
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

        // Also update logo URLs in brand_playbook
        if (brand.brand_playbook) {
            brand.brand_playbook.logo = {
                ...(brand.brand_playbook.logo || {}),
                light_url: logoLightUrl,
                dark_url: logoDarkUrl,
            };
        }

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
        fileBuffer?: Buffer,
        pdfUrl?: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        if (!fileBuffer) {
            throw new BadRequestException(AdBrandMessage.PLAYBOOK_FILE_REQUIRED);
        }

        this.logger.log(`Analyzing ${type} playbook for Ad Brand ${id}`);

        switch (type) {
            case PlaybookType.BRAND: {
                const brandPlaybook = await this.analyzeBrandPlaybookWithClaude(fileBuffer);
                brand.brand_playbook = brandPlaybook;
                break;
            }
            case PlaybookType.ADS: {
                const adsPlaybook = await this.analyzeAdsPlaybookWithClaude(fileBuffer);
                brand.ads_playbook = adsPlaybook;
                break;
            }
            case PlaybookType.COPY: {
                const copyPlaybook = await this.analyzeCopyPlaybookWithClaude(fileBuffer);
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
    private async analyzeBrandPlaybookWithClaude(fileBuffer: Buffer): Promise<BrandPlaybook> {
        this.logger.log(`Analyzing brand playbook PDF with Claude`);

        // Step 1: Validate PDF and convert to Base64
        const pdfBase64 = this.bufferToPdfBase64(fileBuffer);

        // Step 2: Initialize Anthropic client
        const client = this.getAnthropicClient();

        // Step 3: Send to Claude with prompt engineering
        this.logger.log(`=== CLAUDE PDF ANALYSIS REQUEST ===`);
        this.logger.log(`Model: ${this.model}`);
        this.logger.log(`PDF size: ${(pdfBase64.length * 0.75 / 1024 / 1024).toFixed(2)} MB`);

        const contentBlocks: any[] = [
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
        ];

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

        this.logger.log(`Brand playbook extracted: ${playbook.brand_colors.primary} primary, ${playbook.typography.headline} headline`);
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

        // ── Check if this is the strict extraction format ──
        if ((parsed.version === 'brand_playbook_extraction_v1' || parsed.version === 'brand_playbook_extraction_v2') && parsed.data) {
            this.logger.log(`[STRICT EXTRACTION] ${parsed.version} format detected`);
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
            'compliance', 'current_offer', 'logo',
        ];
        const extraKeys = Object.keys(data || {}).filter(k => !allowedDataKeys.includes(k));
        if (extraKeys.length > 0) {
            this.logger.warn(`[STRICT] Additional properties found (not in schema): ${extraKeys.join(', ')}`);
        }

        // ── Map to BrandPlaybook ──
        return this.mapStrictToBrandPlaybook(data);
    }

    /**
     * Maps the strict extraction data schema → BrandPlaybook (Spec v3 compliant)
     */
    private mapStrictToBrandPlaybook(data: any): BrandPlaybook {
        const d = data || {};
        const colors = d.brand_colors || {};
        const typography = d.typography || {};
        const ta = d.target_audience || {};
        const compliance = d.compliance || {};
        const offer = d.current_offer || {};
        const logo = d.logo || {};

        const playbook: BrandPlaybook = {
            brand_name: d.brand_name || '',
            industry: d.industry || '',
            website: d.website || '',
            currency: d.currency || '',
            brand_colors: {
                primary: colors.primary || '#000000',
                secondary: colors.secondary || '#666666',
                background: colors.background || '#FFFFFF',
                accent: colors.accent,
                text_dark: colors.text_dark || '#1a1a2e',
                text_light: colors.text_light || '#FFFFFF',
            },
            typography: {
                headline: typography.headline || '',
                body: typography.body || '',
            },
            tone_of_voice: (typeof d.tone_of_voice === 'string')
                ? d.tone_of_voice
                : (d.tone_of_voice?.style || ''),
            usps: Array.isArray(d.usps) ? d.usps : [],
            product_ref: d.product_ref || null,
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

        // Current offer (structured object) — strip currency symbols from prices
        const stripCurrency = (val: string | undefined): string | undefined =>
            val ? val.replace(/[£$€¥₹]/g, '').trim() : undefined;

        if (offer.discount || offer.price_original || offer.price_sale || offer.free_gifts?.length || offer.delivery) {
            playbook.current_offer = {
                discount: offer.discount || undefined,
                price_original: stripCurrency(offer.price_original),
                price_sale: stripCurrency(offer.price_sale),
                free_gifts: Array.isArray(offer.free_gifts) ? offer.free_gifts : undefined,
                free_gifts_value: stripCurrency(offer.free_gifts_value),
                delivery: offer.delivery || undefined,
            };
        }

        // Logo style (optional)
        if (logo.style) {
            playbook.logo = { style: logo.style };
        }

        this.logger.log(`[MAPPER] Strict → BrandPlaybook (Spec v3) mapped successfully`);
        this.logger.log(`   Colors: ${playbook.brand_colors.primary} / ${playbook.brand_colors.secondary}`);
        this.logger.log(`   Typography: ${playbook.typography.headline || 'N/A'} / ${playbook.typography.body || 'N/A'}`);
        if (playbook.target_audience) this.logger.log(`   Audience: ${playbook.target_audience.gender}, ${playbook.target_audience.age_range}`);

        return playbook;
    }

    /**
     * Legacy playbook parser — converts old Claude response format to spec v3.
     * Uses normalizeBrandPlaybook() for old→new format conversion.
     */
    private legacyParsePlaybook(parsed: any): BrandPlaybook {
        // If already in new format, pass through
        if (parsed.brand_colors) {
            return parsed as BrandPlaybook;
        }

        // Old format — validate minimally then normalize
        if (!parsed.colors?.primary) {
            this.logger.error('Missing primary color in legacy playbook');
            throw new InternalServerErrorException(AdBrandMessage.AI_INVALID_JSON);
        }

        return normalizeBrandPlaybook(parsed);
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

    private async analyzeAdsPlaybookWithClaude(fileBuffer: Buffer): Promise<AdsPlaybook> {
        this.logger.log(`Analyzing ads playbook PDF with Claude`);

        const pdfBase64 = this.bufferToPdfBase64(fileBuffer);
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

    private async analyzeCopyPlaybookWithClaude(fileBuffer: Buffer): Promise<CopyPlaybook> {
        this.logger.log(`Analyzing copy playbook PDF with Claude`);

        const pdfBase64 = this.bufferToPdfBase64(fileBuffer);
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

    private bufferToPdfBase64(fileBuffer: Buffer): string {
        try {
            const header = fileBuffer.subarray(0, 4).toString('utf8');
            if (header !== '%PDF') {
                throw new BadRequestException('Invalid PDF file: a real PDF is required');
            }
            this.logger.log(`PDF loaded: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            return fileBuffer.toString('base64');
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Failed to process PDF buffer: ${error.message}`);
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
        fileInput?: { buffer: Buffer; originalname: string },
        textContent?: string,
    ): Promise<any> {
        this.logger.log(`Analyze Only (no brand creation): ${name}`);
        this.logger.log(`=== ANALYZE ONLY INPUT ===`);
        this.logger.log(`Name: ${name}`);
        this.logger.log(`Website: ${website}`);
        this.logger.log(`File: ${fileInput?.originalname || 'NONE'}`);
        this.logger.log(`TextContent: ${textContent ? textContent.substring(0, 200) + '...' : 'NONE'}`);

        let playbook: any;

        if (fileInput) {
            // Detect file type by extension
            const ext = fileInput.originalname.toLowerCase().split('.').pop();
            this.logger.log(`Analyzing file with extension: ${ext}`);

            if (ext === 'pdf') {
                // Analyze PDF buffer with Claude vision
                playbook = await this.analyzeBrandPlaybookWithClaude(fileInput.buffer);
            } else if (ext === 'txt' || ext === 'docx') {
                // Extract text from buffer and analyze with Claude
                const fileContent = this.readTextFromBuffer(fileInput.buffer, ext);
                playbook = await this.analyzeTextWithClaude(fileContent, name, website);
            } else {
                // Unsupported file type - generate default
                this.logger.warn(`Unsupported file type: ${ext}, using default playbook`);
                playbook = this.generateDefaultPlaybook(name, website);
            }
        } else if (textContent) {
            // Analyze manual text content
            playbook = await this.analyzeTextWithClaude(textContent, name, website);
        } else {
            // Generate default playbook based on name/website
            playbook = this.generateDefaultPlaybook(name, website);
        }

        // Ensure core identity fields are populated from form data
        playbook.brand_name = playbook.brand_name || name;
        playbook.website = playbook.website || website;

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

        // Ensure core identity fields are populated
        playbook.brand_name = playbook.brand_name || name;
        playbook.industry = playbook.industry || industry;
        playbook.website = playbook.website || website;
        playbook.currency = playbook.currency || currency;

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
        fileInput?: { buffer: Buffer; originalname: string },
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
        const playbook = await this.analyzeOnly(name, website, fileInput, textContent);

        // Step 3: Save playbook to brand
        savedBrand.brand_playbook = playbook;
        await this.adBrandsRepository.save(savedBrand);

        return { brand: savedBrand, playbook };
    }

    // ═══════════════════════════════════════════════════════════
    // READ TEXT FILE (TXT or DOCX)
    // ═══════════════════════════════════════════════════════════

    private readTextFromBuffer(buffer: Buffer, ext: string): string {
        try {
            if (ext === 'txt') {
                const content = buffer.toString('utf-8');
                this.logger.log(`Read TXT buffer: ${content.length} characters`);
                return content;
            } else if (ext === 'docx') {
                // Basic text extraction from DOCX buffer
                const text = buffer.toString('utf-8');
                const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                this.logger.log(`Read DOCX buffer: ${cleanText.length} characters (basic extraction)`);
                return cleanText;
            }
            return '';
        } catch (error) {
            this.logger.error(`Failed to read text buffer: ${error.message}`);
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
    ): Promise<any> {
        this.logger.log(`[STRICT TEXT ANALYSIS] Analyzing brand from text input for: ${brandName}`);

        const client = this.getAnthropicClient();

        const userPrompt = `${STRICT_EXTRACTION_USER_PROMPT}

Input Text to Analyze:

Brand Name: ${brandName}
Website: ${website}

Brand Description/Guidelines:
${textContent}`;

        this.logger.log(`=== CLAUDE STRICT TEXT ANALYSIS REQUEST ===`);
        this.logger.log(`Model: ${this.model}`);
        this.logger.log(`Input text length: ${textContent.length} chars`);

        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: STRICT_EXTRACTION_SYSTEM_PROMPT,
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
            return this.generateDefaultPlaybook(brandName, website);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // GENERATE DEFAULT PLAYBOOK (fallback)
    // Matches the comprehensive schema with all required fields
    // ═══════════════════════════════════════════════════════════

    private generateDefaultPlaybook(brandName: string, website: string): BrandPlaybook {
        return {
            brand_name: brandName,
            industry: 'General',
            website: website,
            currency: 'GBP',
            brand_colors: {
                primary: '#7c4dff',
                secondary: '#9575cd',
                background: '#FFFFFF',
                accent: '#ff6b6b',
                text_dark: '#1a1a2e',
                text_light: '#FFFFFF',
            },
            typography: {
                headline: 'Inter',
                body: 'Inter',
            },
            tone_of_voice: 'Professional',
            usps: [],
            target_audience: {
                gender: 'All',
                age_range: '25-54',
                personas: [],
            },
            compliance: {
                region: 'Global',
                rules: [],
            },
            product_ref: null,
            product_identity: {
                product_name: brandName,
                product_type: 'Product',
                visual_description: `A product by ${brandName}. Update this field with a detailed visual description for accurate image generation.`,
                key_features: [],
                colors: {},
                negative_traits: [],
            },
        };
    }
}

