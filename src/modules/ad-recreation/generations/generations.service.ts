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

const READABILITY_LOCK = `[READABILITY LOCK — TEXT CONTRAST PROTECTION — MANDATORY]
For EVERY zone that contains a headline, subheadline, body_paragraphs, or CTA text:

1. CONTRAST OVERLAY (required):
   - Place a semi-transparent dark gradient or solid overlay box (rgba(0,0,0,0.40–0.55)) DIRECTLY BEHIND the white/light text
   - The overlay must cover the ENTIRE text bounding box plus 12% padding on all sides
   - The overlay must blend naturally into the composition (soft feathered edges, NOT a harsh rectangle)
   - If text is white (#FFFFFF) or light-colored, the area behind it MUST be dark enough for 100% legibility

2. BACKGROUND SIMPLICITY:
   - Text zones MUST have a clean, low-detail, low-contrast background — NO busy patterns, NO high-detail imagery directly behind text
   - If the background image is bright (sky, white wall, light gradient), you MUST darken that specific zone

3. CONTRAST RATIO:
   - Minimum 4.5:1 contrast ratio between text color and its immediate background (WCAG AA standard)
   - For large headlines: minimum 3:1 contrast ratio
   - NEVER place white text on a bright or medium-toned background without an overlay

4. PADDING & SPACING:
   - Leave generous padding around text zones (at least 10% of frame width on each side)
   - Text must NOT touch the edge of the overlay or bleed into busy image areas

FAILURE CONDITION: If ANY text in the final image is unreadable due to insufficient contrast, the generation is FAILED.`;

