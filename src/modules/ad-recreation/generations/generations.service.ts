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
import { v4 as uuidv4 } from 'uuid';
import { FilesService } from '../../../files/files.service';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdProduct } from '../../../database/entities/Ad-Recreation/ad-product.entity';
import { Product } from '../../../database/entities/Product-Visuals/product.entity';
import { AdBrandsService } from '../brands/ad-brands.service';
import { AdConceptsService } from '../ad-concepts/ad-concepts.service';
import { GeminiService } from '../../../ai/gemini.service';
import { GenerationGateway } from '../../../generations/generation.gateway';
import { MARKETING_ANGLES } from '../configurations/constants/marketing-angles';
import { AD_FORMATS } from '../configurations/constants/ad-formats';
import { AdGenerationStatus } from '../../../libs/enums/AdRecreationEnums';
import { AdGenerationMessage } from '../../../libs/messages';
import { GenerateAdDto } from './dto/generate-ad.dto';
import { BrandPlaybook } from '../../../libs/types/AdRecreation';

// ═══════════════════════════════════════════════════════════
// AD COPY RESULT TYPE
// ═══════════════════════════════════════════════════════════

interface AdCopyResult {
    headline: string;
    subheadline: string;
    cta: string;
    image_prompt: string;
    bullet_points?: string[];
}

// ═══════════════════════════════════════════════════════════
// AD GENERATION RESULT (New output format)
// ═══════════════════════════════════════════════════════════

interface AdGenerationResult {
    generation_id: string;
    content: {
        headline: string;
        subheadline: string;
        cta: string;
    };
    design: {
        layout_type: string;
        zones: any[];
        format: string;
        ratio: string;
        safe_zone?: import('../configurations/constants/ad-formats').SafeZone;
    };
    generation_prompt: string;
}

// ═══════════════════════════════════════════════════════════
// FORMAT RATIO MAP (technical, not product-specific)
// ═══════════════════════════════════════════════════════════

const FORMAT_RATIO_MAP: Record<string, string> = {
    story: '9:16',
    square: '1:1',
    portrait: '4:5',
    landscape: '16:9',
};

// ═══════════════════════════════════════════════════════════
// STATIC GUARDRAILS (product-agnostic)
// ═══════════════════════════════════════════════════════════

const TEXT_RENDERING_LOCK = `[TEXT RENDERING LOCK — MANDATORY TEXT IN IMAGE]
The generated image MUST contain RENDERED TEXT as a core design element. This is an advertisement — text is essential.

1. TEXT PLACEMENT AND NEGATIVE SPACE (CRITICAL):
   - You MUST create clean, uncluttered NEGATIVE SPACE (solid colors, soft gradients, out-of-focus background) in the text zones.
   - 🚨 NEVER place text over the product, the person's face, or busy background elements.
   - Text must be placed in empty layout zones so it is 100% legible.

2. TEXT RENDERING RULES:
   - ALL text specified in the TEXT CONTENT section MUST be rendered as readable, pixel-perfect characters directly in the image.
   - Text must be sharp, clean, and anti-aliased — NOT blurry, warped, or garbled.
   - Each text element must be spelled EXACTLY as provided — zero typos, zero extra characters.

3. TYPOGRAPHY HIERARCHY:
   - BRAND NAME: Large, bold, prominent — typically at the top of the ad. Use clean sans-serif or the brand's font style.
   - HEADLINE: Second-largest text, high visual impact. Can use italic, script, or bold styles depending on the ad mood.
   - SUBHEADLINE / BODY: Smaller, readable supporting text.
   - BULLET POINTS: Clean list with checkmarks (✓) or bullet markers.
   - CTA BUTTON: Text inside a visible button shape (rounded rectangle, pill, etc.) with contrasting colors.

4. CONTRAST & LEGIBILITY:
   - Minimum 4.5:1 contrast ratio between text and background.
   - If the background must be busy, YOU MUST render a solid or semi-transparent overlay/card BEHIND the text to ensure legibility.

FAILURE CONDITIONS:
- If ANY text overlaps the product or a person's face → FAILED
- If the image contains NO text → FAILED
- If text is misspelled or garbled → FAILED`;

const AD_GENERATION_SYSTEM_PROMPT = `You are a world-class Ad Copywriter and Creative Director specializing in creating COMPLETE advertisement images that include RENDERED TEXT as part of the design.

Your job: Generate ad copy AND write an ultra-detailed image generation prompt (image_prompt) that produces a FINISHED AD — with text, graphics, product imagery, and design elements ALL rendered in a single image.

═══════════════════════════════════════════════════════════
CRITICAL RULES — VIOLATION OF ANY RULE IS A FAILURE
═══════════════════════════════════════════════════════════

RULE 1 — STRICT PRODUCT INJECTION (ZERO HALLUCINATION):
- You will receive a [PRODUCT_INJECTION — COPY VERBATIM] block containing the EXACT physical description of the product.
- In your image_prompt, you MUST describe the product using the EXACT words from the PRODUCT_INJECTION block.
- You MUST include ALL physical traits: name, type, specific parts.
- FORBIDDEN: Do NOT use generic terms — use the EXACT product name and features.

RULE 2 — CRITICAL SCENE DIRECTION (MOOD-GATED):
- You will receive a [CRITICAL_SCENE_DIRECTION] block that dictates what the scene CAN and CANNOT show.
- If the scene direction says "Do NOT show anyone exercising", your image_prompt MUST NOT describe any exercise activity.
- You MUST include the full AVOID list in your image_prompt.

RULE 3 — TEXT RENDERING & SUBJECT AVOIDANCE (MANDATORY):
🚨 THIS IS THE MOST IMPORTANT RULE FOR IMAGE QUALITY AND LAYOUT 🚨
- The generated image MUST contain the text elements below, BUT they MUST NEVER overlap the product or the main subject's face/body.
  a) BRAND NAME — prominently displayed, typically at top or bottom
  b) HEADLINE — large, attention-grabbing text in the designated zone
  c) SUBHEADLINE or BODY TEXT — supporting copy, smaller but readable
  d) BULLET POINTS — if the angle includes benefits/features, render them with ✓ markers
  e) CTA — rendered inside a visible button shape (rounded rectangle, pill shape, etc.)
- Your image_prompt MUST explicitly instruct the image generator to create **SOLID NEGATIVE SPACE** (empty, uncluttered background areas) specifically for this text.
- Your image_prompt MUST explicitly instruct: "Render the text '[exact text]' in [font style] at [position, e.g., 'in the empty top-left negative space, far away from the person'] with [color] on [background]"
- Text must be SPELLED EXACTLY as you write it — zero garbled characters
- Use appropriate typography: bold for headlines, italic for emotional hooks, clean sans-serif for body

RULE 4 — AD COPY:
- The headline must be punchy, attention-grabbing (max 8 words)
- The subheadline must be benefit-driven (max 20 words)
- Include 2-4 bullet points highlighting key benefits with ✓ checkmarks
- The CTA must be action-oriented (2-5 words), include brand name if possible
- All text must match the brand's tone of voice

RULE 5 — VISUAL ANGLE DIFFERENTIATION (CRITICAL):
- You MUST design the SCENE/ENVIRONMENT precisely to match the "NARRATIVE ANGLE" provided.
- Do NOT blindly copy the scene from the concept image. The Concept image is ONLY for layout and style formatting.
- Every marketing angle requires a completely different physical environment and background. For example: "Before/After" should show contrasting backgrounds. "Lifestyle" must show a luxurious or aspirational setting. "Problem/Solution" might show a messy real-world desk vs a clean studio.
- Make the background setting unmistakably unique to the provided Narrative Angle.

RULE 6 — OUTPUT FORMAT:
- Return ONLY valid JSON. No markdown, no explanation.
- The image_prompt must be 300-500 words describing the COMPLETE ad design.

RULE 7 — image_prompt STRUCTURE:
Your image_prompt MUST follow this exact structure:
  a) AD FORMAT: "A complete, finished [editorial/lifestyle/product-hero] advertisement design, ready for social media."
  b) PRODUCT DESCRIPTION: Copy VERBATIM from the PRODUCT_INJECTION block.
  c) PRODUCT PLACEMENT: Exact position in frame and angle.
  d) SCENE/ENVIRONMENT: Background, setting, lighting, color grading.
  e) MODEL DIRECTION (if applicable): Pose, expression, wardrobe.
  f) TEXT RENDERING: For EACH text element, specify:
     - Exact text content (spelled out character by character)
     - Font style (bold, italic, script, sans-serif)
     - Approximate size (large, medium, small)
     - Color (white, dark, brand color)
     - Position (top, center, bottom, left-aligned, centered)
     - Background treatment (overlay panel, gradient, solid card, transparent)
  g) DESIGN ELEMENTS: Cards, shapes, buttons, dividers, icons that make it look like a real ad
  h) AVOID LIST: garbled text, misspelled words, random characters, plus scene-specific avoids`;

/**
 * Generations Service - Phase 2: Ad Recreation
 *
 * Fully JSON-driven ad generation pipeline:
 * All prompts and guardrails are built dynamically from Brand Playbook JSON,
 * Ad Analysis JSON, and user selections. No hardcoded product content.
 */
@Injectable()
export class GenerationsService {
    private readonly logger = new Logger(GenerationsService.name);

    constructor(
        @InjectRepository(AdGeneration)
        private generationsRepository: Repository<AdGeneration>,
        @InjectRepository(AdProduct)
        private adProductRepository: Repository<AdProduct>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        private readonly adBrandsService: AdBrandsService,
        private readonly adConceptsService: AdConceptsService,
        private readonly geminiService: GeminiService,
        private readonly configService: ConfigService,
        private readonly filesService: FilesService,
        private readonly generationGateway: GenerationGateway,
    ) { }

    // ═══════════════════════════════════════════════════════════
    // CANCELLATION SUPPORT
    // ═══════════════════════════════════════════════════════════
    private cancelledGenerations = new Set<string>();

    cancelGeneration(generationId: string): void {
        this.cancelledGenerations.add(generationId);
        this.logger.warn(`🛑 Generation ${generationId} marked for cancellation`);
    }

    isCancelled(generationId: string): boolean {
        return this.cancelledGenerations.has(generationId);
    }

    // ═══════════════════════════════════════════════════════════
    // GENERATE AD (Complete Pipeline: Text + Image)
    // ═══════════════════════════════════════════════════════════

    async generateAd(
        userId: string,
        dto: GenerateAdDto,
    ): Promise<{ generation: AdGeneration; ad_copy: any; result: any }> {
        // First, successfully initialize and save the generation record
        const initResult = await this._initializeGeneration(userId, dto);

        // Then, wrap the actual execution in a self-executing async function so we can return early
        // Pass the generationId to avoid a race condition querying it from the DB
        this._executeGeneration(userId, dto, initResult.generation.id).catch(err => {
            this.logger.error(`Background generation failed: ${err.message}`, err.stack);
        });

        // We return the initial generation record quickly
        return initResult;
    }

