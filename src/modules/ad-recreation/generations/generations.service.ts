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
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { Product } from '../../../database/entities/Product-Visuals/product.entity';
import { AdBrandsService } from '../brands/ad-brands.service';
import { AdConceptsService } from '../ad-concepts/ad-concepts.service';
import { GeminiService } from '../../../ai/gemini.service';
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

1. TEXT RENDERING RULES:
   - ALL text specified in the TEXT CONTENT section MUST be rendered as readable, pixel-perfect characters directly in the image
   - Text must be sharp, clean, and anti-aliased — NOT blurry, warped, or garbled
   - Each text element must be spelled EXACTLY as provided — zero typos, zero extra characters
   - If a word cannot be rendered clearly, use a simpler synonym but NEVER garble it

2. TYPOGRAPHY HIERARCHY:
   - BRAND NAME: Large, bold, prominent — typically at the top of the ad. Use clean sans-serif or the brand's font style
   - HEADLINE: Second-largest text, high visual impact. Can use italic, script, or bold styles depending on the ad mood
   - SUBHEADLINE / BODY: Smaller, readable supporting text
   - BULLET POINTS: Clean list with checkmarks (✓) or bullet markers
   - CTA BUTTON: Text inside a visible button shape (rounded rectangle, pill, etc.) with contrasting colors

3. CONTRAST & LEGIBILITY:
   - Minimum 4.5:1 contrast ratio between text and background (WCAG AA)
   - If background is busy, place a semi-transparent overlay, card, or solid panel behind text
   - Text zones MUST have clean, low-detail backgrounds

4. LAYOUT INTEGRATION:
   - Text must be integrated into the ad design as a design element, NOT floating randomly
   - Follow the zone positions from the layout analysis
   - Leave generous padding around text (at least 8% of frame width)