const AD_GENERATION_SYSTEM_PROMPT = `You are a world-class Ad Copywriter and Creative Director specializing in ultra-precise image generation prompts for photorealistic AI image models (Gemini Imagen).

Your job: Generate ad copy AND write an ultra-detailed image generation prompt (image_prompt) that leaves ZERO room for the image model to hallucinate or improvise.

═══════════════════════════════════════════════════════════
CRITICAL RULES — VIOLATION OF ANY RULE IS A FAILURE
═══════════════════════════════════════════════════════════

RULE 1 — STRICT PRODUCT INJECTION (ZERO HALLUCINATION):
- You will receive a [PRODUCT_INJECTION — COPY VERBATIM] block containing the EXACT physical description of the product.
- In your image_prompt, you MUST describe the product using the EXACT words from the PRODUCT_INJECTION block.
- You MUST include ALL physical traits: name, type, specific parts (e.g., "two center track rails", "grey foot pedals", "U-shaped handlebar").
- FORBIDDEN: Do NOT use generic terms like "fitness equipment", "Pilates machine", "exercise device", "workout gear", or ANY synonym. Use the EXACT product name and features.
- If the product injection says "foldable Pilates reformer board with two center track rails, grey foot pedals, and U-shaped handlebar", your image_prompt MUST contain those EXACT words.

RULE 2 — CRITICAL SCENE DIRECTION (MOOD-GATED):
- You will receive a [CRITICAL_SCENE_DIRECTION] block that dictates what the scene CAN and CANNOT show.
- If the scene direction says "Do NOT show anyone exercising", then your image_prompt MUST NOT describe any exercise, workout, or fitness activity.
- If the concept mood is "editorial", "magazine", "clean", or "presentation", your image_prompt must describe a STATIC, COMPOSED scene — product displayed elegantly, NOT in use.
- If the concept mood is "lifestyle" or "action", ONLY THEN may you describe the product being used by a person.
- You MUST include the full AVOID list in your image_prompt.

RULE 3 — TEXT LEGIBILITY (MANDATORY CONTRAST):
- For EVERY zone in the layout that contains text (headline, subheadline, body_paragraphs, CTA):
  - Your image_prompt MUST instruct the image model to place a dark semi-transparent gradient/overlay behind the text zone.
  - Specify: "Place a subtle dark gradient overlay (rgba(0,0,0,0.40–0.55)) behind the text area at [zone location] to ensure 100% legibility of white text."
  - NEVER describe a bright, unobstructed background behind a text zone.

RULE 4 — AD COPY:
- The headline must be punchy, attention-grabbing, and fit within the layout zone (max 8 words).
- The subheadline must expand on the headline with a benefit-driven statement (max 20 words).
- The CTA must be action-oriented and create urgency (2-5 words).
- All text must match the brand's tone of voice.

RULE 5 — OUTPUT FORMAT:
- Return ONLY valid JSON. No markdown, no explanation, no conversational text.
- The image_prompt must be a single, ultra-detailed paragraph (200-400 words) describing the EXACT scene for the image model.

RULE 6 — image_prompt STRUCTURE:
Your image_prompt MUST follow this exact structure in order:
  a) SCENE TYPE: "Photorealistic [editorial/lifestyle/product-hero] advertisement photograph."
  b) PRODUCT DESCRIPTION: Copy VERBATIM from the PRODUCT_INJECTION block.
  c) PRODUCT PLACEMENT: Exact position in frame (center, left-third, etc.) and angle.
  d) SCENE/ENVIRONMENT: Background, setting, lighting, color grading.
  e) MODEL DIRECTION (if applicable): Pose, expression, wardrobe — or "No human model in this scene."
  f) CRITICAL_SCENE_DIRECTION: Copy the scene restrictions verbatim.
  g) TEXT OVERLAY ZONES: For each text zone, describe the contrast overlay.
  h) AVOID LIST: List everything that must NOT appear.`;

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

            if (concept.original_image_url) {
                // 🔧 FIX: Handle legacy URLs with wrong port (3000 -> 4001)
                let refImageUrl = concept.original_image_url;
                if (refImageUrl.includes('localhost:3000')) {
                    const uploadBaseUrl = this.configService.get<string>('UPLOAD_BASE_URL') || 'http://localhost:4001';
                    refImageUrl = refImageUrl.replace('http://localhost:3000', uploadBaseUrl);
                    this.logger.log(`🔧 Fixed legacy image URL: ${concept.original_image_url} -> ${refImageUrl}`);
                }

                this.logger.log(`[REFERENCE IMAGE] Using inspiration image: ${refImageUrl}`);
                imageResult = await this.geminiService.generateImageWithReference(
                    guardedImagePrompt,
                    [refImageUrl], // Inspiration image as reference
                    aspectRatio,
                );
            } else {
                this.logger.warn(`No inspiration image found for concept ${concept.id} — falling back to text-only generation`);
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

        // Scene templates with dynamic product interpolation
        const sceneTemplates: Record<string, string> = {
            problem_solution: `Scene: Split composition. Left side shows the problem state (desaturated, slightly dark). Right side shows the solution with ${productName} in use (bright, warm lighting). Clear visual contrast between problem and solution.`,
            before_after: `Scene: Two-panel layout. "Before" panel (left/top): frustration, muted tones. "After" panel (right/bottom): using ${productName} in a clean, bright environment with warm tones. Transformation must be visually dramatic.`,
            social_proof: `Scene: Lifestyle setting showing ${productName} in a beautiful environment. Include subtle social proof elements: phone screen with 5-star reviews, or trust badge area. Warm, inviting, aspirational lighting.`,
            myth_buster: `Scene: Bold, editorial-style composition. ${productName} is shown center-frame at a slight angle. Strong directional lighting. Clean, modern studio background. The product's key differentiator should be immediately obvious.`,
            feature_highlight: `Scene: Product hero shot. ${productName} is the central focus, shown at a 3/4 angle on a clean surface. Soft studio lighting with subtle gradient background matching brand color (${brandPrimary}). Premium product photography style.`,
            fomo: `Scene: Urgent, high-energy composition. ${productName} shown in a premium lifestyle setting with warm golden-hour lighting. Subtle visual cues of urgency: timer/countdown element area, or limited availability visual zone. Dynamic energy.`,
            cost_savings: `Scene: Value comparison layout. ${productName} shown clean and accessible in a home setting. Subtle visual comparison suggesting expensive alternatives faded out. The product is bright and prominent as the smart choice.`,
            us_vs_them: `Scene: Direct comparison layout. Left: a traditional/competitor alternative in a sterile environment (cool lighting). Right: ${productName} in a warm, inviting setting (natural lighting). Visual preference should clearly favor the product side.`,
            storytelling: `Scene: Narrative sequence feel. A person at home, morning light streaming through windows, using ${productName}. The scene suggests a daily ritual — peaceful, intentional, empowering. Soft, cinematic lighting with warm tones.`,
            minimalist: `Scene: Ultra-clean, minimal composition. ${productName} on a solid white or light grey background. Generous negative space. No clutter, no props — pure product focus. High-end catalogue photography aesthetic.`,
            luxury: `Scene: Aspirational luxury setting. ${productName} in an upscale environment with elegant lighting and soft highlights. Everything communicates premium, exclusive lifestyle.`,
            educational: `Scene: Instructional-style layout. ${productName} shown from a clear, informative angle. Visual callout zones pointing to key features. Clean, well-lit studio setting. Infographic-friendly composition with space for text overlays.`,
            how_to: `Scene: Step-by-step visual flow. Show ${productName} in 3 implied stages of use. Clean studio background with consistent lighting. The composition should flow logically.`,
            benefit_stacking: `Scene: Dynamic product showcase. ${productName} at center with visual zones suggesting multiple benefits. Clean, energetic composition with bright, modern lighting. Space for text overlays.`,
            curiosity_gap: `Scene: Intriguing, partially-revealed composition. ${productName} shown at an artistic angle, partially cropped or dramatically lit to create visual curiosity. Moody, editorial lighting that draws the eye.`,
            expert_endorsement: `Scene: Professional, authoritative setting. ${productName} in a professional or clinical environment. Clean, warm lighting. Space for an expert quote text zone.`,
            user_generated: `Scene: Authentic, casual setting. ${productName} in a real-looking environment (not too styled). Natural lighting (as if from a phone camera). Candid, mid-use, natural — not posed. UGC aesthetic.`,
            lifestyle: `Scene: Aspirational daily-life integration. ${productName} seamlessly placed in a beautiful lifestyle setting. Morning or golden-hour light. Warm, inviting atmosphere.`,
            contrast: `Scene: Strong visual juxtaposition. Split or diagonal composition. One side shows a negative scenario (harsh lighting). The other side shows a positive scenario with ${productName} (warm, natural light). The contrast should be immediately striking.`,
            question: `Scene: Thought-provoking visual. ${productName} shown in an unexpected or intriguing context. The composition should make the viewer stop and think. Clean, bold framing with strong visual anchor.`,
            guarantee: `Scene: Trust-building composition. ${productName} shown prominently with warm, reliable lighting. Visual elements suggesting confidence and satisfaction. Professional, trustworthy commercial photography style.`,
            urgent: `Scene: High-energy composition with warm golden-hour lighting. ${productName} featured prominently with visual urgency cues. Dynamic, action-oriented atmosphere.`,
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
                '- People exercising, working out, or doing fitness activities',
                '- Gym setting, gym equipment, gym interior',
                '- Aggressive workout poses, sweating, athletic strain',
                '- Action shots of the product being used in motion',
                `- ANY fitness equipment other than the exact ${productName}`,
            );
        }

        // Always block generic equipment hallucination for fitness products
        const isFitness = /pilates|fitness|gym|yoga|exercise|reformer|workout/i.test(productType + ' ' + productName);
        if (isFitness) {
            conceptAvoidItems.push(
                '- Generic yoga mats, rowing machines, treadmills, dumbbells, or any equipment NOT matching the exact product description',
                `- Any fitness equipment that is NOT the exact "${productName}" as described in the Product Lock`,
                '- Substituting the product with any similar-looking but different equipment',
            );
        }

        const conceptAvoidSection = conceptAvoidItems.length > 0
            ? `\n[CONCEPT-SPECIFIC AVOID — SCENE MISMATCH PROTECTION]\n${conceptAvoidItems.join('\n')}`
            : '';

        return `[NEGATIVE PROMPT — MUST AVOID]
DO NOT generate any of the following:
- Extra fingers, extra limbs, distorted hands, mutated body parts
- Text, watermarks, logos, or written words embedded in the image
${productNegatives}
- Blurry, low-resolution, or pixelated output
- Overly saturated or neon colors that clash with the brand palette
- Stock photo watermarks or grid overlays
- Multiple copies of the same product in one frame (unless explicitly requested)
- Unrealistic body proportions or uncanny valley faces
- Cluttered, messy compositions with too many visual elements
- Dark, gloomy, or depressing atmospheres (unless the "problem" side of a comparison)
- Generic fitness equipment, generic Pilates machines, generic yoga mats (use EXACT product description only)
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

[CREATIVE DIRECTION FROM AI COPYWRITER]
${rawImagePrompt}

${'═'.repeat(60)}
PRIORITY 4 — LAYOUT PATTERN (Visual Structure from Inspiration)
${'═'.repeat(60)}
${layoutComposition}

${READABILITY_LOCK}

${'═'.repeat(60)}
NEGATIVE REINFORCEMENT (AVOID LIST)
${'═'.repeat(60)}
${negativePrompt}

FINAL INSTRUCTION: Generate a single, high-quality, photorealistic advertisement image.
- ABSOLUTE RULE: The product in the image MUST be the EXACT product described in the Product Injection — "${playbook.product_identity?.product_name || 'the product'}" with ALL its specific physical features. Do NOT substitute with any generic or similar equipment.
- FIRST: Ensure ALL Compliance rules (Priority 1) are satisfied.
- SECOND: Product MUST match the Product Lock AND Product Injection descriptions EXACTLY — use exact colors, features, materials, and part names from the Brand JSON. Do NOT hallucinate or generalize product features.
- THIRD: Obey the CRITICAL SCENE DIRECTION — if it says "Do NOT show exercising", the image MUST NOT show anyone exercising.
- FOURTH: Apply the marketing angle's scene directive for narrative and mood.
- FIFTH: Follow the layout zones for composition, ensuring elements do NOT overlap with Safe Zones.
- If a human model is shown, follow the Persona Lock exactly.
- MANDATORY: Every text overlay zone MUST have a dark semi-transparent overlay behind it per the Readability Lock. No exceptions.`;

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
- Do NOT show anyone exercising, working out, stretching, or performing any fitness activity
- Do NOT show the product being actively used in a workout
- The product (${productName}) must be displayed in a STATIC, COMPOSED, ELEGANT manner
- Think: high-end product photography, magazine editorial, luxury catalogue
- Models (if present) should be STANDING, SITTING, or POSING near the product — NOT using it
- The scene must feel CALM, COMPOSED, and EDITORIAL — not energetic or athletic