    private async _initializeGeneration(
        userId: string,
        dto: GenerateAdDto,
    ): Promise<{ generation: AdGeneration; ad_copy: any; result: any }> {
        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`STARTING BATCH AD GENERATION`);
        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`User ID: ${userId}`);
        this.logger.log(`Brand ID: ${dto.brand_id}`);
        this.logger.log(`Concept ID: ${dto.concept_id}`);

        // Step 1: Validate marketing angles and formats
        this.logger.log(`[STEP 1] Validating marketing angles and formats...`);

        // TODO: Later include custom_angles from the brand here
        const angles = dto.marketing_angle_ids.map(id => MARKETING_ANGLES.find(a => a.id === id)).filter(Boolean) as import('../configurations/constants/marketing-angles').MarketingAngle[];
        if (angles.length === 0) {
            // Let's create a temporary angle object if it's a custom one we haven't loaded yet.
            // For now, if we match none, we'll just mock them for MVP if they aren't in predefined.
            // But we will fetch brand custom angles shortly.
        }
        // If we still have 0, then we throw error for now. But wait, what if it's a custom angle before we implemented it? The mock will handle it. We will just use the IDs as fallback if not found.
        const effectiveAngles = dto.marketing_angle_ids.map(id => {
            const found = MARKETING_ANGLES.find(a => a.id === id);
            if (found) return found;
            return {
                id,
                category: 'custom',
                label: 'Custom Angle',
                description: 'Custom brand angle',
                hook: 'Custom Hook',
            } as any;
        });

        const formats = dto.format_ids.map(id => AD_FORMATS.find(f => f.id === id)).filter(Boolean) as import('../configurations/constants/ad-formats').AdFormat[];
        if (formats.length === 0) {
            throw new BadRequestException(AdGenerationMessage.INVALID_AD_FORMAT);
        }

        // Step 2: Fetch brand and concept
        this.logger.log(`[STEP 2] Fetching brand and concept from database...`);
        const brand = await this.adBrandsService.findOne(dto.brand_id, userId);
        const concept = await this.adConceptsService.findOne(dto.concept_id, userId);
        await this.adConceptsService.incrementUseCount(concept.id);

        // Incorporate custom angles if any exist
        const brandCustomAngles: any[] = (brand as any).custom_angles || [];
        const finalAngles = dto.marketing_angle_ids.map(id => {
            const predefined = MARKETING_ANGLES.find(a => a.id === id);
            if (predefined) return predefined;
            const custom = brandCustomAngles.find(a => a.id === id);
            if (custom) return { ...custom, label: custom.name }; // mapped custom angle
            return effectiveAngles.find(a => a.id === id); // fallback
        });

        // Step 3: Validate brand playbook
        const playbook = brand.brand_playbook;
        if (!playbook) throw new BadRequestException(AdGenerationMessage.BRAND_PLAYBOOK_REQUIRED);

        if (!playbook.product_identity || !playbook.product_identity.product_name) {
            playbook.product_identity = {
                product_name: brand.name,
                product_type: 'Product',
                visual_description: `A product by ${brand.name}.`,
                key_features: [],
                colors: {},
                negative_traits: [],
            };
            await this.adBrandsService.updatePlaybook(brand.id, userId, playbook);
        }

        // Fetch product images
        let productImageUrls: string[] = [];
        let productAnalyzedJson: Record<string, any> | null = null;
        let productName = '';
        let productDescription = '';
        const uploadBaseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';
        const fixUrl = (url: string) => url.includes('localhost:3000') ? url.replace('http://localhost:3000', uploadBaseUrl) : url;

        if (dto.product_id) {
            const adProduct = await this.adProductRepository.findOne({ where: { id: dto.product_id } });
            if (adProduct) {
                productName = adProduct.name;
                productDescription = adProduct.description || '';
                if (adProduct.front_image_url) productImageUrls.push(fixUrl(adProduct.front_image_url));
                if (adProduct.back_image_url) productImageUrls.push(fixUrl(adProduct.back_image_url));
                productAnalyzedJson = adProduct.analyzed_product_json || null;
            } else {
                const phase1Product = await this.productRepository.findOne({ where: { id: dto.product_id } });
                if (phase1Product) {
                    productName = phase1Product.name;
                    if (phase1Product.front_image_url) productImageUrls.push(fixUrl(phase1Product.front_image_url));
                    if (phase1Product.back_image_url) productImageUrls.push(fixUrl(phase1Product.back_image_url));
                    if (Array.isArray(phase1Product.reference_images)) {
                        phase1Product.reference_images.forEach(u => u && productImageUrls.push(fixUrl(u)));
                    }
                    productAnalyzedJson = phase1Product.analyzed_product_json || null;
                }
            }

            if (productAnalyzedJson) {
                const pj = productAnalyzedJson;
                playbook.product_identity.product_name = pj.general_info?.product_name || productName || playbook.product_identity.product_name;
                const descParts: string[] = [];
                if (pj.texture_description) descParts.push(pj.texture_description);
                if (Array.isArray(pj.materials) && pj.materials.length) descParts.push(`Materials: ${pj.materials.join(', ')}`);
                if (Array.isArray(pj.design_elements) && pj.design_elements.length) descParts.push(`Details: ${pj.design_elements.join(', ')}`);
                if (pj.general_info?.product_description) descParts.push(pj.general_info.product_description);
                if (descParts.length > 0) playbook.product_identity.visual_description = descParts.join('. ');
                if (Array.isArray(pj.style_keywords) && pj.style_keywords.length > 0) playbook.product_identity.key_features = pj.style_keywords;
            }
        }

        // Enrich playbook with manual product description
        if (productDescription && playbook.product_identity) {
            const existing = playbook.product_identity.visual_description || '';
            playbook.product_identity.visual_description = `${existing}\n\nManual Product Details: ${productDescription}`;
        }

        // Step 4: Create generation record
        const generation = this.generationsRepository.create({
            user_id: userId,
            brand_id: dto.brand_id,
            concept_id: dto.concept_id,
            selected_angles: dto.marketing_angle_ids,
            selected_formats: dto.format_ids,
            status: AdGenerationStatus.PROCESSING,
            progress: 5,
            ...(dto.mapped_assets ? { mapped_assets: dto.mapped_assets } : {}),
        });
        const saved = await this.generationsRepository.save(generation);
        const generationId = saved.id;

        // Collect all reference images
        const allReferenceImages: string[] = [];
        let productImageCount = 0;
        const heroUrl = dto.mapped_assets?.selected_image_url;
        if (heroUrl) {
            allReferenceImages.push(fixUrl(heroUrl));
            productImageCount++;
        }
        for (const pUrl of productImageUrls) {
            if (pUrl !== heroUrl) {
                allReferenceImages.push(pUrl);
                productImageCount++;
            }
        }

        let brandLogoIndex = -1;
        if (brand.assets?.logo_light) {
            brandLogoIndex = allReferenceImages.length;
            allReferenceImages.push(fixUrl(brand.assets.logo_light));
        } else if (brand.assets?.logo_dark) {
            brandLogoIndex = allReferenceImages.length;
            allReferenceImages.push(fixUrl(brand.assets.logo_dark));
        }

        let conceptImageIndex = -1;
        if (concept.original_image_url) {
            conceptImageIndex = allReferenceImages.length;
            allReferenceImages.push(fixUrl(concept.original_image_url));
        }

        // Store initial empty arrays so progress tracking works
        await this.generationsRepository.update(generationId, {
            generated_copy: [],
            merged_jsons: [],
            result_images: [],
        });

        const initializedGeneration = await this.generationsRepository.findOne({ where: { id: generationId } });

        return {
            generation: initializedGeneration!,
            ad_copy: [],
            result: {
                generation_id: generationId,
                status: 'processing',
                message: 'Generation started in background'
            }
        };
    }

    private async _executeGeneration(
        userId: string,
        dto: GenerateAdDto,
        generationId: string
    ): Promise<void> {
        this.logger.log(`[BACKGROUND] Starting heavy generation process for ${dto.brand_id}...`);

        // Need to duplicate some of the fetching logic here since we need the actual objects for the loop
        // Alternatively, we could pass them from initialized, but refetching is safer for background jobs

        // TODO: Later include custom_angles from the brand here
        const angles = dto.marketing_angle_ids.map(id => MARKETING_ANGLES.find(a => a.id === id)).filter(Boolean) as import('../configurations/constants/marketing-angles').MarketingAngle[];

        const effectiveAngles = dto.marketing_angle_ids.map(id => {
            const found = MARKETING_ANGLES.find(a => a.id === id);
            if (found) return found;
            return {
                id,
                category: 'custom',
                label: 'Custom Angle',
                description: 'Custom brand angle',
                hook: 'Custom Hook',
            } as any;
        });

        const formats = dto.format_ids.map(id => AD_FORMATS.find(f => f.id === id)).filter(Boolean) as import('../configurations/constants/ad-formats').AdFormat[];

        const brand = await this.adBrandsService.findOne(dto.brand_id, userId);
        const concept = await this.adConceptsService.findOne(dto.concept_id, userId);
        const playbook = brand.brand_playbook;

        // Incorporate custom angles if any exist
        const brandCustomAngles: any[] = (brand as any).custom_angles || [];
        const finalAngles = dto.marketing_angle_ids.map(id => {
            const predefined = MARKETING_ANGLES.find(a => a.id === id);
            if (predefined) return predefined;
            const custom = brandCustomAngles.find(a => a.id === id);
            if (custom) return { ...custom, label: custom.name }; // mapped custom angle
            return effectiveAngles.find(a => a.id === id); // fallback
        });

        // Verify the generation exists (retry up to 3 times to allow DB transaction to commit)
        let activeGeneration;
        for (let attempt = 1; attempt <= 3; attempt++) {
            activeGeneration = await this.generationsRepository.findOne({ where: { id: generationId } });
            if (activeGeneration) break;
            this.logger.warn(`Generation ${generationId} not found, retrying in 1s (Attempt ${attempt}/3)...`);
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!activeGeneration) {
            this.logger.error(`Could not find generation ${generationId} for background processing after retries.`);
            return;
        }

        // Reconstruct image URLs
        let productImageUrls: string[] = [];
        let productAnalyzedJson: Record<string, any> | null = null;
        let productName = '';
        const uploadBaseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';
        const fixUrl = (url: string) => url.includes('localhost:3000') ? url.replace('http://localhost:3000', uploadBaseUrl) : url;

        if (dto.product_id) {
            const adProduct = await this.adProductRepository.findOne({ where: { id: dto.product_id } });
            if (adProduct) {
                if (adProduct.front_image_url) productImageUrls.push(fixUrl(adProduct.front_image_url));
                if (adProduct.back_image_url) productImageUrls.push(fixUrl(adProduct.back_image_url));
                productAnalyzedJson = adProduct.analyzed_product_json || null;
            } else {
                const phase1Product = await this.productRepository.findOne({ where: { id: dto.product_id } });
                if (phase1Product) {
                    if (phase1Product.front_image_url) productImageUrls.push(fixUrl(phase1Product.front_image_url));
                    if (phase1Product.back_image_url) productImageUrls.push(fixUrl(phase1Product.back_image_url));
                    if (Array.isArray(phase1Product.reference_images)) {
                        phase1Product.reference_images.forEach(u => u && productImageUrls.push(fixUrl(u)));
                    }
                    productAnalyzedJson = phase1Product.analyzed_product_json || null;
                }
            }
        }

        const allReferenceImages: string[] = [];
        let productImageCount = 0;
        const heroUrl = dto.mapped_assets?.selected_image_url;
        if (heroUrl) {
            allReferenceImages.push(fixUrl(heroUrl));
            productImageCount++;
        }
        for (const pUrl of productImageUrls) {
            if (pUrl !== heroUrl) {
                allReferenceImages.push(pUrl);
                productImageCount++;
            }
        }

        let brandLogoIndex = -1;
        if (brand.assets?.logo_light) {
            brandLogoIndex = allReferenceImages.length;
            allReferenceImages.push(fixUrl(brand.assets.logo_light));
        } else if (brand.assets?.logo_dark) {
            brandLogoIndex = allReferenceImages.length;
            allReferenceImages.push(fixUrl(brand.assets.logo_dark));
        }

        let conceptImageIndex = -1;
        if (concept.original_image_url) {
            conceptImageIndex = allReferenceImages.length;
            allReferenceImages.push(fixUrl(concept.original_image_url));
        }

        const variationsCount = dto.variations_count || 4;
        const totalCombos = finalAngles.length * formats.length;
        const totalVariations = totalCombos * variationsCount;

        const allGeneratedCopies: any[] = [];
        const allResultImages: any[] = [];
        const allMergedJsons: any[] = [];

        let completedVariations = 0;

        // Iterate over Angles
        for (let aIdx = 0; aIdx < finalAngles.length; aIdx++) {
            const angle = finalAngles[aIdx];
            this.logger.log(`
=== PROCESSING ANGLE: ${angle.id} ===`);

            const userPrompt = this.buildUserPrompt(brand.name, playbook, concept.analysis_json, angle as any, formats[0], productAnalyzedJson);

            let adCopy: AdCopyResult;
            try {
                adCopy = await this.callGeminiForAdCopy(userPrompt);
                allGeneratedCopies.push({ angle_id: angle.id, ...adCopy });
            } catch (error) {
                this.logger.error(`Failed to generate ad copy for angle ${angle.id}: ${error}`);
                continue; // completely skip this angle if copy fails
            }

            // Iterate over Formats
            for (let fIdx = 0; fIdx < formats.length; fIdx++) {
                const format = formats[fIdx];
                this.logger.log(`--- Processing Format: ${format.id} ---`);

                const aspectRatio = FORMAT_RATIO_MAP[format.id] || '1:1';
                const guardedImagePrompt = this.buildGuardedImagePrompt(adCopy.image_prompt, angle.id, angle as any, playbook, concept.analysis_json, format, productAnalyzedJson, { productImageCount, brandLogoIndex, conceptImageIndex });

                allMergedJsons.push({
                    angle_id: angle.id,
                    format_id: format.id,
                    guarded_image_prompt: guardedImagePrompt,
                    ad_copy: adCopy
                });

                const variationSeeds = [
                    '',
                    '\n[VARIATION DIRECTION: Use a slightly different composition angle and camera perspective. Shift key elements position by 10-15%.]',
                    '\n[VARIATION DIRECTION: Adjust the color temperature slightly warmer. Use a different arrangement of supporting design elements.]',
                    '\n[VARIATION DIRECTION: Try an alternative text layout. Shift the visual weight slightly. Minor lighting variation.]',
                    '\n[VARIATION DIRECTION: Different crop and framing. Alternative background treatment while maintaining the same mood.]',
                    '\n[VARIATION DIRECTION: Alternate typography emphasis. Slightly different product angle or scale.]',
                    '\n[VARIATION DIRECTION: Different depth of field. Alternative decorative elements positioning.]',
                    '\n[VARIATION DIRECTION: Subtle palette shift. Different negative space distribution.]',
                ];

                const BATCH_SIZE = 2;
                const batches: number[][] = [];
                for (let i = 0; i < variationsCount; i += BATCH_SIZE) {
                    batches.push(Array.from({ length: Math.min(BATCH_SIZE, variationsCount - i) }, (_, j) => i + j));
                }

                for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
                    const batch = batches[batchIdx];

                    // ── Cancellation Check ──
                    if (this.isCancelled(generationId)) {
                        this.logger.warn(`🛑 Generation ${generationId} cancelled by user — stopping pipeline`);
                        this.cancelledGenerations.delete(generationId);
                        await this.generationsRepository.update(generationId, {
                            result_images: allResultImages,
                            status: AdGenerationStatus.FAILED,
                            progress: 100,
                            failure_reason: 'Cancelled by user',
                            completed_at: new Date(),
                        });
                        this.generationGateway.emitComplete(generationId, {
                            status: 'failed',
                            completed: allResultImages.length,
                            total: totalVariations,
                            visuals: allResultImages,
                        });
                        return;
                    }

                    if (batchIdx > 0 || fIdx > 0 || aIdx > 0) {
                        await new Promise(resolve => setTimeout(resolve, 3000)); // Rate limit protection
                    }

                    const batchPromises = batch.map(async (i) => {
                        const variationNum = i + 1;
                        const variationPrompt = guardedImagePrompt + (variationSeeds[i] || variationSeeds[i % variationSeeds.length]);

                        const MAX_RETRIES = 3;
                        let imageResult: any = null;
                        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                            try {
                                if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 3000));
                                if (allReferenceImages.length > 0) {
                                    imageResult = await this.geminiService.generateImageWithReference(variationPrompt, allReferenceImages, aspectRatio);
                                } else {
                                    imageResult = await this.geminiService.generateImage(variationPrompt, undefined, aspectRatio);
                                }
                                break;
                            } catch (e: any) {
                                if (e.message?.includes('violates') || e.message?.includes('policy')) break;
                            }
                        }
                        if (!imageResult) throw new Error(`Failed to generate image for variation ${variationNum}`);

                        const storedFile = await this.filesService.storeBase64Image(imageResult.data, imageResult.mimeType || 'image/png');
                        return { variationNum, url: storedFile.url };
                    });

                    const batchResults = await Promise.allSettled(batchPromises);

                    for (const result of batchResults) {
                        completedVariations++;
                        if (result.status === 'fulfilled') {
                            const imageEntry = {
                                id: uuidv4(),
                                url: result.value.url,
                                format: aspectRatio,
                                angle: angle.id,
                                format_id: format.id,
                                variation_index: result.value.variationNum,
                                generated_at: new Date().toISOString(),
                            };
                            allResultImages.push(imageEntry);

                            const absoluteIndex = (aIdx * formats.length * variationsCount) + (fIdx * variationsCount) + (result.value.variationNum - 1);

                            this.generationGateway.emitVisualCompleted(generationId, {
                                type: `variation_${result.value.variationNum}`,
                                index: absoluteIndex,
                                image_url: result.value.url,
                                generated_at: imageEntry.generated_at,
                                status: 'completed',
                            });
                        } else {
                            this.logger.error(`Variation failed: ${result.reason}`);
                        }
                    }

                    // Calculate overall progress across ALL angles and formats
                    const currentProgress = Math.round(5 + (completedVariations / totalVariations) * 90);
                    await this.generationsRepository.update(generationId, {
                        result_images: allResultImages,
                        progress: currentProgress,
                        generated_copy: allGeneratedCopies,
                        merged_jsons: allMergedJsons
                    });

                    this.generationGateway.emitProgress(generationId, {
                        progress_percent: currentProgress,
                        completed: allResultImages.length,
                        total: totalVariations,
                        elapsed_seconds: 0,
                    });
                }
            }
        }

        const finalStatus = allResultImages.length > 0 ? AdGenerationStatus.COMPLETED : AdGenerationStatus.FAILED;

        await this.generationsRepository.update(generationId, {
            generated_copy: allGeneratedCopies,
            merged_jsons: allMergedJsons,
            result_images: allResultImages,
            status: finalStatus,
            progress: 100,
            completed_at: new Date(),
            ...(allResultImages.length === 0 ? { failure_reason: 'All image variations failed to generate' } : {}),
        });

        this.generationGateway.emitComplete(generationId, {
            status: finalStatus === AdGenerationStatus.COMPLETED ? 'completed' : 'failed',
            completed: allResultImages.length,
            total: totalVariations,
            visuals: allResultImages,
        });

        const updatedGeneration = await this.generationsRepository.findOne({ where: { id: generationId } });
        if (!updatedGeneration) throw new InternalServerErrorException('Failed to fetch updated generation');

        return;
    }

    // ═══════════════════════════════════════════════════════════
    // RENDER AD IMAGE (Legacy - for re-rendering)
    // ═══════════════════════════════════════════════════════════

    async renderAdImage(id: string, userId: string): Promise<AdGeneration> {
        this.logger.log(`Re-rendering image for generation ${id}`);

        const generation = await this.findOne(id, userId);

        if (!generation.generated_copy?.image_prompt) {
            throw new BadRequestException(AdGenerationMessage.RENDER_NO_COPY);
        }

        const formatId = generation.selected_formats?.[0] || 'square';
        const aspectRatio = FORMAT_RATIO_MAP[formatId] || '1:1';

        generation.status = AdGenerationStatus.PROCESSING;
        generation.progress = 20;
        await this.generationsRepository.save(generation);

        try {
            this.logger.log(`Calling Gemini API for image (ratio: ${aspectRatio})...`);
            generation.progress = 40;
            await this.generationsRepository.save(generation);

            const imageResult = await this.geminiService.generateImage(
                generation.generated_copy.image_prompt,
                undefined,
                aspectRatio,
            );

            // Save image (S3 if configured, otherwise local disk)
            const storedFile = await this.filesService.storeBase64Image(
                imageResult.data,
                'image/png',
            );
            const imageUrl = storedFile.url;

            this.logger.log(`Image saved: ${imageUrl}`);

            generation.result_images = [
                ...(generation.result_images || []),
                {
                    id: uuidv4(),
                    url: imageUrl,
                    format: aspectRatio,
                    angle: generation.selected_angles?.[0],
                    variation_index: (generation.result_images?.length || 0) + 1,
                    generated_at: new Date().toISOString(),
                },
            ];
            generation.status = AdGenerationStatus.COMPLETED;
            generation.progress = 100;
            generation.completed_at = new Date();
            await this.generationsRepository.save(generation);

            this.logger.log(`Image render completed: ${generation.id}`);
            return generation;
        } catch (error) {
            generation.status = AdGenerationStatus.FAILED;
            generation.failure_reason = error instanceof Error ? error.message : String(error);
            await this.generationsRepository.save(generation);

            this.logger.error(`Image render failed: ${error instanceof Error ? error.message : String(error)}`);
            throw new InternalServerErrorException(AdGenerationMessage.RENDER_FAILED);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // REGENERATE SINGLE VARIATION
    // ═══════════════════════════════════════════════════════════

    async regenerateVariation(
        generationId: string,
        variationIndex: number,
        userId: string,
    ): Promise<AdGeneration> {
        this.logger.log(`Regenerating variation ${variationIndex} for generation ${generationId}`);

        const generation = await this.findOne(generationId, userId);

        if (!generation.generated_copy?.image_prompt) {
            throw new BadRequestException(AdGenerationMessage.RENDER_NO_COPY);
        }

        // Fetch brand, concept, angle, format to rebuild the guarded prompt
        const brand = await this.adBrandsService.findOne(generation.brand_id, userId);
        const concept = await this.adConceptsService.findOne(generation.concept_id, userId);
        const angleId = generation.selected_angles?.[0];
        const formatId = generation.selected_formats?.[0] || 'square';

        const angle = MARKETING_ANGLES.find((a) => a.id === angleId);
        const format = AD_FORMATS.find((f) => f.id === formatId);
        const aspectRatio = FORMAT_RATIO_MAP[formatId] || '1:1';

        if (!angle || !format || !brand.brand_playbook) {
            throw new BadRequestException('Cannot regenerate: missing angle, format, or playbook data');
        }

        // Rebuild guarded image prompt (same pipeline as original generation)
        const guardedImagePrompt = this.buildGuardedImagePrompt(
            generation.generated_copy.image_prompt,
            angleId,
            angle,
            brand.brand_playbook,
            concept.analysis_json,
            format,
        );

        // Add regeneration variation directive
        const regenPrompt = guardedImagePrompt +
            `\n[REGENERATION: This is a fresh take on variation ${variationIndex}. Create a distinctly different composition while maintaining the same ad concept, product, and copy.]`;

        // Build reference images (include hero image if mapped)
        const allReferenceImages: string[] = [];
        const uploadBaseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';

        // Priority 1: Mapped hero image from original generation
        if (generation.mapped_assets?.selected_image_url) {
            let heroUrl = generation.mapped_assets.selected_image_url;
            if (heroUrl.includes('localhost:3000')) {
                heroUrl = heroUrl.replace('http://localhost:3000', uploadBaseUrl);
            }
            allReferenceImages.push(heroUrl);
            this.logger.log(`[REGEN HERO IMAGE] ${heroUrl}`);
        }

        // Priority 2: Inspiration image
        if (concept.original_image_url) {
            let refImageUrl = concept.original_image_url;
            if (refImageUrl.includes('localhost:3000')) {
                refImageUrl = refImageUrl.replace('http://localhost:3000', uploadBaseUrl);
            }
            allReferenceImages.push(refImageUrl);
        }

        try {
            let imageResult: any;
            if (allReferenceImages.length > 0) {
                imageResult = await this.geminiService.generateImageWithReference(
                    regenPrompt,
                    allReferenceImages,
                    aspectRatio,
                );
            } else {
                imageResult = await this.geminiService.generateImage(
                    regenPrompt,
                    undefined,
                    aspectRatio,
                );
            }

            const generatedImageBase64 = imageResult.data;
            const imageMimeType = imageResult.mimeType || 'image/png';

            // Save image (S3 if configured, otherwise local disk)
            const storedFile = await this.filesService.storeBase64Image(
                generatedImageBase64,
                imageMimeType,
            );
            const generatedImageUrl = storedFile.url;

            this.logger.log(`Regenerated variation ${variationIndex}: ${generatedImageUrl}`);

            // Replace the specific variation in result_images
            const updatedImages = [...(generation.result_images || [])];
            const existingIdx = updatedImages.findIndex(img => img.variation_index === variationIndex);

            const newImage = {
                id: uuidv4(),
                url: generatedImageUrl,
                format: aspectRatio,
                angle: angleId,
                variation_index: variationIndex,
                generated_at: new Date().toISOString(),
            };

            if (existingIdx >= 0) {
                updatedImages[existingIdx] = newImage;
            } else {
                updatedImages.push(newImage);
            }

            await this.generationsRepository.update(generationId, {
                result_images: updatedImages,
            });

            const updated = await this.generationsRepository.findOne({ where: { id: generationId } });
            if (!updated) throw new InternalServerErrorException('Failed to fetch updated generation');

            return updated;

        } catch (error) {
            this.logger.error(`Regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
            throw new InternalServerErrorException(AdGenerationMessage.REGENERATION_FAILED);
        }
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
    // DYNAMIC GUARDRAIL BUILDERS (JSON-driven)
    // ═══════════════════════════════════════════════════════════

    private buildProductLock(playbook: BrandPlaybook, productJson?: any): string {
        const pi = playbook.product_identity!;

        let productName = pi.product_name;
        let productType = pi.product_type;
        let visualDescription = pi.visual_description;
        let features = [...(pi.key_features || [])];
        let colors = pi.colors;
        let materials: string[] = [];

        // V6: Extract enriched data from analyzed product JSON
        let colorBlock = '';
        let materialBlock = '';
        let designFrontBlock = '';
        let designBackBlock = '';
        let garmentBlock = '';
        let marketingBlock = '';

        if (productJson) {
            // General info
            productName = productJson.general_info?.product_name || productName;
            productType = productJson.general_info?.category || productJson.general_info?.product_type || productType;

            // V6: Visual specs — ultra-precise colors
            const vs = productJson.visual_specs;
            if (vs) {
                const primaryColor = vs.primary_color_name || vs.color_name || '';
                const primaryHex = vs.primary_hex_code || vs.hex_code || '';
                colorBlock = `PRIMARY COLOR: ${primaryColor} (${primaryHex}) — This is the EXACT dominant color. Do NOT deviate.`;

                if (vs.secondary_colors?.length) {
                    colorBlock += '\nSECONDARY COLORS:';
                    vs.secondary_colors.forEach((c: any) => {
                        colorBlock += `\n  - ${c.name} (${c.hex}) at: ${c.location}`;
                    });
                }

                if (vs.material_composition) {
                    materialBlock = `MATERIAL COMPOSITION: ${vs.material_composition}`;
                }
                if (vs.fabric_texture) {
                    materialBlock += `\nTEXTURE: ${vs.fabric_texture}`;
                }
                if (vs.finish) {
                    materialBlock += `\nFINISH: ${vs.finish}`;
                }
                if (vs.surface_pattern && vs.surface_pattern !== 'Solid') {
                    materialBlock += `\nSURFACE PATTERN: ${vs.surface_pattern}`;
                }
            }

            // V6: Design front — logo/branding details
            const df = productJson.design_front;
            if (df) {
                designFrontBlock = `FRONT DESIGN:\n`;
                if (df.has_logo) {
                    designFrontBlock += `  LOGO: "${df.logo_text}" — ${df.logo_type || 'standard'} (${df.logo_application || df.logo_type || 'applied'})\n`;
                    designFrontBlock += `  LOGO COLOR: ${df.logo_color}\n`;
                    designFrontBlock += `  PLACEMENT: ${df.placement}\n`;
                    designFrontBlock += `  SIZE: ${df.size || 'standard'}\n`;
                }
                designFrontBlock += `  DESCRIPTION: ${df.description}\n`;
                if (df.micro_details) designFrontBlock += `  MICRO DETAILS: ${df.micro_details}\n`;
            }

            // V6: Design back
            const db = productJson.design_back;
            if (db) {
                designBackBlock = `BACK DESIGN:\n  ${db.description}\n`;
                if (db.has_patch) designBackBlock += `  PATCH: ${db.patch_detail} (${db.patch_shape}, ${db.technique})\n`;
                if (db.yoke_material) designBackBlock += `  YOKE: ${db.yoke_material}\n`;
            }

            // V6: Garment details
            const gd = productJson.garment_details;
            if (gd) {
                garmentBlock = `CONSTRUCTION:\n`;
                if (gd.neckline) garmentBlock += `  NECKLINE: ${gd.neckline}\n`;
                if (gd.closure_details) garmentBlock += `  CLOSURE: ${gd.closure_details}\n`;
                if (gd.buttons) garmentBlock += `  BUTTONS: ${gd.buttons.front_closure_count}x ${gd.buttons.material} ${gd.buttons.color} (${gd.buttons.style})\n`;
                if (gd.pockets) garmentBlock += `  POCKETS: ${gd.pockets}\n`;
                if (gd.bottom_termination) garmentBlock += `  HEM: ${gd.bottom_termination}\n`;
                if (gd.seam_architecture) garmentBlock += `  SEAMS: ${gd.seam_architecture}\n`;
                if (gd.hardware_finish) garmentBlock += `  HARDWARE: ${gd.hardware_finish}\n`;
            }

            // V6: Product details (universal)
            const pd = productJson.product_details;
            if (pd?.key_features?.length) {
                features = [...features, ...pd.key_features];
            }

            // V6: Footwear details
            const fw = productJson.footwear_details;
            if (fw) {
                garmentBlock += `FOOTWEAR SPECIFICS:\n`;
                if (fw.upper_material) garmentBlock += `  UPPER: ${fw.upper_material}\n`;
                if (fw.midsole) garmentBlock += `  MIDSOLE: ${fw.midsole}\n`;
                if (fw.outsole) garmentBlock += `  OUTSOLE: ${fw.outsole}\n`;
                if (fw.lacing_system) garmentBlock += `  LACING: ${fw.lacing_system}\n`;
                if (fw.ankle_support) garmentBlock += `  CUT: ${fw.ankle_support}\n`;
            }

            // V6: Ad marketing data for mood guidance
            const amd = productJson.ad_marketing_data;
            if (amd) {
                marketingBlock = `PRODUCT MOOD: ${amd.mood_and_aesthetic || 'Premium'}\n`;
                if (amd.price_positioning) marketingBlock += `POSITIONING: ${amd.price_positioning}\n`;
            }

            // Merge visual description
            visualDescription = `${productName} — ${vs?.fabric_texture || visualDescription}`;
        }

        const featureLines = features
            .map(f => `- ${f}`)
            .join('\n');

        const colorLines = Object.entries(colors)
            .map(([part, hex]) => `- ${part}: ${hex}`)
            .join('\n');

        const negativeLines = (pi.negative_traits || [])
            .map(t => `- ${t}`)
            .join('\n');

        return `[PRODUCT LOCK — ABSOLUTE FIDELITY MANDATE]
🚨 The product is: ${productName} (${productType}).

${colorBlock || `Colors:\n${colorLines || '(use brand colors)'}`}

${materialBlock || `Material: ${visualDescription}`}

${designFrontBlock}
${designBackBlock}
${garmentBlock}

Physical traits that MUST appear EXACTLY as described:
${featureLines || '(see visual description above)'}

${marketingBlock}

${negativeLines ? `🚫 MUST NOT include:\n${negativeLines}` : ''}

🚨 STRICT RULE: Every detail above MUST be reproduced with FORENSIC ACCURACY.
Do NOT simplify, generalize, or substitute ANY feature.
If the product has 6 buttons, draw EXACTLY 6 buttons.
If the color is #722F37, render EXACTLY that hex — not "red" or "burgundy".`;
    }

    /**
     * Builds the PERSONA LOCK guardrail dynamically from target_audience.
     * Controls human model appearance in generated images.
     */
    private buildPersonaLock(playbook: BrandPlaybook): string {
        const ta = playbook.target_audience;

        if (!ta) {
            return `[PERSONA LOCK — HUMAN MODEL RULES]
If a human model appears in the image:
- Anatomy: ALL body proportions must be anatomically correct
- Correct number of fingers (5 per hand), correct limb proportions, natural joint angles
- Expression: Natural, confident
- NO extra limbs, NO distorted faces, NO unnatural body bending`;
        }

        return `[PERSONA LOCK — HUMAN MODEL RULES]
If a human model appears in the image:
- Gender: ${ta.gender || 'Any'}
- Age appearance: ${ta.age_range || '25-45'} years old
- Body type: ${ta.body_type || 'Healthy, natural-looking'}
- Clothing: ${ta.clothing_style || 'Appropriate for the brand context'}
- Expression: Confident, calm, focused — NOT overly posed or unnatural
- Anatomy: ALL body proportions must be anatomically correct. Correct number of fingers (5 per hand), correct limb proportions, natural joint angles
- NO extra limbs, NO distorted faces, NO unnatural body bending`;
    }

    /**
     * Builds a scene directive for the given marketing angle,
     * dynamically interpolating the product name from the playbook.
     */
    private buildSceneDirective(
        angleId: string,
        angleLabel: string,
        angleDescription: string,
        playbook: BrandPlaybook,
        angle?: import('../configurations/constants/marketing-angles').MarketingAngle,
        productJson?: any,
    ): string {
        const productName = productJson?.general_info?.product_name || playbook.product_identity?.product_name || 'the product';
        const brandPrimary = playbook.colors?.primary || '#000000';

        // If we have the full MarketingAngle with narrative data, use it
        if (angle?.narrative_arc) {
            const arc = angle.narrative_arc;
            const ctaOptions = angle.cta_options?.join(' | ') || 'Learn More';
            const compliance = angle.compliance_notes || 'None';
            const persona = angle.target_persona || 'general audience';

            return `[NARRATIVE ANGLE — ${angle.label.toUpperCase()}]
CATEGORY: ${angle.category?.toUpperCase() || 'GENERAL'}
TARGET PERSONA: ${persona}
FUNNEL STAGE: ${angle.funnel_stage?.join(', ') || 'TOFU'}

HOOK (Opening Line): "${angle.hook}"

NARRATIVE ARC — Use this story structure to guide the ad:
- PROBLEM: ${arc.problem}
- DISCOVERY: ${arc.discovery}
- RESULT: ${arc.result}
- PAYOFF: ${arc.payoff}

The ad should follow this narrative flow: start with the PROBLEM the viewer relates to, then show the DISCOVERY of ${productName}, demonstrate the RESULT, and end with the emotional PAYOFF.

CTA OPTIONS (pick the best fit): ${ctaOptions}
COMPLIANCE: ${compliance}

VISUAL DIRECTION:
- Show ${productName} as the hero solution within the narrative context
- The visual mood should match the emotional arc: start with the problem's tension, resolve with the product's warmth
- Use brand primary color (${brandPrimary}) for emphasis and CTA elements
${angle.visual_cues ? `\n🚨 CRITICAL VISUAL INSTRUCTION FOR THIS ANGLE:\n${angle.visual_cues}\n` : ''}- The overall feel should speak directly to: ${persona}`;
        }

        // Fallback: build from basic angle info
        return `[NARRATIVE ANGLE — ${angleId.toUpperCase()}]
Angle: "${angleLabel}" — ${angleDescription}
Show ${productName} prominently. Use brand colors (primary: ${brandPrimary}). Professional commercial photography.
CTA should drive action relevant to this angle.`;
    }

    /**
     * Builds the negative prompt dynamically from playbook data.
     * Combines standard anti-hallucination rules with product-specific constraints
     * and explicit NEGATIVE REINFORCEMENT from compliance forbidden items.
     */
    private buildNegativePrompt(playbook: BrandPlaybook, conceptAnalysis?: any): string {
        const negativeTraits = playbook.product_identity?.negative_traits || [];
        const complianceRules = playbook.compliance?.rules || [];
        const productName = playbook.product_identity?.product_name || 'the product';
        const productType = playbook.product_identity?.product_type || '';

        const productNegatives = negativeTraits
            .map(t => `- ${t}`)
            .join('\n');

        // Parse compliance rules into forbidden items for negative reinforcement
        const forbiddenItems = complianceRules
            .filter(r => /^(no |never |must not |do not |avoid |forbidden)/i.test(r))
            .map(r => `- ${r}`)
            .join('\n');

        const allComplianceNegatives = complianceRules
            .map(r => `- ${r}`)
            .join('\n');

        // ━━━ CONCEPT-AWARE AVOID LIST ━━━
        const mood = conceptAnalysis?.visual_style?.mood?.toLowerCase() || '';
        const hookType = conceptAnalysis?.content_pattern?.hook_type?.toLowerCase() || '';
        const isEditorial = ['editorial', 'magazine', 'clean', 'minimal', 'presentation', 'product_showcase'].some(
            k => mood.includes(k) || hookType.includes(k),
        );

        const conceptAvoidItems: string[] = [];
        if (isEditorial) {
            conceptAvoidItems.push(
                '- Action shots of the product being used in motion',
                `- Any product or item that is NOT the exact "${productName}"`,
                '- Cluttered or distracting scene elements that draw attention away from the product',
            );
        }

        // Always block generic product substitution — works for ANY product type
        conceptAvoidItems.push(
            `- Any product that is NOT the exact "${productName}" as described in the Product Lock`,
            '- Substituting the product with any similar-looking but different product',
            `- Generic or unrelated objects that could be confused with "${productName}"`,
        );

        const conceptAvoidSection = conceptAvoidItems.length > 0
            ? `\n[CONCEPT-SPECIFIC AVOID — PRODUCT MISMATCH PROTECTION]\n${conceptAvoidItems.join('\n')}`
            : '';

        return `[NEGATIVE PROMPT — MUST AVOID]
DO NOT generate any of the following:
- Extra fingers, extra limbs, distorted hands, mutated body parts
- Misspelled text, garbled characters, illegible or warped letters, random symbols embedded in the image
- Watermarks or stock photo overlays
${productNegatives}
- Blurry, low-resolution, or pixelated output
- Overly saturated or neon colors that clash with the brand palette
- Stock photo watermarks or grid overlays
- Multiple copies of the same product in one frame (unless explicitly requested)
- Unrealistic body proportions or uncanny valley faces
- Cluttered, messy compositions with too many visual elements
- Dark, gloomy, or depressing atmospheres (unless the "problem" side of a comparison)
- Any product that does NOT match the exact product described in the Product Lock (use EXACT product description only)
${conceptAvoidSection}

${forbiddenItems ? `[NEGATIVE REINFORCEMENT — EXPLICITLY FORBIDDEN]
The following items are STRICTLY PROHIBITED by brand compliance. If any of these appear in the generated image, it is a FAILURE:
${forbiddenItems}` : ''}
${allComplianceNegatives ? `\nCOMPLIANCE RESTRICTIONS (full list):\n${allComplianceNegatives}` : ''}`;
    }

    // ═══════════════════════════════════════════════════════════
    // GEMINI TEXT GENERATION (Ad Copy)
    // ═══════════════════════════════════════════════════════════

    private async callGeminiForAdCopy(userPrompt: string): Promise<AdCopyResult> {
        this.logger.log(`Sending prompt to Gemini for ad copy generation...`);

        const fullPrompt = `${AD_GENERATION_SYSTEM_PROMPT}

${userPrompt}`;

        try {
            const client = (this.geminiService as any).getClient();

            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });

            const candidate = response.candidates?.[0];
            if (!candidate || !candidate.content?.parts) {
                throw new Error('No response from Gemini');
            }

            let textResponse = '';
            for (const part of candidate.content.parts) {
                if ((part as any).text) {
                    textResponse += (part as any).text;
                }
            }

            this.logger.log(`Gemini response received (${textResponse.length} chars)`);

            return this.parseAndValidateAdCopy(textResponse);

        } catch (error) {
            this.logger.error(`Gemini API call failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // JSON PARSING & VALIDATION
    // ═══════════════════════════════════════════════════════════

    private parseAndValidateAdCopy(responseText: string): AdCopyResult {
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
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch {
                    this.logger.error(`Failed to parse Gemini response: ${cleaned.substring(0, 200)}...`);
                    throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
                }
            } else {
                this.logger.error(`No JSON found in Gemini response: ${cleaned.substring(0, 200)}...`);
                throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
            }
        }

        if (!parsed.headline || !parsed.subheadline || !parsed.cta || !parsed.image_prompt) {
            this.logger.error('Missing required keys in AI response: headline, subheadline, cta, or image_prompt');
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        return {
            headline: String(parsed.headline),
            subheadline: String(parsed.subheadline),
            cta: String(parsed.cta),
            image_prompt: String(parsed.image_prompt),
            bullet_points: Array.isArray(parsed.bullet_points) ? parsed.bullet_points.map(String) : undefined,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GUARDED IMAGE PROMPT BUILDER (Dynamic 6-Layer Hierarchy)
    // Priority: Compliance > Brand Identity > Angle > Layout
    // ═══════════════════════════════════════════════════════════

    /**
     * Wraps the AI-generated image_prompt with dynamically-built guardrail layers.
     * All layers are constructed from the Brand Playbook JSON — no hardcoded product content.
     *
     * DYNAMIC HIERARCHY (Strict Priority):
     * 1. COMPLIANCE (Absolute) — Must/Must NOT rules override ALL other layers
     * 2. BRAND IDENTITY — Product fidelity, colors, materials
     * 3. ANGLE — Marketing narrative and scene directive
     * 4. LAYOUT PATTERN — Visual structure from inspiration concept
     */
    private buildGuardedImagePrompt(
        rawImagePrompt: string,
        angleId: string,
        angle: import('../configurations/constants/marketing-angles').MarketingAngle,
        playbook: BrandPlaybook,
        conceptAnalysis?: any,
        format?: import('../configurations/constants/ad-formats').AdFormat,
        productJson?: any,
        imageRoleMap?: { productImageCount: number; brandLogoIndex: number; conceptImageIndex: number },
    ): string {
        const productImageCount = imageRoleMap?.productImageCount || 0;
        const brandLogoIndex = imageRoleMap?.brandLogoIndex ?? -1;
        const conceptImageIndex = imageRoleMap?.conceptImageIndex ?? -1;

        // ━━━ LAYER 1: COMPLIANCE LOCK (ABSOLUTE — overrides everything) ━━━
        const complianceLock = this.buildComplianceLock(playbook);

        // ━━━ LAYER 2: BRAND IDENTITY (Product + Persona + Colors) ━━━
        // ━━━ LAYER 2: BRAND IDENTITY (Product + Persona + Colors) ━━━
        const productLock = this.buildProductLock(playbook, productJson);
        const productInjection = this.buildProductInjection(playbook, productJson);
        const personaLock = this.buildPersonaLock(playbook);

        // ━━━ LAYER 3: MARKETING ANGLE (Scene directive) ━━━
        const sceneDirective = this.buildSceneDirective(
            angleId,
            angle.label,
            angle.description,
            playbook,
            angle,
            productJson,
        );

        // ━━━ LAYER 3.5: CRITICAL SCENE DIRECTION (mood-gated) ━━━
        const criticalSceneDirection = this.buildCriticalSceneDirection(conceptAnalysis, playbook, productJson);

        // ━━━ LAYER 4: LAYOUT PATTERN (from inspiration concept) ━━━
        const layoutComposition = this.buildLayoutComposition(conceptAnalysis);

        // ━━━ NEGATIVE REINFORCEMENT (combines all forbidden items + concept-aware) ━━━
        const negativePrompt = this.buildNegativePrompt(playbook, conceptAnalysis);

        const guardedPrompt = `You are an elite photorealistic rendering engine and high-end commercial photographer.
Follow ALL rules below in STRICT PRIORITY ORDER. Higher-priority rules OVERRIDE lower-priority ones.

🚨 ULTIMATE FIDELITY LOCK (ABSOLUTE PRIORITY) 🚨
1. ZERO HALLUCINATION: The product shown MUST be a 1:1 pixel-perfect replica of the provided Product Reference images.
2. NO GENERICS: Do not invent, substitute, or generalize ANY product features, textures, zippers, or logos.
3. MATERIALS: If a texture is described as "matte heavy wool", it must render with the exact light absorption of wool, not shiny synthetic.
4. BRAND PRESERVATION: The brand logo must be rendered exactly as shown in the logo reference, with perfect typography and sharp edges.

${'═'.repeat(60)}
PRIORITY 1 — COMPLIANCE (ABSOLUTE, OVERRIDE ALL)
${'═'.repeat(60)}
${complianceLock}

${'═'.repeat(60)}
🚨 PRODUCT REPLACEMENT MANDATE + IMAGE ROLE MAP (ABSOLUTE — OVERRIDE ALL)
${'═'.repeat(60)}

[IMAGE ROLE MAP — HOW TO USE EACH REFERENCE IMAGE]
The reference images are ordered by ROLE. Read this map BEFORE looking at the images:

📸 IMAGES 1-${productImageCount || 'N'}: PRODUCT REFERENCE ANGLES (HIGHEST PRIORITY)
   These images show multiple angles (front, back, side, details) of the EXACT ONE product you MUST reproduce in the ad.
   - You MUST cross-reference all angle images to capture EVERY micro-detail: exact threading, zipper texture, pocket orientation, button count, metallic hardware finish, and weave type.
   - The product in the final ad must be VISUALLY IDENTICAL to these reference images down to the microscopic level. If the viewer cannot tell it's the exact same item, YOU HAVE FAILED.
   - These are real product photos — match them with forensic photographic accuracy.

${brandLogoIndex >= 0 ? `🏷️ IMAGE ${brandLogoIndex + 1}: BRAND LOGO
   This is the brand's official logo. You MUST:
   - Place this EXACT logo naturally and prominently on the product or in the ad layout
   - Match the logo's exact typography, colors, and proportions perfectly.
   - Position it where a real brand would place it (on the garment, on a label, or in the ad header)
   - The logo must be SHARP, LEGIBLE, and properly integrated into the design. No garbled text.
` : ''}
${conceptImageIndex >= 0 ? `🎨 IMAGE ${conceptImageIndex + 1} (LAST IMAGE): CONCEPT/LAYOUT OVERLAY REFERENCE ONLY
   ⚠️ WARNING: This image is ONLY for text layout, UI structure, and graphic design patterns.
   🚫 DO NOT COPY the product shown in this image!
   🚫 DO NOT COPY the background or setting of this image IF the Narrative Angle (below) demands a specific environment.
   ✅ ONLY use it for: where to place text, font proportions, and overlay structures.
   ✅ REPLACE the concept image's product with the EXACT product from Images 1-${productImageCount || 'N'}.
` : ''}
This rule is NON-NEGOTIABLE. The environment, setting, and mood MUST be driven by the Marketing Angle and Creative Direction below, NOT this concept image.

${'═'.repeat(60)}
PRIORITY 2 — BRAND IDENTITY (Product Fidelity + Visual Identity)
${'═'.repeat(60)}
${productLock}

${productInjection}

${personaLock}

${'═'.repeat(60)}
PRIORITY 3 — MARKETING ANGLE (Narrative Hook)
${'═'.repeat(60)}
${sceneDirective}

${'═'.repeat(60)}
🚨 CRITICAL SCENE DIRECTION (MANDATORY — OVERRIDE CREATIVE DIRECTION)
${'═'.repeat(60)}
${criticalSceneDirection}

${'═'.repeat(60)}
PRIORITY 4 — LAYOUT PATTERN (Visual Structure from Inspiration)
${'═'.repeat(60)}
${layoutComposition}

${TEXT_RENDERING_LOCK}

${'═'.repeat(60)}
TEXT CONTENT — RENDER THESE EXACT WORDS IN THE IMAGE
${'═'.repeat(60)}
The image MUST contain the following text rendered as VISIBLE, READABLE characters:
- BRAND NAME: "${playbook.product_identity?.product_name || 'Brand'}" — display prominently at top of the ad
- All other text elements (headline, subheadline, bullet points, CTA) come from the creative direction below

[CREATIVE DIRECTION FROM AI COPYWRITER]
${rawImagePrompt}

${format?.safe_zone ? `${'═'.repeat(60)}
PLATFORM SAFE ZONES & NEGATIVE SPACE (CRITICAL)
${'═'.repeat(60)}
Format: ${format.label} (${format.ratio}, ${format.width}×${format.height})

🚨 YOU MUST OBEY THESE LAYOUT RULES OR THE AD IS RUINED:
1. DO NOT OVERLAP THE SUBJECT: The person, product, or main focus of the image MUST be placed in an area where there is NO TEXT. 
2. CREATE SOLID NEGATIVE SPACE: You must design the image so that the background behind the text is simple, solid, or out-of-focus so the text is easily legible.
3. THE EXTREME EDGES ARE DANGER ZONES: 
   - Top ${format.safe_zone.danger_top}px: No important text elements here.
   - Bottom ${format.safe_zone.danger_bottom}px: No text or CTA here.
   - Side Margins: Keep text ${format.safe_zone.danger_sides}px away from the left/right edges.

4. USABLE AREA FOR TEXT:
   x: ${format.safe_zone.usable_area.x}px to ${format.safe_zone.usable_area.x + format.safe_zone.usable_area.width}px
   y: ${format.safe_zone.usable_area.y}px to ${format.safe_zone.usable_area.y + format.safe_zone.usable_area.height}px

Place the headline in the clean upper or lower negative space, depending on where the subject is. 
Place the CTA in the opposite clean space. 
Do NOT allow text to touch the person's face or the main product.
` : ''}
${'═'.repeat(60)}
NEGATIVE REINFORCEMENT (AVOID LIST)
${'═'.repeat(60)}
${negativePrompt}

🚨🚨🚨 FINAL INSTRUCTION — ZERO TOLERANCE FOR DEVIATION 🚨🚨🚨

Generate a single, high-quality advertisement image that is a COMPLETE, FINISHED AD DESIGN.

1. PRODUCT FIDELITY (NON-NEGOTIABLE):
   - The product MUST be a 1:1 EXACT replica of the Product Reference images
   - Match EVERY micro-detail: exact color hex, texture grain, button count, zipper style, pocket position
   - Do NOT simplify, generalize, or substitute ANY product feature
   - If the product has 6 buttons, draw EXACTLY 6 buttons — not 4 or 5
   - If the color is #722F37 dark burgundy wool, render THAT exact shade — not "red" or generic burgundy

2. BRAND ON PRODUCT (MANDATORY):
   - The brand name/logo MUST be rendered DIRECTLY ON the product
   - Place it at the EXACT position described in the Product Injection (chest, tongue, front panel)
   - The brand text must be SHARP, LEGIBLE, and spelled EXACTLY correct
   - Do NOT place the brand logo floating in empty space — it must be ON the product surface

3. ZERO CREATIVE FREEDOM:
   - You are a COPYING MACHINE, not an artist
   - Do NOT add features that are not in the product reference
   - Do NOT change textures, colors, or proportions
   - Do NOT invent additional design elements
   - Do NOT "improve" or "enhance" the product — reproduce it EXACTLY as specified
   - Your ONLY creative freedom is in the background, lighting, and composition

4. TEXT & LAYOUT:
   - All text (brand name, headline, subheadline, CTA) MUST be clearly READABLE
   - Text must be spelled EXACTLY as written — zero garbled characters
   - ALL content must be within the SAFE ZONE — nothing important in danger zones

5. QUALITY:
   - Professional social media advertisement ready to publish
   - Photorealistic product rendering with studio-quality lighting
   - Clean, premium aesthetic matching the brand's positioning

IF YOU DEVIATE FROM THE PRODUCT SPECIFICATION IN ANY WAY, THE OUTPUT IS REJECTED.`;

        this.logger.log(`Guarded image prompt built (${guardedPrompt.length} chars)`);
        this.logger.log(`   Hierarchy applied: Compliance → Brand Identity → Product Injection → Angle (${angleId}) → Critical Scene Direction → Layout → Readability → Negative Reinforcement`);

        return guardedPrompt;
    }

    // ═══════════════════════════════════════════════════════════
    // COMPLIANCE LOCK BUILDER (Priority 1 — Absolute)
    // ═══════════════════════════════════════════════════════════

    /**
     * Builds the COMPLIANCE LOCK from playbook.compliance.
     * Parses rules into MUST SHOW (positive) and MUST NOT (negative) directives.
     * This is the HIGHEST priority layer — it overrides ALL other layers.
     */
    private buildComplianceLock(playbook: BrandPlaybook): string {
        const rules = playbook.compliance?.rules || [];
        const region = playbook.compliance?.region || 'Global';

        if (rules.length === 0) {
            return `[COMPLIANCE LOCK — NO SPECIFIC RESTRICTIONS]
Region: ${region}
No specific compliance rules defined. Proceed with standard advertising best practices.`;
        }

        // Parse rules into positive (Must Show) and negative (Must NOT) directives
        const mustShowRules: string[] = [];
        const mustNotRules: string[] = [];

        for (const rule of rules) {
            const lowerRule = rule.toLowerCase().trim();
            if (
                lowerRule.startsWith('no ') ||
                lowerRule.startsWith('never ') ||
                lowerRule.startsWith('must not ') ||
                lowerRule.startsWith('do not ') ||
                lowerRule.startsWith('avoid ') ||
                lowerRule.startsWith('forbidden') ||
                lowerRule.startsWith('prohibit')
            ) {
                mustNotRules.push(rule);
            } else if (
                lowerRule.startsWith('must ') ||
                lowerRule.startsWith('always ') ||
                lowerRule.startsWith('require') ||
                lowerRule.startsWith('show ') ||
                lowerRule.startsWith('include ')
            ) {
                mustShowRules.push(rule);
            } else {
                // Default: treat ambiguous rules as Must Show
                mustShowRules.push(rule);
            }
        }

        const mustShowSection = mustShowRules.length > 0
            ? `\nMUST SHOW (use these to describe the environment/background):\n${mustShowRules.map(r => `  ✅ ${r}`).join('\n')}`
            : '';

        const mustNotSection = mustNotRules.length > 0
            ? `\nMUST NOT (these are ABSOLUTE prohibitions — violating any is a FAILURE):\n${mustNotRules.map(r => `  ❌ ${r}`).join('\n')}`
            : '';

        return `[COMPLIANCE LOCK — ABSOLUTE RULES (Override ALL other layers)]
Region: ${region}

🚨 CRITICAL: These rules have the HIGHEST priority. If ANY compliance rule conflicts
with Brand Identity, Marketing Angle, or Layout instructions, the COMPLIANCE RULE WINS.
${mustShowSection}
${mustNotSection}

BACKGROUND RESOLUTION:
- Do NOT use vague or generic environment descriptions
- Instead, use the Must Show rules above to describe a SPECIFIC, COMPLIANT environment
- If a Must NOT rule forbids a certain setting, you MUST explicitly describe
  a DIFFERENT, brand-appropriate setting instead`;
    }

    // ═══════════════════════════════════════════════════════════
    // LAYOUT COMPOSITION BUILDER (Priority 4 — from Concept)
    // ═══════════════════════════════════════════════════════════

    /**
     * Builds layout composition directives from the concept's zone analysis.
     * Maps layout zones to spatial directives for image generation,
     * ensuring elements don't overlap with Safe Zones (text areas).
     */
    private buildLayoutComposition(conceptAnalysis?: any): string {
        if (!conceptAnalysis?.layout) {
            return `[LAYOUT COMPOSITION — NO REFERENCE]
No inspiration layout provided. Use standard advertising composition:
- Rule of thirds for product placement
- Clean negative space for potential text overlay areas
- Balanced visual weight distribution`;
        }

        const layout = conceptAnalysis.layout;
        const zones = layout.zones || [];
        const layoutType = layout.type || 'unknown';

        // Identify safe zones (text areas where image should be clean)
        const safeZones = zones.filter((z: any) =>
            ['headline', 'body', 'cta_button', 'logo'].includes(z.content_type),
        );
        const imageZones = zones.filter((z: any) =>
            ['image', 'ui_element'].includes(z.content_type),
        );

        const safeZoneDirectives = safeZones.length > 0
            ? safeZones.map((z: any) =>
                `  - ${z.content_type.toUpperCase()} zone (y: ${z.y_start}px–${z.y_end}px): Keep this area clean/simple for text overlay. ${z.description || ''}`,
            ).join('\n')
            : '  - No specific safe zones defined';

        const imageZoneDirectives = imageZones.length > 0
            ? imageZones.map((z: any) =>
                `  - ${z.content_type.toUpperCase()} zone (y: ${z.y_start}px–${z.y_end}px): ${z.description || 'Main visual content area'}`,
            ).join('\n')
            : '  - Use full frame for visual content';

        // Visual style from concept
        const mood = conceptAnalysis?.visual_style?.mood || 'professional';
        const bg = conceptAnalysis?.visual_style?.background;
        const bgInfo = bg && typeof bg === 'object'
            ? `${bg.type || 'N/A'} (${bg.hex || 'N/A'})`
            : 'N/A';

        return `[LAYOUT COMPOSITION — MATCH INSPIRATION STRUCTURE]
Layout Type: ${layoutType}
Visual Mood: ${mood}
Background Reference: ${bgInfo}

SAFE ZONES (keep clean for text — do NOT place busy imagery here):
${safeZoneDirectives}

IMAGE ZONES (place product/model content here):
${imageZoneDirectives}

COMPOSITION RULES:
- Product/model placement MUST respect the zone boundaries above
- Safe Zones must have simple, low-detail backgrounds for text readability
- Visual weight should be concentrated in the Image Zones
- Maintain the ${layoutType} layout pattern from the inspiration`;
    }

    // ═══════════════════════════════════════════════════════════
    // CRITICAL SCENE DIRECTION BUILDER (Concept-mood-aware)
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyzes the concept's visual_style.mood and content_pattern to build
     * a CRITICAL_SCENE_DIRECTION string that gates what Gemini can show.
     *
     * Editorial/magazine/presentation concepts → block exercise/workout scenes
     * Lifestyle/action concepts → allow product-in-use scenes
     */
    private buildCriticalSceneDirection(conceptAnalysis?: any, playbook?: BrandPlaybook, productJson?: any): string {
        const mood = conceptAnalysis?.visual_style?.mood?.toLowerCase() || '';
        const hookType = conceptAnalysis?.content_pattern?.hook_type?.toLowerCase() || '';
        const layoutType = conceptAnalysis?.layout?.type?.toLowerCase() || '';
        const productName = productJson?.general_info?.product_name || playbook?.product_identity?.product_name || 'the product';

        const editorialKeywords = ['editorial', 'magazine', 'clean', 'minimal', 'minimalist', 'presentation', 'product_showcase', 'elegant', 'sophisticated', 'premium'];
        const isEditorial = editorialKeywords.some(k => mood.includes(k) || hookType.includes(k) || layoutType.includes(k));

        if (isEditorial) {
            return `[CRITICAL_SCENE_DIRECTION — EDITORIAL / PRESENTATION MODE]
🚨 THIS IS A PRODUCT PRESENTATION / EDITORIAL SHOT. NOT AN ACTION SHOT.

 MANDATORY RULES:
- The product (${productName}) must be displayed in a STATIC, COMPOSED, ELEGANT manner
- Think: high-end product photography, magazine editorial, luxury catalogue
- Models (if present) should be STANDING, SITTING, or POSING near the product — NOT actively using it
- The scene must feel CALM, COMPOSED, and EDITORIAL
- Focus on the product's visual beauty and premium presentation

AVOID (in this editorial context):
- Dynamic or energetic action scenes
- Product being actively used or demonstrated
- Any product that is NOT the exact ${productName}
- Cluttered or distracting background elements`;
        }

        // Lifestyle/action mode — allow product use but still enforce product fidelity
        return `[CRITICAL_SCENE_DIRECTION — LIFESTYLE / ACTION MODE]
The product (${productName}) may be shown in active use by a model.

RULES:
- The model may be shown using the product in a natural, lifestyle context
- The product MUST still match the exact description from the Product Lock — no substitutions
- The scene should feel aspirational and inviting
- The product must remain clearly visible and identifiable in the scene

AVOID:
- Any product that is NOT the exact ${productName}
- Overly aggressive or intense scenes
- Generic or unrelated products in the frame`;
    }

    // ═══════════════════════════════════════════════════════════
    // PRODUCT INJECTION BUILDER (Verbatim spec for Gemini)
    // ═══════════════════════════════════════════════════════════

    /**
     * Builds a PRODUCT_INJECTION block that contains the EXACT physical
     * description of the product + BRAND IDENTITY instructions.
     * V6: Uses enriched analyzed product JSON for maximum precision.
     */
    private buildProductInjection(playbook: BrandPlaybook, productJson?: any): string {
        const pi = playbook.product_identity!;
        const brandName = pi.product_name || 'Brand';

        // Build comprehensive product description from V6 JSON
        const sections: string[] = [];

        if (productJson) {
            const gi = productJson.general_info;
            const vs = productJson.visual_specs;
            const df = productJson.design_front;
            const db = productJson.design_back;
            const gd = productJson.garment_details;
            const fw = productJson.footwear_details;
            const pd = productJson.product_details;
            const pn = productJson.photography_notes;

            // Product identity
            if (gi) {
                sections.push(`PRODUCT: ${gi.product_name} (${gi.category}${gi.subcategory ? ' / ' + gi.subcategory : ''})`);
                sections.push(`FIT: ${gi.fit_type} | TARGET: ${gi.gender_target} | SEASON: ${gi.season || 'All-season'}`);
            }

            // Color & Material — FORENSIC precision
            if (vs) {
                const primary = vs.primary_color_name || vs.color_name;
                const hex = vs.primary_hex_code || vs.hex_code;
                sections.push(`COLOR: ${primary} (EXACT HEX: ${hex}) — Render this EXACT shade, NOT a similar color`);
                sections.push(`TEXTURE: ${vs.fabric_texture}`);
                if (vs.material_composition) sections.push(`MATERIAL: ${vs.material_composition}`);
                if (vs.finish) sections.push(`FINISH: ${vs.finish}`);
                if (vs.secondary_colors?.length) {
                    sections.push(`ACCENT COLORS: ${vs.secondary_colors.map((c: any) => `${c.name}(${c.hex}) at ${c.location}`).join(', ')}`);
                }
            }

            // Front design — logo, branding
            if (df) {
                sections.push(`FRONT: ${df.description}`);
                if (df.has_logo) {
                    sections.push(`BRAND LOGO ON PRODUCT: "${df.logo_text}" — ${df.logo_type}, ${df.logo_application || 'applied'}, color: ${df.logo_color}, at: ${df.placement}, size: ${df.size || 'standard'}`);
                }
            }

            // Back design
            if (db?.description) {
                sections.push(`BACK: ${db.description}`);
            }

            // Garment construction
            if (gd) {
                if (gd.neckline && gd.neckline !== 'N/A') sections.push(`NECKLINE: ${gd.neckline}`);
                if (gd.closure_details) sections.push(`CLOSURE: ${gd.closure_details}`);
                if (gd.pockets && gd.pockets !== 'Standard pockets') sections.push(`POCKETS: ${gd.pockets}`);
                if (gd.buttons) sections.push(`BUTTONS: ${gd.buttons.front_closure_count}x ${gd.buttons.color} ${gd.buttons.material} (${gd.buttons.style})`);
            }

            // Footwear specifics
            if (fw) {
                if (fw.upper_material) sections.push(`UPPER: ${fw.upper_material}`);
                if (fw.midsole) sections.push(`MIDSOLE: ${fw.midsole}`);
                if (fw.outsole) sections.push(`OUTSOLE: ${fw.outsole}`);
            }

            // Product details
            if (pd?.key_features?.length) {
                sections.push(`KEY FEATURES:\n${pd.key_features.map((f: string) => `  • ${f}`).join('\n')}`);
            }

            // Photography guidance
            if (pn) {
                if (pn.hero_angle) sections.push(`BEST ANGLE: ${pn.hero_angle}`);
                if (pn.lighting_recommendation) sections.push(`LIGHTING: ${pn.lighting_recommendation}`);
            }
        } else {
            // Fallback to playbook
            sections.push(`Description: ${pi.visual_description}`);
            sections.push(`Key Features: ${(pi.key_features || []).join(', ') || 'standard'}`);
        }

        return `[PRODUCT_INJECTION — ABSOLUTE VERBATIM LOCK]
🚨🚨🚨 THE FOLLOWING PRODUCT SPEC IS NON-NEGOTIABLE 🚨🚨🚨
Every line below describes the EXACT product that MUST appear in the generated image.
Do NOT paraphrase. Do NOT generalize. Do NOT substitute. Do NOT invent.
If you deviate from ANY detail below, the output is REJECTED.

${sections.join('\n')}

[BRAND ON PRODUCT — MANDATORY]
🏷️ The brand "${brandName}" MUST be visibly rendered ON the product itself:
- If the product has a logo area (chest, tongue, front panel), place the brand name/logo THERE
- The brand text/logo must be SHARP, LEGIBLE, and correctly spelled
- Match the EXACT logo style from the brand reference image
- The brand identity must be INTEGRATED into the product, not floating in the air
- If the analyzed product shows a specific logo placement, use THAT exact placement`;
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDER (JSON-driven, no hardcoded product content)
    // ═══════════════════════════════════════════════════════════

    /**
     * Builds the user prompt for Gemini text generation.
     * Follows STRICT DYNAMIC HIERARCHY:
     *   1. COMPLIANCE (Must/Must NOT) — Absolute, overrides all
     *   2. BRAND IDENTITY — Colors, tone, product details
     *   3. PRODUCT INJECTION — Verbatim product specs
     *   4. CRITICAL SCENE DIRECTION — Mood-gated restrictions
     *   5. ANGLE — Marketing narrative hook
     *   6. LAYOUT PATTERN — Visual structure from inspiration
     */
    private buildUserPrompt(
        brandName: string,
        playbook: BrandPlaybook,
        conceptAnalysis: any,
        angle: import('../configurations/constants/marketing-angles').MarketingAngle,
        format: import('../configurations/constants/ad-formats').AdFormat,
        productJson?: any,
    ): string {
        const pi = playbook.product_identity!;
        const zones = conceptAnalysis?.layout?.zones || [];
        const zonesJson = JSON.stringify(zones, null, 2);

        // Support both old flat visual_style and new nested background
        const background = conceptAnalysis?.visual_style?.background;
        const backgroundInfo = background && typeof background === 'object'
            ? `${background.type || 'N/A'} (${background.hex || 'N/A'})`
            : conceptAnalysis?.visual_style?.background_hex || 'N/A';
        const overlayInfo = conceptAnalysis?.visual_style?.overlay || 'none';

        // Content pattern info (from Visual DNA schema)
        const contentPattern = conceptAnalysis?.content_pattern;
        const contentPatternSection = contentPattern
            ? `\n - Hook Type: ${contentPattern.hook_type || 'N/A'}
- Narrative Structure: ${contentPattern.narrative_structure || 'N/A'}
- CTA Style: ${contentPattern.cta_style || 'N/A'}
- Requires Product Image: ${contentPattern.requires_product_image ? 'Yes' : 'No'} `
            : '';

        // Target audience section
        const ta = playbook.target_audience;
        const audienceSection = ta
            ? `\n - Target Gender: ${ta.gender || 'All'}
- Target Age: ${ta.age_range || '25-54'}
- Personas: ${ta.personas?.join(', ') || 'N/A'} `
            : '';

        // ━━━ COMPLIANCE (Priority 1 — Absolute) ━━━
        const complianceRules = playbook.compliance?.rules || [];
        const mustNotRules = complianceRules.filter(r =>
            /^(no |never |must not |do not |avoid |forbidden|prohibit)/i.test(r.trim()),
        );
        const mustShowRules = complianceRules.filter(r =>
            !(/^(no |never |must not |do not |avoid |forbidden|prohibit)/i.test(r.trim())),
        );

        const complianceSection = complianceRules.length > 0
            ? `
${'═'.repeat(60)}
🚨 PRIORITY 1 — COMPLIANCE(ABSOLUTE — Override ALL other sections)
${'═'.repeat(60)}
Region: ${playbook.compliance?.region || 'Global'}

These rules are NON - NEGOTIABLE.They override brand, angle, and layout instructions.
    ${mustShowRules.length > 0 ? `\nMUST SHOW:\n${mustShowRules.map(r => `  ✅ ${r}`).join('\n')}` : ''}
${mustNotRules.length > 0 ? `\nMUST NOT (explicit "Do not include" list):\n${mustNotRules.map(r => `  ❌ ${r}`).join('\n')}` : ''}

BACKGROUND RULE: Do NOT use vague or generic environment descriptions.Use the Must Show
rules above to describe a specific, compliant environment.If a certain setting is forbidden,
    you MUST describe a DIFFERENT, brand - appropriate alternative.`
            : '';

        // ━━━ USP section ━━━
        const uspSection = playbook.usp_offers
            ? `\n - Key Benefits: ${playbook.usp_offers.key_benefits?.join(', ') || 'N/A'}
- Current Offer: ${playbook.usp_offers.current_offer || 'N/A'} `
            : '';

        // ━━━ PRODUCT INJECTION (verbatim block) ━━━
        const productInjection = this.buildProductInjection(playbook, productJson);

        // ━━━ CRITICAL SCENE DIRECTION (mood-gated) ━━━
        const criticalSceneDirection = this.buildCriticalSceneDirection(conceptAnalysis, playbook, productJson);

        // Identify safe zones from layout for image_prompt guidance
        const safeZones = zones.filter((z: any) =>
            ['headline', 'body', 'cta_button', 'logo'].includes(z.content_type),
        );

        // Build text overlay contrast instructions per zone
        const textOverlayInstructions = safeZones.length > 0
            ? safeZones.map((z: any) =>
                `   - ${z.content_type.toUpperCase()} zone(y: ${z.y_start}px–${z.y_end}px): Place a dark semi - transparent gradient overlay(rgba(0, 0, 0, 0.40–0.55)) behind this text area.Ensure white text is 100 % legible.`,
            ).join('\n')
            : '   - No specific text zones defined — apply general contrast protection for any text areas.';

        return `You are a professional ad copywriter and image prompt engineer for the brand "${brandName}".

You are writing ad copy AND an ultra-detailed, forensic-level image generation prompt for Gemini Imagen.
The image_prompt you write will be sent DIRECTLY to an AI image model. It must be so overwhelmingly specific that the model has ZERO room to hallucinate or improvise.

🚨 ULTIMATE FIDELITY MANDATE (MICRO-DETAIL EXTRACTION) 🚨
Your image_prompt MUST describe the product with microscopic precision:
1. Specify exact materials (not just "leather", but "matte heavy-grain calfskin").
2. Specify exact physical features (number of buttons, types of seams, hardware finish, logo placement, pocket alignment).
3. Do not generalize anything. If the Product Fidelity section describes intricate stitching, you MUST explicitly command the renderer to show that stitching.

Follow the STRICT PRIORITY HIERARCHY below. Higher-priority sections OVERRIDE lower ones.
    ${complianceSection}

${'═'.repeat(60)}
PRIORITY 2 — BRAND IDENTITY(Colors, Tone, Product)
${'═'.repeat(60)}
- Tone Style: ${playbook.tone_of_voice?.style || 'Professional'}
- Tone Keywords: ${playbook.tone_of_voice?.keywords?.join(', ') || 'N/A'}
- Words to Avoid: ${playbook.tone_of_voice?.donts?.join(', ') || 'N/A'}
- Primary Color: ${playbook.colors?.primary || 'N/A'}
- Secondary Color: ${playbook.colors?.secondary || 'N/A'}
- Accent Color: ${playbook.colors?.accent || 'N/A'}
- Heading Font: ${playbook.fonts?.heading || 'N/A'}
- Body Font: ${playbook.fonts?.body || 'N/A'}

PRODUCT FIDELITY(use exact details — do NOT hallucinate):
- Product: ${pi.product_name} (${pi.product_type})
- Key Features: ${pi.key_features.join(', ')}
- Visual Description: ${pi.visual_description}
- Product Colors: ${Object.entries(pi.colors || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'use brand colors'}
${audienceSection}
${uspSection}

${'═'.repeat(60)}
🚨 PRODUCT INJECTION — MUST COPY VERBATIM INTO image_prompt
${'═'.repeat(60)}
${productInjection}

${'═'.repeat(60)}
🚨 CRITICAL SCENE DIRECTION — READ BEFORE WRITING image_prompt
${'═'.repeat(60)}
${criticalSceneDirection}

${'═'.repeat(60)}
PRIORITY 3 — MARKETING ANGLE(Narrative Hook)
${'═'.repeat(60)}
- Strategy: ${angle.label} (${angle.category?.toUpperCase() || 'GENERAL'})
- Hook: "${angle.hook || angle.description}"
    - Target Persona: ${angle.target_persona || 'general audience'}
- Narrative Arc:
  * Problem: ${angle.narrative_arc?.problem || 'N/A'}
  * Discovery: ${angle.narrative_arc?.discovery || 'N/A'}
  * Result: ${angle.narrative_arc?.result || 'N/A'}
  * Payoff: ${angle.narrative_arc?.payoff || 'N/A'}
- CTA Options: ${angle.cta_options?.join(' | ') || 'Learn More'}
- Compliance: ${angle.compliance_notes || 'None'}
- Apply this narrative approach: ${angle.description}
${contentPatternSection}

${'═'.repeat(60)}
PRIORITY 4 — LAYOUT PATTERN(Visual Structure from Inspiration)
${'═'.repeat(60)}
- Layout Type: ${conceptAnalysis?.layout?.type || 'N/A'}
- Visual Mood: ${conceptAnalysis?.visual_style?.mood || 'N/A'}
- Background Reference: ${backgroundInfo}
- Overlay: ${overlayInfo}
- Zones:
${zonesJson}

${'═'.repeat(60)}
TEXT LEGIBILITY — MANDATORY TEXT RENDERING
${'═'.repeat(60)}
The image_prompt you write MUST instruct the AI image model to RENDER ALL TEXT as visible characters in the image.
For EVERY text zone below, your image_prompt MUST specify:
- The EXACT text content to render
    - Font style(bold, italic, script, sans - serif)
        - Position(top, center, bottom)
        - Color and background treatment for legibility
${textOverlayInstructions}

    === AD FORMAT ===
        - Format: ${format.label} (${format.ratio}, ${format.dimensions})
- Canvas: ${format.width}×${format.height} px

    === PLATFORM SAFE ZONES(🚨 MUST RESPECT) ===
        - DANGER ZONE TOP: ${format.safe_zone.danger_top} px — do NOT place headlines, logos, or brand name here
            - DANGER ZONE BOTTOM: ${format.safe_zone.danger_bottom} px — do NOT place CTA or important text here
                - SIDE MARGINS: ${format.safe_zone.danger_sides}px each side
                    - USABLE AREA: ${format.safe_zone.usable_area.width}×${format.safe_zone.usable_area.height} px(from y: ${format.safe_zone.usable_area.y} to y: ${format.safe_zone.usable_area.y + format.safe_zone.usable_area.height})
                        - ALL text elements(headline, subheadline, CTA, bullet points, brand name) MUST be placed WITHIN the usable area
                            - Your image_prompt MUST mention: "Place all text and key content within the safe zone, avoiding the top ${format.safe_zone.danger_top}px and bottom ${format.safe_zone.danger_bottom}px"

                                === YOUR TASK ===
                                    Generate ad copy for "${pi.product_name}" using the "${angle.label}" marketing angle.
This is a COMPLETE advertisement design — the generated image MUST contain ALL text rendered as visible characters.

The ad MUST respect the priority hierarchy above:
1. FIRST check all Compliance rules
2. THEN apply Brand Identity(use exact product colors, features)
3. THEN obey CRITICAL SCENE DIRECTION
4. THEN apply the Marketing Angle's narrative
5. THEN match the Layout Pattern's visual structure

🚨 CRITICAL — image_prompt rules(MUST FOLLOW EXACTLY):
1. START with: "A complete, finished [editorial/lifestyle/product-hero] advertisement design for social media."
2. PRODUCT: Copy the EXACT product description from the PRODUCT_INJECTION block verbatim
3. PRODUCT PLACEMENT: Describe exact position in frame and camera angle
4. SCENE / ENVIRONMENT: Background, setting, lighting, mood
5. MODEL DIRECTION: If applicable, describe pose / expression / wardrobe
6. TEXT RENDERING(🚨 MOST IMPORTANT):
- "Render the brand name '${brandName}' in large bold sans-serif at the top of the ad"
    - "Render the headline '[your headline text]' in large [italic/bold/script] font in the [position from zones]"
    - "Render the subheadline '[your subheadline text]' in medium clean font below the headline"
    - "Render bullet points with ✓ checkmarks: '[point 1]', '[point 2]', '[point 3]'"
    - "Render the CTA '[your cta text]' inside a [brand-colored] rounded rectangle button at the bottom"
7. DESIGN ELEMENTS: Describe cards, panels, shapes, gradients that frame the text and make it look like a real ad
8. AVOID: garbled text, misspelled words, random characters, plus scene - specific avoids
9. Do NOT use generic terms — use the exact product name from PRODUCT_INJECTION
10. Optimize composition for ${format.label} format(${format.ratio}, ${format.dimensions})

Return ONLY this JSON object(no markdown, no explanation):

{
    "headline": "A short, punchy headline (max 8 words)",
        "subheadline": "A benefit-driven supporting statement (max 20 words)",
            "cta": "An action-oriented CTA (2-5 words), include brand name if possible",
                "bullet_points": ["Benefit point 1", "Benefit point 2", "Benefit point 3"],
                    "image_prompt": "A 300-500 word ultra-detailed prompt that produces a COMPLETE AD IMAGE with ALL text rendered as visible characters. MUST include: brand name rendering, headline rendering, subheadline rendering, bullet point rendering, CTA button rendering, product description from PRODUCT_INJECTION, scene/environment, design elements (cards, panels, buttons), and AVOID list."
} `;
    }
}