FAILURE CONDITIONS:
- If the image contains NO text → FAILED
- If text is misspelled or garbled → FAILED
- If text is unreadable due to poor contrast → FAILED`;

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

RULE 3 — TEXT RENDERING IN IMAGE (MANDATORY):
🚨 THIS IS THE MOST IMPORTANT RULE FOR IMAGE QUALITY 🚨
- The generated image MUST contain ALL of the following text elements rendered as VISIBLE, READABLE characters:
  a) BRAND NAME — prominently displayed, typically at top or bottom
  b) HEADLINE — large, attention-grabbing text in the designated zone
  c) SUBHEADLINE or BODY TEXT — supporting copy, smaller but readable
  d) BULLET POINTS — if the angle includes benefits/features, render them with ✓ markers
  e) CTA — rendered inside a visible button shape (rounded rectangle, pill shape, etc.)
- Your image_prompt MUST explicitly instruct: "Render the text '[exact text]' in [font style] at [position] with [color] on [background]"
- Text must be SPELLED EXACTLY as you write it — zero garbled characters
- Use appropriate typography: bold for headlines, italic for emotional hooks, clean sans-serif for body

RULE 4 — AD COPY:
- The headline must be punchy, attention-grabbing (max 8 words)
- The subheadline must be benefit-driven (max 20 words)
- Include 2-4 bullet points highlighting key benefits with ✓ checkmarks
- The CTA must be action-oriented (2-5 words), include brand name if possible
- All text must match the brand's tone of voice

RULE 5 — OUTPUT FORMAT:
- Return ONLY valid JSON. No markdown, no explanation.
- The image_prompt must be 300-500 words describing the COMPLETE ad design.

RULE 6 — image_prompt STRUCTURE:
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
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        private readonly adBrandsService: AdBrandsService,
        private readonly adConceptsService: AdConceptsService,
        private readonly geminiService: GeminiService,
        private readonly configService: ConfigService,
    ) { }

    // ═══════════════════════════════════════════════════════════
    // GENERATE AD (Complete Pipeline: Text + Image)
    // ═══════════════════════════════════════════════════════════

    async generateAd(
        userId: string,
        dto: GenerateAdDto,
    ): Promise<{ generation: AdGeneration; ad_copy: AdCopyResult; result: AdGenerationResult }> {
        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`STARTING AD GENERATION`);
        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`User ID: ${userId}`);
        this.logger.log(`Brand ID: ${dto.brand_id}`);
        this.logger.log(`Concept ID: ${dto.concept_id}`);
        this.logger.log(`Marketing Angle: ${dto.marketing_angle_id}`);
        this.logger.log(`Format: ${dto.format_id}`);

        // Step 1: Validate marketing angle and format
        this.logger.log(`[STEP 1] Validating marketing angle and format...`);
        const angle = MARKETING_ANGLES.find((a) => a.id === dto.marketing_angle_id);
        if (!angle) {
            this.logger.error(`Invalid marketing angle: ${dto.marketing_angle_id}`);
            throw new BadRequestException(AdGenerationMessage.INVALID_MARKETING_ANGLE);
        }
        this.logger.log(`Marketing angle valid: ${angle.label}`);

        const format = AD_FORMATS.find((f) => f.id === dto.format_id);
        if (!format) {
            this.logger.error(`Invalid ad format: ${dto.format_id}`);
            throw new BadRequestException(AdGenerationMessage.INVALID_AD_FORMAT);
        }
        this.logger.log(`Ad format valid: ${format.label} (${format.ratio})`);

        // Step 2: Fetch brand and concept (with ownership checks)
        this.logger.log(`[STEP 2] Fetching brand and concept from database...`);
        const brand = await this.adBrandsService.findOne(dto.brand_id, userId);
        this.logger.log(`Brand fetched: "${brand.name}" (ID: ${brand.id})`);

        const concept = await this.adConceptsService.findOne(dto.concept_id, userId);
        this.logger.log(`Concept fetched: "${concept.name || 'Unnamed'}" (ID: ${concept.id})`);

        // Step 3: Validate brand playbook (FAIL-FAST)
        this.logger.log(`[STEP 3] Validating brand playbook...`);
        const playbook = brand.brand_playbook;

        if (!playbook) {
            throw new BadRequestException(AdGenerationMessage.BRAND_PLAYBOOK_REQUIRED);
        }

        // Auto-generate product_identity if missing (for brands created before analysis)
        if (!playbook.product_identity || !playbook.product_identity.product_name) {
            this.logger.warn(`Brand ${brand.id} missing product_identity — auto-generating from brand name "${brand.name}"`);
            playbook.product_identity = {
                product_name: brand.name,
                product_type: 'Product',
                visual_description: `A product by ${brand.name}. For better results, re-analyze the brand playbook with product details.`,
                key_features: [],
                colors: {},
                negative_traits: [],
            };
            // Save back to DB so future generations don't need this fallback
            await this.adBrandsService.updatePlaybook(brand.id, userId, playbook);
        }

        if (!playbook.product_identity.visual_description) {
            this.logger.warn(`Brand ${brand.id} has product_identity but no visual_description. Image guardrails will be reduced.`);
        }

        this.logger.log(`Playbook validated: product="${playbook.product_identity.product_name}"`);

        // Step 3.5: Fetch product images if product_id provided
        let productImageUrls: string[] = [];
        let productData: Product | null = null;

        if (dto.product_id) {
            this.logger.log(`[STEP 3.5] Fetching product images for product_id: ${dto.product_id}`);
            productData = await this.productRepository.findOne({ where: { id: dto.product_id } });

            if (productData) {
                const uploadBaseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';

                // Collect all product image URLs
                const fixUrl = (url: string): string => {
                    if (url.includes('localhost:3000')) {
                        return url.replace('http://localhost:3000', uploadBaseUrl);
                    }
                    return url;
                };

                if (productData.front_image_url) {
                    productImageUrls.push(fixUrl(productData.front_image_url));
                }
                if (productData.back_image_url) {
                    productImageUrls.push(fixUrl(productData.back_image_url));
                }
                if (productData.reference_images && Array.isArray(productData.reference_images)) {
                    for (const refUrl of productData.reference_images) {
                        if (refUrl && refUrl.trim()) {
                            productImageUrls.push(fixUrl(refUrl));
                        }
                    }
                }

                this.logger.log(`   Product found: "${productData.name}"`);
                this.logger.log(`   Product images collected: ${productImageUrls.length}`);
                productImageUrls.forEach((url, i) => this.logger.log(`     [${i}] ${url}`));

                // If product has analyzed JSON, enhance the playbook's product_identity
                if (productData.analyzed_product_json) {
                    const pj = productData.analyzed_product_json;
                    this.logger.log(`   Merging analyzed product JSON into prompt context...`);

                    // Enrich product_identity with analyzed data if it was auto-generated
                    if (playbook.product_identity.visual_description?.includes('For better results')) {
                        playbook.product_identity.product_name = pj.general_info?.product_name || productData.name || playbook.product_identity.product_name;
                        playbook.product_identity.visual_description = [
                            pj.texture_description || '',
                            Array.isArray(pj.materials) ? `Materials: ${pj.materials.join(', ')}` : '',
                            Array.isArray(pj.design_elements) ? `Details: ${pj.design_elements.join(', ')}` : '',
                        ].filter(Boolean).join('. ') || playbook.product_identity.visual_description;

                        if (Array.isArray(pj.style_keywords) && pj.style_keywords.length > 0) {
                            playbook.product_identity.key_features = pj.style_keywords;
                        }
                    }
                }
            } else {
                this.logger.warn(`Product with ID ${dto.product_id} not found — continuing without product images`);
            }
        }

        // Step 4: Create generation record (STATUS: PROCESSING)
        this.logger.log(`[STEP 4] Creating generation record...`);
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
        const generationId = saved.id;
        this.logger.log(`Generation record created: ${generationId}`);

        // Step 5: Build prompt for text generation (fully JSON-driven)
        this.logger.log(`[STEP 5] Building text generation prompt...`);
        const userPrompt = this.buildUserPrompt(
            brand.name,
            playbook,
            concept.analysis_json,
            angle,
            format,
        );
        this.logger.log(`Prompt built (${userPrompt.length} chars)`);

        // Step 6: Call Gemini for Ad Copy (TEXT)
        this.logger.log(`[STEP 6] Calling GEMINI for text generation (ad copy)...`);
        await this.generationsRepository.update(generationId, { progress: 30 });

        let adCopy: AdCopyResult;
        try {
            adCopy = await this.callGeminiForAdCopy(userPrompt);
            this.logger.log(`GEMINI TEXT GENERATION COMPLETED`);
            this.logger.log(`   Headline: "${adCopy.headline}"`);
            this.logger.log(`   Subheadline: "${adCopy.subheadline}"`);
            this.logger.log(`   CTA: "${adCopy.cta}"`);
            this.logger.log(`   Image Prompt (${adCopy.image_prompt.length} chars): ${adCopy.image_prompt.substring(0, 150)}...`);
        } catch (error) {
            this.logger.error(`Gemini text generation failed: ${error instanceof Error ? error.message : String(error)}`);
            await this.generationsRepository.update(generationId, {
                status: AdGenerationStatus.FAILED,
                failure_reason: error instanceof Error ? error.message : String(error),
            });
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        // Step 7: Build GUARDED image prompt (dynamic 6-layer guardrails with hierarchy)
        this.logger.log(`[STEP 7] Building guarded image prompt with dynamic hierarchy...`);
        await this.generationsRepository.update(generationId, { progress: 50 });

        const guardedImagePrompt = this.buildGuardedImagePrompt(
            adCopy.image_prompt,
            dto.marketing_angle_id,
            angle,
            playbook,
            concept.analysis_json,
            format,
        );

        const aspectRatio = FORMAT_RATIO_MAP[dto.format_id] || '1:1';
        this.logger.log(`   Aspect Ratio: ${aspectRatio}`);
        this.logger.log(`   Raw image_prompt: ${adCopy.image_prompt.length} chars`);
        this.logger.log(`   Guarded image_prompt: ${guardedImagePrompt.length} chars`);

        let generatedImageBase64: string | null = null;
        let generatedImageUrl: string | null = null;
        let imageMimeType = 'image/png';

        try {
            let imageResult: any;

            // Build combined reference images: inspiration + product images
            const allReferenceImages: string[] = [];
            const uploadBaseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';

            if (concept.original_image_url) {
                // 🔧 FIX: Handle legacy URLs with wrong port (3000 -> 4001)
                let refImageUrl = concept.original_image_url;
                if (refImageUrl.includes('localhost:3000')) {
                    refImageUrl = refImageUrl.replace('http://localhost:3000', uploadBaseUrl);
                    this.logger.log(`🔧 Fixed legacy image URL: ${concept.original_image_url} -> ${refImageUrl}`);
                }
                allReferenceImages.push(refImageUrl);
            }

            // Add product images to reference array
            allReferenceImages.push(...productImageUrls);

            this.logger.log(`[REFERENCE IMAGES] Total: ${allReferenceImages.length}`);
            allReferenceImages.forEach((url, i) => this.logger.log(`   [${i}] ${url}`));

            if (allReferenceImages.length > 0) {
                imageResult = await this.geminiService.generateImageWithReference(
                    guardedImagePrompt,
                    allReferenceImages, // Inspiration + product images as references
                    aspectRatio,
                );
            } else {
                this.logger.warn(`No reference images available — falling back to text-only generation`);
                imageResult = await this.geminiService.generateImage(
                    guardedImagePrompt,
                    undefined,
                    aspectRatio,
                );
            }

            generatedImageBase64 = imageResult.data;
            imageMimeType = imageResult.mimeType || 'image/png';
            this.logger.log(`GEMINI IMAGE GENERATION COMPLETED`);
            this.logger.log(`   MimeType: ${imageMimeType}`);
            this.logger.log(`   Size: ${(generatedImageBase64.length / 1024).toFixed(1)} KB (base64)`);

            // Save image to disk
            await this.generationsRepository.update(generationId, { progress: 80 });

            const uploadsDir = join(process.cwd(), 'uploads', 'generations');
            if (!existsSync(uploadsDir)) {
                mkdirSync(uploadsDir, { recursive: true });
            }

            const extension = imageMimeType.includes('png') ? 'png' : 'jpeg';
            const fileName = `${uuidv4()}.${extension}`;
            const filePath = join(uploadsDir, fileName);
            const imageBuffer = Buffer.from(generatedImageBase64, 'base64');
            writeFileSync(filePath, imageBuffer);

            const baseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';
            generatedImageUrl = `${baseUrl}/uploads/generations/${fileName}`;

            this.logger.log(`Image saved to disk: ${filePath}`);
            this.logger.log(`   URL: ${generatedImageUrl}`);

        } catch (error) {
            this.logger.error(`Gemini image generation failed: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.warn(`Continuing without image - ad copy will still be saved.`);
        }

        // Step 8: Save everything to database
        this.logger.log(`[STEP 8] Saving results to database...`);

        const resultImages = generatedImageUrl ? [
            {
                id: uuidv4(),
                url: generatedImageUrl,
                // base64: generatedImageBase64, // ⚠️ REMOVED to save DB space (Railway volume full)
                format: aspectRatio,
                angle: dto.marketing_angle_id,
                variation_index: 1,
                generated_at: new Date().toISOString(),
            },
        ] : [];

        await this.generationsRepository.update(generationId, {
            generated_copy: adCopy,
            result_images: resultImages,
            status: AdGenerationStatus.COMPLETED,
            progress: 100,
            completed_at: new Date(),
        });

        this.logger.log(`Results saved to DB`);
        this.logger.log(`   Ad Copy: SAVED`);
        this.logger.log(`   Result Images: ${resultImages.length} image(s)`);

        // Step 9: Fetch and return updated generation
        this.logger.log(`[STEP 9] Fetching updated generation record...`);
        const updatedGeneration = await this.generationsRepository.findOne({
            where: { id: generationId },
        });

        if (!updatedGeneration) {
            throw new InternalServerErrorException('Failed to fetch updated generation');
        }

        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`AD GENERATION COMPLETE`);
        this.logger.log(`   Generation ID: ${updatedGeneration.id}`);
        this.logger.log(`   Status: ${updatedGeneration.status}`);
        this.logger.log(`   Result Images: ${updatedGeneration.result_images?.length || 0}`);
        this.logger.log(`═══════════════════════════════════════════════════════════`);

        // Build structured result with new output format
        const adResult: AdGenerationResult = {
            generation_id: updatedGeneration.id,
            content: {
                headline: adCopy.headline,
                subheadline: adCopy.subheadline,
                cta: adCopy.cta,
            },
            design: {
                layout_type: concept.analysis_json?.layout?.type || 'unknown',
                zones: concept.analysis_json?.layout?.zones || [],
                format: format.label,
                ratio: format.ratio,
                safe_zone: format.safe_zone,
            },
            generation_prompt: guardedImagePrompt,
        };

        return { generation: updatedGeneration, ad_copy: adCopy, result: adResult };
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

            const imageBuffer = Buffer.from(imageResult.data, 'base64');

            const uploadsDir = join(process.cwd(), 'uploads', 'generations');
            if (!existsSync(uploadsDir)) {
                mkdirSync(uploadsDir, { recursive: true });
            }

            const fileName = `${uuidv4()}.png`;
            const filePath = join(uploadsDir, fileName);
            writeFileSync(filePath, imageBuffer);

            this.logger.log(`Image saved: ${filePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

            const baseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';
            const imageUrl = `${baseUrl}/uploads/generations/${fileName}`;

            generation.result_images = [
                ...(generation.result_images || []),
                {
                    id: uuidv4(),
                    url: imageUrl,
                    base64: imageResult.data,
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

    /**
     * Builds the PRODUCT LOCK guardrail dynamically from the brand playbook.
     * Ensures the AI image generator produces the correct product identity.
     */
    private buildProductLock(playbook: BrandPlaybook): string {
        const pi = playbook.product_identity!;

        const featureLines = pi.key_features
            .map(f => `- ${f}`)
            .join('\n');

        const colorLines = Object.entries(pi.colors)
            .map(([part, hex]) => `- ${part}: ${hex}`)
            .join('\n');

        const negativeLines = (pi.negative_traits || [])
            .map(t => `- ${t}`)
            .join('\n');

        return `[PRODUCT LOCK — DO NOT MODIFY]
The product is: ${pi.product_name} (${pi.product_type}).
${pi.visual_description}

Physical traits that MUST appear exactly:
${featureLines || '(see visual description above)'}

Product colors:
${colorLines || '(use brand colors)'}

${negativeLines ? `MUST NOT include:\n${negativeLines}` : ''}
If the product is shown, it MUST match the above description exactly. Do NOT invent features.`;
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
    ): string {
        const productName = playbook.product_identity?.product_name || 'the product';
        const brandPrimary = playbook.colors?.primary || '#000000';

        // Scene templates with dynamic product interpolation — each angle has
        // specific LAYOUT, TEXT RENDERING, DESIGN ELEMENTS, and MOOD instructions
        const sceneTemplates: Record<string, string> = {
            problem_solution: `LAYOUT: Split composition — LEFT side shows the problem (no product), RIGHT side shows the solution with ${productName}.
LEFT PANEL: Desaturated, slightly dark, uncomfortable scene representing the pain point. Muted grey/blue color grading.
RIGHT PANEL: Bright, warm, inviting scene with ${productName} prominently featured as the hero solution. Saturated, warm tones.
TEXT RENDERING: Render "The Problem" label on the left panel, "The Solution" label on the right panel. Headline should bridge the two panels.
DESIGN ELEMENTS: Vertical divider or gradient transition between panels. Optional arrow pointing from problem to solution.
MOOD: Dramatic contrast between the two halves — cold/warm, dark/bright.`,

            before_after: `LAYOUT: Split into TWO distinct panels — LEFT (or TOP) panel is "BEFORE", RIGHT (or BOTTOM) panel is "AFTER".
LEFT/TOP PANEL ("BEFORE"): Show the state WITHOUT the product. Muted, desaturated, dull colors. No ${productName} visible. Render the text "BEFORE" as a bold label in the top-left corner of this panel.
RIGHT/BOTTOM PANEL ("AFTER"): Show the transformed, improved state WITH ${productName} clearly visible. Vibrant, glowing, warm colors. Render the text "AFTER" as a bold label in the top-right corner of this panel.
TEXT RENDERING: Render "BEFORE" and "AFTER" labels in bold uppercase sans-serif. Headline should reference transformation (e.g., "See the Difference", "The Transformation").
DESIGN ELEMENTS: Clean vertical or diagonal divider between panels. Optional gradient transition. The contrast between panels must be DRAMATIC and immediately obvious.
MOOD: Cold/dull on BEFORE side, warm/radiant on AFTER side.`,

            social_proof: `LAYOUT: Product-centered with social proof elements surrounding it.
SCENE: ${productName} featured in a warm, aspirational lifestyle setting.
TEXT RENDERING: Render star ratings prominently. Render a short testimonial quote in quotation marks. Render review count (e.g., "2,500+ Happy Customers"). Headline should reference trust or popularity.
DESIGN ELEMENTS: Star rating badge, quotation marks around testimonial, trust badges, optional customer count indicator. Use cards or rounded panels to frame testimonials.
MOOD: Warm, trustworthy, inviting. Soft natural lighting.`,

            myth_buster: `LAYOUT: Bold, editorial-style with a strong headline that debunks a myth.
SCENE: ${productName} shown center-frame with strong directional lighting. Clean, modern background.
TEXT RENDERING: Render the myth in strikethrough or crossed-out style. Then render the truth below it with a green checkmark. Headline should challenge a common belief.
DESIGN ELEMENTS: Red X or strikethrough for the myth, green checkmark for the truth. Bold typography contrast between myth and truth.
MOOD: Confident, authoritative. Strong directional studio lighting.`,

            feature_highlight: `LAYOUT: Product hero shot with feature callout zones.
SCENE: ${productName} as the central focus, shown at a 3/4 angle on a clean surface. Soft studio lighting.
TEXT RENDERING: Render 3-4 feature callouts with lines or arrows pointing to specific parts of the product. Each callout should name a specific feature. Headline should spotlight the key differentiator.
DESIGN ELEMENTS: Thin callout lines from product features to text labels. Clean rounded info badges. Subtle gradient background matching brand color (${brandPrimary}).
MOOD: Premium product photography. Clean, aspirational, informative.`,

            fomo: `LAYOUT: Dynamic, high-energy composition with urgency visual cues.
SCENE: ${productName} in a premium setting with warm golden-hour lighting.
TEXT RENDERING: Render urgency text like "LIMITED TIME OFFER" or "Only X Left" in bold red or orange. Render a countdown-style element. CTA button must feel URGENT. Headline should create scarcity or urgency.
DESIGN ELEMENTS: Timer or countdown visual element, "Limited" badge, sale percentage badge. Optional: strikethrough original price with new price.
MOOD: Urgent, energetic, high-contrast. Warm golden tones with red/orange accents.`,

            cost_savings: `LAYOUT: Value comparison with price emphasis.
SCENE: ${productName} in an accessible, relatable home setting. Clean and approachable.
TEXT RENDERING: Render a price comparison: show the expensive alternative price crossed out, then the product lower price highlighted. Render "Save X%" in a badge. Headline should emphasize value and savings.
DESIGN ELEMENTS: Strikethrough price, savings badge, price comparison visual, "Best Value" tag.
MOOD: Friendly, accessible, smart-shopper energy. Bright, clean lighting.`,

            us_vs_them: `LAYOUT: Side-by-side comparison — LEFT shows "Them/Others", RIGHT shows "Us/${productName}".
LEFT PANEL: Competitor or generic alternative shown in a sterile, cool-toned environment. Label it "Others" or "Them".
RIGHT PANEL: ${productName} in a warm, inviting setting with natural lighting. Label it "Us" or the brand name.
TEXT RENDERING: Render comparison labels "THEM" vs "US". Render feature comparison rows with X for competitor and checkmark for product. Headline should highlight the advantage.
DESIGN ELEMENTS: Comparison table or checklist with X and checkmark markers. Clear visual preference for the product side. Vertical divider between sides.
MOOD: Confident. Cool on competitor side, warm on product side.`,

            storytelling: `LAYOUT: Cinematic, narrative-style composition with a story feel.
SCENE: A person in a relatable daily setting naturally using ${productName}. The scene should feel like a frozen movie frame.
TEXT RENDERING: Headline should be emotional and narrative. Subheadline tells the next chapter of the story. Body text reads like a personal story snippet.
DESIGN ELEMENTS: Cinematic feel, story text in elegant serif or script font. Warm color palette. Optional subtle film grain texture.
MOOD: Cinematic, warm, personal, intimate. Soft morning or golden-hour lighting.`,

            minimalist: `LAYOUT: Ultra-clean, maximum negative space. Product centered.
SCENE: ${productName} on a solid white, off-white, or light grey background. Zero clutter, zero props.
TEXT RENDERING: Minimal text — brand name and ONE short headline only. Small, elegant font. CTA button subtle and refined. No bullet points — let the product speak.
DESIGN ELEMENTS: Generous whitespace (at least 40% of frame is empty). Clean lines. No busy graphics. High-end catalogue aesthetic.
MOOD: Calm, premium, refined. Even, soft studio lighting with no harsh shadows.`,

            luxury: `LAYOUT: Aspirational, high-end composition with rich textures.
SCENE: ${productName} in an upscale environment — marble surface, velvet, gold accents, elegant props. Premium materials visible.
TEXT RENDERING: Headline in elegant serif or thin sans-serif font. Use gold, cream, or white text on dark backgrounds. CTA should feel exclusive. Subheadline whispers exclusivity.
DESIGN ELEMENTS: Gold accents, thin elegant dividers, premium material textures. Subtle sparkle or light reflections.
MOOD: Opulent, exclusive, sophisticated. Dramatic moody lighting with highlights on product.`,

            educational: `LAYOUT: Instructional or infographic-style with clear information zones.
SCENE: ${productName} shown from a clear, informative angle. Clean, well-lit studio.
TEXT RENDERING: Render "Did You Know?" or educational headline. Render 3-4 informative facts or tips with numbered markers or icons. Each fact should teach something valuable.
DESIGN ELEMENTS: Numbered list markers, info icons, callout boxes with rounded corners. Infographic-style layout with clear visual hierarchy.
MOOD: Friendly, knowledgeable, approachable. Bright, even lighting. Clean color palette.`,

            how_to: `LAYOUT: Step-by-step visual flow showing 3 stages of use.
SCENE: ${productName} shown in progressive use stages. Clean background with consistent lighting.
TEXT RENDERING: Render step numbers (1, 2, 3) with step titles. Each step has a brief instruction. Headline like "How To [achieve result] in 3 Easy Steps".
DESIGN ELEMENTS: Numbered step circles or badges, directional arrows between steps, progress indicator. Each step in its own visual zone.
MOOD: Helpful, organized, easy-to-follow. Bright, consistent studio lighting throughout.`,

            benefit_stacking: `LAYOUT: Dynamic product showcase with multiple benefit zones.
SCENE: ${productName} at center with benefit text zones radiating around it.
TEXT RENDERING: Render 4-6 benefits as a checklist with checkmarks. Each benefit on its own line, bold and clear. Headline should promise multiple benefits.
DESIGN ELEMENTS: Checkmark bullets, benefit cards or badges arranged around the product. Optional icons next to each benefit.
MOOD: Energetic, abundant, value-packed. Bright, modern lighting with vibrant colors.`,

            curiosity_gap: `LAYOUT: Intriguing, partially-revealed composition that creates visual curiosity.
SCENE: ${productName} shown at an artistic angle — partially cropped, dramatically lit, creating mystery.
TEXT RENDERING: Headline should tease without revealing fully. DO NOT give the full answer — leave the viewer wanting more. CTA like "Find Out Now" or "Discover the Secret".
DESIGN ELEMENTS: Dramatic shadows, partial reveal, blurred background elements. Mystery and intrigue aesthetic.
MOOD: Mysterious, intriguing, editorial. Moody, dramatic lighting with strong shadows.`,

            expert_endorsement: `LAYOUT: Professional, authoritative composition with expert quote zone.
SCENE: ${productName} in a professional or clinical-looking environment. Clean, credible setting.
TEXT RENDERING: Render an expert quote in quotation marks with expert name and title. Render credibility badges like "Dermatologist Approved" or "Expert Recommended". Headline should reference authority.
DESIGN ELEMENTS: Quotation marks, credential badges, authority text styling. Official and credible feel.
MOOD: Trustworthy, professional, authoritative. Clean clinical lighting, neutral color palette.`,

            user_generated: `LAYOUT: Authentic, casual composition that looks like real user content.
SCENE: ${productName} in a real-looking, not-too-styled environment. Natural, candid setting.
TEXT RENDERING: Headline in casual, friendly tone. Optional social media post frame elements. Quote from a real user in casual language. Star rating.
DESIGN ELEMENTS: Phone-camera quality aesthetic, social media UI elements (heart icon, comment icon), casual style font for quotes. Authentic, not polished.
MOOD: Natural, authentic, relatable. Natural daylight, slightly imperfect composition.`,

            lifestyle: `LAYOUT: Aspirational daily-life integration — product seamlessly placed in a beautiful setting.
SCENE: ${productName} naturally placed in a beautiful lifestyle environment — modern home, outdoor terrace, cozy space.
TEXT RENDERING: Headline should evoke aspiration and identity. Subheadline paints the lifestyle picture. CTA is soft and inviting.
DESIGN ELEMENTS: Lifestyle props that complement the product (plants, candles, books, coffee). Warm color palette. Everything feels curated but natural.
MOOD: Warm, aspirational, inviting. Morning or golden-hour natural lighting.`,

            contrast: `LAYOUT: Strong visual juxtaposition — split or diagonal composition.
LEFT/TOP: Negative scenario WITHOUT the product — harsh, cold lighting, dull colors, discomfort.
RIGHT/BOTTOM: Positive scenario WITH ${productName} — warm, natural light, vibrant, comfortable.
TEXT RENDERING: Render contrasting labels like "Without" and "With" or X and checkmark labels. Headline highlights the stark difference.
DESIGN ELEMENTS: Diagonal or vertical split, contrasting color grading (cold blue vs warm gold). Clear visual preference for the product side.
MOOD: Dramatic contrast. Cold/uncomfortable on negative side, warm/pleasant on positive side.`,

            question: `LAYOUT: Bold, attention-grabbing composition built around a central question.
SCENE: ${productName} shown in context that relates to the question being asked.
TEXT RENDERING: Render a LARGE, provocative question as the dominant headline. The question mark should be visually prominent. Subheadline begins to answer the question.
DESIGN ELEMENTS: Large question mark as design element, bold typography, engaging visual that provokes thought.
MOOD: Curious, engaging, thought-provoking. Bright, inviting lighting.`,

            guarantee: `LAYOUT: Trust-focused composition with guarantee badge prominently displayed.
SCENE: ${productName} shown confidently with trust-building visual elements.
TEXT RENDERING: Render guarantee text prominently: "100% Money-Back Guarantee" or "30-Day Risk-Free Trial" in a badge or seal. Headline should reduce purchase anxiety. CTA should emphasize zero risk.
DESIGN ELEMENTS: Guarantee seal or badge (shield or ribbon shape), trust badges, "Risk-Free" labels, checkmarks next to guarantee terms.
MOOD: Confident, reassuring, trustworthy. Clean, bright lighting. Professional color palette.`,

            urgent: `LAYOUT: High-energy, time-sensitive composition.
SCENE: ${productName} featured prominently with dynamic, energetic atmosphere.
TEXT RENDERING: Render countdown or deadline text like "ENDS TONIGHT" or "24 HOURS LEFT". Render sale percentage or deal in large text. CTA must convey immediate action.
DESIGN ELEMENTS: Timer or clock visual, "SALE" flash badge, percentage-off ribbon, red/orange accent highlights. Flash sale energy.
MOOD: URGENT, high-energy, dynamic. Warm golden-hour lighting with red/orange accent highlights.`,
        };

        const template = sceneTemplates[angleId];
        if (template) {
            return `[SCENE DIRECTIVE — ${angleId.toUpperCase()}]\n${template}`;
        }

        // Fallback: build from angle description
        return `[SCENE DIRECTIVE — ${angleId.toUpperCase()}]
Scene for "${angleLabel}" angle: ${angleDescription}
Show ${productName} prominently. Use brand colors (primary: ${brandPrimary}). Professional commercial photography.`;
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
                model: 'gemini-2.0-flash',
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
        angle: { id: string; label: string; description: string },
        playbook: BrandPlaybook,
        conceptAnalysis?: any,
        format?: import('../configurations/constants/ad-formats').AdFormat,
    ): string {
        // ━━━ LAYER 1: COMPLIANCE LOCK (ABSOLUTE — overrides everything) ━━━
        const complianceLock = this.buildComplianceLock(playbook);

        // ━━━ LAYER 2: BRAND IDENTITY (Product + Persona + Colors) ━━━
        const productLock = this.buildProductLock(playbook);
        const personaLock = this.buildPersonaLock(playbook);

        // ━━━ LAYER 2.5: PRODUCT INJECTION (verbatim reiteration for Gemini) ━━━
        const productInjection = this.buildProductInjection(playbook);

        // ━━━ LAYER 3: MARKETING ANGLE (Scene directive) ━━━
        const sceneDirective = this.buildSceneDirective(
            angleId, angle.label, angle.description, playbook,
        );

        // ━━━ LAYER 3.5: CRITICAL SCENE DIRECTION (mood-gated) ━━━
        const criticalSceneDirection = this.buildCriticalSceneDirection(conceptAnalysis, playbook);

        // ━━━ LAYER 4: LAYOUT PATTERN (from inspiration concept) ━━━
        const layoutComposition = this.buildLayoutComposition(conceptAnalysis);

        // ━━━ NEGATIVE REINFORCEMENT (combines all forbidden items + concept-aware) ━━━
        const negativePrompt = this.buildNegativePrompt(playbook, conceptAnalysis);

        const guardedPrompt = `You are generating a photorealistic advertisement image.
Follow ALL rules below in STRICT PRIORITY ORDER. Higher-priority rules OVERRIDE lower-priority ones.
The product shown MUST match the Product Injection EXACTLY. Do NOT invent, substitute, or generalize any product features.

${'═'.repeat(60)}
PRIORITY 1 — COMPLIANCE (ABSOLUTE, OVERRIDE ALL)
${'═'.repeat(60)}
${complianceLock}

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
PLATFORM SAFE ZONES — CONTENT PLACEMENT RULES
${'═'.repeat(60)}
Format: ${format.label} (${format.ratio}, ${format.width}×${format.height})

🚨 CRITICAL PLACEMENT RULES:
- DANGER ZONE TOP (${format.safe_zone.danger_top}px): Do NOT place any important content (headlines, logos, CTAs) in the top ${format.safe_zone.danger_top}px — hidden by status bar / username / audio pill
- DANGER ZONE BOTTOM (${format.safe_zone.danger_bottom}px): Do NOT place any important content in the bottom ${format.safe_zone.danger_bottom}px — hidden by CTA button / captions / nav bar
- SIDE MARGINS (${format.safe_zone.danger_sides}px each): Keep ${format.safe_zone.danger_sides}px margin on each side
- USABLE AREA: All important content (headlines, product, CTA, bullet points, logo) MUST be within:
  x: ${format.safe_zone.usable_area.x}px to ${format.safe_zone.usable_area.x + format.safe_zone.usable_area.width}px
  y: ${format.safe_zone.usable_area.y}px to ${format.safe_zone.usable_area.y + format.safe_zone.usable_area.height}px
  (${format.safe_zone.usable_area.width}×${format.safe_zone.usable_area.height}px usable area)

Place headline and brand name BELOW the top danger zone.
Place CTA button ABOVE the bottom danger zone.
Center important product imagery within the usable area.
` : ''}
${'═'.repeat(60)}
NEGATIVE REINFORCEMENT (AVOID LIST)
${'═'.repeat(60)}
${negativePrompt}

FINAL INSTRUCTION: Generate a single, high-quality advertisement image that is a COMPLETE, FINISHED AD DESIGN.
- The image MUST contain RENDERED TEXT: brand name, headline, subheadline, bullet points, and CTA button text — all clearly readable
- Product MUST match the Product Lock AND Product Injection descriptions EXACTLY
- Obey CRITICAL SCENE DIRECTION restrictions
- Apply marketing angle's scene directive for narrative and mood
- Follow layout zones for composition
- ALL content must be within the SAFE ZONE — nothing important in danger zones
- Text must be spelled EXACTLY as written — zero garbled characters
- The final result should look like a professional social media advertisement ready to publish`;

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
    private buildCriticalSceneDirection(conceptAnalysis?: any, playbook?: BrandPlaybook): string {
        const mood = conceptAnalysis?.visual_style?.mood?.toLowerCase() || '';
        const hookType = conceptAnalysis?.content_pattern?.hook_type?.toLowerCase() || '';
        const layoutType = conceptAnalysis?.layout?.type?.toLowerCase() || '';
        const productName = playbook?.product_identity?.product_name || 'the product';

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
     * description of the product. This block must be copied VERBATIM
     * into the Gemini image generation prompt.
     */
    private buildProductInjection(playbook: BrandPlaybook): string {
        const pi = playbook.product_identity;
        if (!pi) {
            return `[PRODUCT_INJECTION — NO PRODUCT DATA AVAILABLE]
No product identity data was provided. Use the brand name for general product reference.`;
        }

        const featureString = pi.key_features.length > 0
            ? pi.key_features.join(', ')
            : 'no specific features listed';

        const colorString = Object.entries(pi.colors || {}).length > 0
            ? Object.entries(pi.colors).map(([part, hex]) => `${part}: ${hex}`).join(', ')
            : 'use brand colors';

        return `[PRODUCT_INJECTION — COPY VERBATIM INTO IMAGE PROMPT]
🚨 The following product description MUST appear VERBATIM in the image generation prompt.
Do NOT paraphrase, generalize, or use synonyms. Copy these exact words:

PRODUCT: ${pi.product_name}
TYPE: ${pi.product_type}
EXACT DESCRIPTION: ${pi.visual_description}
KEY PHYSICAL FEATURES: ${featureString}
PRODUCT COLORS: ${colorString}

FORBIDDEN SUBSTITUTIONS:
- Do NOT use generic category terms (like "cosmetic", "device", "equipment", "product") → write "${pi.product_name}"
- Do NOT paraphrase or summarize the visual description → copy it VERBATIM
- Do NOT omit any of the key physical features listed above
- Do NOT substitute the product with any similar-looking alternative`;
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
        angle: { id: string; label: string; description: string },
        format: import('../configurations/constants/ad-formats').AdFormat,
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
            ? `\n- Hook Type: ${contentPattern.hook_type || 'N/A'}
- Narrative Structure: ${contentPattern.narrative_structure || 'N/A'}
- CTA Style: ${contentPattern.cta_style || 'N/A'}
- Requires Product Image: ${contentPattern.requires_product_image ? 'Yes' : 'No'}`
            : '';

        // Target audience section
        const ta = playbook.target_audience;
        const audienceSection = ta
            ? `\n- Target Gender: ${ta.gender || 'All'}
- Target Age: ${ta.age_range || '25-54'}
- Personas: ${ta.personas?.join(', ') || 'N/A'}`
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
🚨 PRIORITY 1 — COMPLIANCE (ABSOLUTE — Override ALL other sections)
${'═'.repeat(60)}
Region: ${playbook.compliance?.region || 'Global'}

These rules are NON-NEGOTIABLE. They override brand, angle, and layout instructions.
${mustShowRules.length > 0 ? `\nMUST SHOW:\n${mustShowRules.map(r => `  ✅ ${r}`).join('\n')}` : ''}
${mustNotRules.length > 0 ? `\nMUST NOT (explicit "Do not include" list):\n${mustNotRules.map(r => `  ❌ ${r}`).join('\n')}` : ''}

BACKGROUND RULE: Do NOT use vague or generic environment descriptions. Use the Must Show
rules above to describe a specific, compliant environment. If a certain setting is forbidden,
you MUST describe a DIFFERENT, brand-appropriate alternative.`
            : '';

        // ━━━ USP section ━━━
        const uspSection = playbook.usp_offers
            ? `\n- Key Benefits: ${playbook.usp_offers.key_benefits?.join(', ') || 'N/A'}
- Current Offer: ${playbook.usp_offers.current_offer || 'N/A'}`
            : '';

        // ━━━ PRODUCT INJECTION (verbatim block) ━━━
        const productInjection = this.buildProductInjection(playbook);

        // ━━━ CRITICAL SCENE DIRECTION (mood-gated) ━━━
        const criticalSceneDirection = this.buildCriticalSceneDirection(conceptAnalysis, playbook);

        // Identify safe zones from layout for image_prompt guidance
        const safeZones = zones.filter((z: any) =>
            ['headline', 'body', 'cta_button', 'logo'].includes(z.content_type),
        );

        // Build text overlay contrast instructions per zone
        const textOverlayInstructions = safeZones.length > 0
            ? safeZones.map((z: any) =>
                `   - ${z.content_type.toUpperCase()} zone (y: ${z.y_start}px–${z.y_end}px): Place a dark semi-transparent gradient overlay (rgba(0,0,0,0.40–0.55)) behind this text area. Ensure white text is 100% legible.`,
            ).join('\n')
            : '   - No specific text zones defined — apply general contrast protection for any text areas.';

        return `You are a professional ad copywriter and image prompt engineer for the brand "${brandName}".

You are writing ad copy AND an ultra-detailed image generation prompt for Gemini Imagen.
The image_prompt you write will be sent DIRECTLY to an AI image model. It must be so specific that the model has ZERO room to hallucinate or improvise.

Follow the STRICT PRIORITY HIERARCHY below. Higher-priority sections OVERRIDE lower ones.
${complianceSection}

${'═'.repeat(60)}
PRIORITY 2 — BRAND IDENTITY (Colors, Tone, Product)
${'═'.repeat(60)}
- Tone Style: ${playbook.tone_of_voice?.style || 'Professional'}
- Tone Keywords: ${playbook.tone_of_voice?.keywords?.join(', ') || 'N/A'}
- Words to Avoid: ${playbook.tone_of_voice?.donts?.join(', ') || 'N/A'}
- Primary Color: ${playbook.colors?.primary || 'N/A'}
- Secondary Color: ${playbook.colors?.secondary || 'N/A'}
- Accent Color: ${playbook.colors?.accent || 'N/A'}
- Heading Font: ${playbook.fonts?.heading || 'N/A'}
- Body Font: ${playbook.fonts?.body || 'N/A'}

PRODUCT FIDELITY (use exact details — do NOT hallucinate):
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
PRIORITY 3 — MARKETING ANGLE (Narrative Hook)
${'═'.repeat(60)}
- Strategy: ${angle.label}
- Apply this approach: ${angle.description}
${contentPatternSection}

${'═'.repeat(60)}
PRIORITY 4 — LAYOUT PATTERN (Visual Structure from Inspiration)
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
- Font style (bold, italic, script, sans-serif)
- Position (top, center, bottom)
- Color and background treatment for legibility
${textOverlayInstructions}

=== AD FORMAT ===
- Format: ${format.label} (${format.ratio}, ${format.dimensions})
- Canvas: ${format.width}×${format.height}px

=== PLATFORM SAFE ZONES (🚨 MUST RESPECT) ===
- DANGER ZONE TOP: ${format.safe_zone.danger_top}px — do NOT place headlines, logos, or brand name here
- DANGER ZONE BOTTOM: ${format.safe_zone.danger_bottom}px — do NOT place CTA or important text here
- SIDE MARGINS: ${format.safe_zone.danger_sides}px each side
- USABLE AREA: ${format.safe_zone.usable_area.width}×${format.safe_zone.usable_area.height}px (from y:${format.safe_zone.usable_area.y} to y:${format.safe_zone.usable_area.y + format.safe_zone.usable_area.height})
- ALL text elements (headline, subheadline, CTA, bullet points, brand name) MUST be placed WITHIN the usable area
- Your image_prompt MUST mention: "Place all text and key content within the safe zone, avoiding the top ${format.safe_zone.danger_top}px and bottom ${format.safe_zone.danger_bottom}px"

=== YOUR TASK ===
Generate ad copy for "${pi.product_name}" using the "${angle.label}" marketing angle.
This is a COMPLETE advertisement design — the generated image MUST contain ALL text rendered as visible characters.

The ad MUST respect the priority hierarchy above:
1. FIRST check all Compliance rules
2. THEN apply Brand Identity (use exact product colors, features)
3. THEN obey CRITICAL SCENE DIRECTION
4. THEN apply the Marketing Angle's narrative
5. THEN match the Layout Pattern's visual structure

🚨 CRITICAL — image_prompt rules (MUST FOLLOW EXACTLY):
1. START with: "A complete, finished [editorial/lifestyle/product-hero] advertisement design for social media."
2. PRODUCT: Copy the EXACT product description from the PRODUCT_INJECTION block verbatim
3. PRODUCT PLACEMENT: Describe exact position in frame and camera angle
4. SCENE/ENVIRONMENT: Background, setting, lighting, mood
5. MODEL DIRECTION: If applicable, describe pose/expression/wardrobe
6. TEXT RENDERING (🚨 MOST IMPORTANT):
   - "Render the brand name '${brandName}' in large bold sans-serif at the top of the ad"
   - "Render the headline '[your headline text]' in large [italic/bold/script] font in the [position from zones]"
   - "Render the subheadline '[your subheadline text]' in medium clean font below the headline"
   - "Render bullet points with ✓ checkmarks: '[point 1]', '[point 2]', '[point 3]'"
   - "Render the CTA '[your cta text]' inside a [brand-colored] rounded rectangle button at the bottom"
7. DESIGN ELEMENTS: Describe cards, panels, shapes, gradients that frame the text and make it look like a real ad
8. AVOID: garbled text, misspelled words, random characters, plus scene-specific avoids
9. Do NOT use generic terms — use the exact product name from PRODUCT_INJECTION
10. Optimize composition for ${format.label} format (${format.ratio}, ${format.dimensions})

Return ONLY this JSON object (no markdown, no explanation):

{
  "headline": "A short, punchy headline (max 8 words)",
  "subheadline": "A benefit-driven supporting statement (max 20 words)",
  "cta": "An action-oriented CTA (2-5 words), include brand name if possible",
  "bullet_points": ["Benefit point 1", "Benefit point 2", "Benefit point 3"],
  "image_prompt": "A 300-500 word ultra-detailed prompt that produces a COMPLETE AD IMAGE with ALL text rendered as visible characters. MUST include: brand name rendering, headline rendering, subheadline rendering, bullet point rendering, CTA button rendering, product description from PRODUCT_INJECTION, scene/environment, design elements (cards, panels, buttons), and AVOID list."
}`;
    }
}