AVOID (in this editorial context):
- Gym settings, gym interiors, gym equipment
- Sweating, athletic strain, workout clothes in action
- Dynamic movement, mid-exercise poses
- Generic fitness equipment (yoga mats, dumbbells, resistance bands)
- Any equipment that is NOT the exact ${productName}`;
        }

        // Lifestyle/action mode — allow product use but still enforce product fidelity
        return `[CRITICAL_SCENE_DIRECTION — LIFESTYLE / ACTION MODE]
The product (${productName}) may be shown in active use by a model.

RULES:
- The model may be shown using the product in a natural, lifestyle context
- The product MUST still match the exact description from the Product Lock — no substitutions
- The scene should feel aspirational and inviting, NOT aggressive or intense
- Do NOT show aggressive workout or extreme athletic activity unless the angle explicitly requires it
- The product must remain clearly visible and identifiable in the scene

AVOID:
- Generic fitness equipment that is NOT the exact ${productName}
- Overly aggressive or strained workout poses
- Gym-bro / hardcore fitness aesthetics (unless brand tone explicitly calls for it)`;
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
- Do NOT write "fitness equipment" → write "${pi.product_name}"
- Do NOT write "Pilates machine" → write "${pi.product_name}"
- Do NOT write "exercise device" → write the exact product name and features above
- Do NOT omit any of the key physical features listed above`;
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
        format: { id: string; label: string; ratio: string; dimensions: string },
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
TEXT LEGIBILITY — MANDATORY CONTRAST OVERLAYS
${'═'.repeat(60)}
For EVERY text zone below, your image_prompt MUST include an instruction to place a dark overlay behind the text:
${textOverlayInstructions}

=== AD FORMAT ===
- Format: ${format.label} (${format.ratio}, ${format.dimensions})

=== YOUR TASK ===
Generate ad copy for "${pi.product_name}" using the "${angle.label}" marketing angle.
The ad MUST respect the priority hierarchy above:
1. FIRST check all Compliance rules and ensure nothing violates them
2. THEN apply Brand Identity (use exact product colors, features — no hallucination)
3. THEN obey CRITICAL SCENE DIRECTION (if editorial → NO exercising)
4. THEN apply the Marketing Angle's narrative
5. THEN match the Layout Pattern's visual structure

🚨 CRITICAL — image_prompt rules (MUST FOLLOW EXACTLY):
1. START with: "Photorealistic [editorial/lifestyle/product-hero] advertisement photograph."
2. IMMEDIATELY AFTER: Copy the EXACT product description from the PRODUCT_INJECTION block verbatim. Write: "The product is a ${pi.product_name} — ${pi.visual_description}"
3. PRODUCT PLACEMENT: Describe exact position in frame (center, left-third, etc.) and camera angle
4. SCENE/ENVIRONMENT: Background, setting, lighting direction, color grading, mood
5. MODEL DIRECTION: If a model is present, describe pose, expression, wardrobe. If editorial, the model must NOT be exercising.
6. TEXT OVERLAY ZONES: For each text zone, write: "Place a dark semi-transparent gradient overlay (rgba(0,0,0,0.45)) behind the [zone_type] text area at [position]." This is MANDATORY for every text zone.
7. AVOID LIST: End with: "AVOID: [list everything from CRITICAL_SCENE_DIRECTION avoid list and negative prompt]"
8. Do NOT include text, watermarks, or logos in the image description
9. Do NOT use generic terms like "fitness equipment" or "Pilates machine" — use the exact product name and features from the PRODUCT_INJECTION
10. Optimize composition for ${format.label} format (${format.ratio}, ${format.dimensions})

Return ONLY this JSON object (no markdown, no explanation):

{
  "headline": "A short, punchy headline (max 8 words) that fits the text zone",
  "subheadline": "A benefit-driven supporting statement (max 20 words)",
  "cta": "An action-oriented call-to-action button text (2-5 words)",
  "image_prompt": "A 200-400 word ultra-detailed photorealistic image generation prompt following the exact structure above. MUST include verbatim product description from PRODUCT_INJECTION, MUST include text overlay instructions for every text zone, MUST include AVOID list, MUST obey CRITICAL_SCENE_DIRECTION."
}`;
    }
}
