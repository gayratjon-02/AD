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
// PRODUCT DATA TYPE (Phase 1 schema)
// ═══════════════════════════════════════════════════════════

interface ProductData {
    product_name: string;
    colors: Record<string, string>;
    key_features: string[];
    visual_description: string;
}

// ═══════════════════════════════════════════════════════════
// FORMAT RATIO MAP
// ═══════════════════════════════════════════════════════════

const FORMAT_RATIO_MAP: Record<string, string> = {
    story: '9:16',
    square: '1:1',
    portrait: '4:5',
    landscape: '16:9',
};

// ═══════════════════════════════════════════════════════════
// HARDCODED PRODUCT DATA (P0 MVP)
// ═══════════════════════════════════════════════════════════

const BRAND_PRODUCT_MAP: Record<string, ProductData> = {
    pilanova: {
        product_name: 'Foldable Pilates Reformer',
        colors: { board: '#B8A9D9', metal: '#000000' },
        key_features: ['Two center track rails', 'Grey foot pedals', 'Foldable design', 'Resistance bands included'],
        visual_description: 'A flat, foldable board with resistance bands, featuring a lavender-colored surface with black metal frame, grey foot pedals, and two center track rails for smooth carriage movement.',
    },
};

// ═══════════════════════════════════════════════════════════
// STRICT GUARDRAILS SYSTEM - 5 Layers
// ═══════════════════════════════════════════════════════════

/**
 * Layer 1: PRODUCT LOCK
 * Immutable physics description of PilaNova Foldable Pilates Reformer.
 * This block is injected verbatim into every image prompt to prevent
 * the AI from hallucinating product appearance.
 */
const PRODUCT_LOCK = `[PRODUCT LOCK — DO NOT MODIFY]
The product is a PilaNova Foldable Pilates Reformer. It is a flat, foldable board (NOT a traditional reformer with a carriage/tower).
Physical traits that MUST appear exactly:
- Board surface color: lavender/light purple (#B8A9D9)
- Frame/rails: matte black metal
- Two center track rails running lengthwise
- Grey foot pedals at one end
- Resistance bands attached (visible elastic bands with handles)
- Compact, flat profile — approximately 2 inches tall when folded
- NO traditional pilates reformer tower, NO springs, NO sliding carriage
If the product is shown, it MUST match the above description exactly. Do NOT invent features.`;

/**
 * Layer 2: PERSONA LOCK
 * Ensures consistent human model representation across all ads.
 * Anatomically correct, no distortion, premium activewear.
 */
const PERSONA_LOCK = `[PERSONA LOCK — HUMAN MODEL RULES]
If a human model appears in the image:
- Gender: Female only
- Age appearance: 30-45 years old
- Body type: Fit, athletic, healthy-looking
- Clothing: Premium activewear (sports bra + leggings or fitted workout top + leggings)
- Activewear colors: Black, dark grey, or muted earth tones (NO bright neon)
- Expression: Confident, calm, focused — NOT overly posed or unnatural
- Anatomy: ALL body proportions must be anatomically correct. Correct number of fingers (5 per hand), correct limb proportions, natural joint angles
- Hair: Pulled back (ponytail or bun) to show the face clearly
- NO extra limbs, NO distorted faces, NO unnatural body bending`;

/**
 * Layer 3: READABILITY LOCK
 * Ensures text overlay zones have sufficient contrast for readability.
 */
const READABILITY_LOCK = `[READABILITY LOCK — TEXT CONTRAST PROTECTION]
For any area where text will be overlaid:
- Place a dark semi-transparent dimmer layer (rgba(0,0,0,0.35) equivalent) behind the text zone
- Text zones must have a clean, uncluttered background — no busy patterns or high-detail imagery directly behind text
- Ensure at least 60% contrast ratio between text area background and surrounding image
- The dimmer must blend naturally with the overall composition — NOT look like a harsh rectangle
- Leave generous padding around text zones (at least 8% of frame width on each side)`;

/**
 * Layer 4: ANGLE-SPECIFIC SCENE LOGIC
 * Custom scene descriptions keyed by marketing angle ID.
 * Each angle gets a tailored visual environment.
 */
const ANGLE_SCENE_MAP: Record<string, string> = {
    problem_solution: 'Scene: Split composition. Left side shows a cramped, messy living room with no space for exercise equipment (desaturated, slightly dark). Right side shows the same room but clean and spacious with the PilaNova reformer unfolded and in use (bright, warm lighting). Clear visual contrast between problem and solution.',
    before_after: 'Scene: Two-panel layout. "Before" panel (left or top): A woman looking frustrated, sitting on a couch surrounded by bulky unused gym equipment, muted tones. "After" panel (right or bottom): The same woman using the PilaNova reformer in a clean, bright room with natural light, vibrant warm tones. Transformation must be visually dramatic.',
    social_proof: 'Scene: Lifestyle setting showing the PilaNova reformer in a beautiful, bright home studio. Include subtle social proof elements: a phone screen showing 5-star reviews in the background, or a subtle "As seen in" badge area. The model is mid-exercise, looking satisfied. Warm, inviting, aspirational lighting.',
    myth_buster: 'Scene: Bold, editorial-style composition. The PilaNova reformer is shown center-frame at a slight angle to reveal its compact folded size next to a traditional bulky pilates reformer (shown faded/ghosted in background). Strong directional lighting. Clean, modern studio background. The contrast in size should be immediately obvious.',
    feature_highlight: 'Scene: Product hero shot. The PilaNova reformer is the central focus, shown at a 3/4 angle on a clean, minimal surface. Soft studio lighting with subtle gradient background matching brand colors. Close-up details visible: track rails, resistance bands, foot pedals. Premium product photography style.',
    fomo: 'Scene: Urgent, high-energy composition. The PilaNova reformer shown in a premium lifestyle setting with warm golden-hour lighting. Subtle visual cues of urgency: a timer/countdown element area, or a "limited stock" visual zone. The model is actively using the product with dynamic energy.',
    cost_savings: 'Scene: Value comparison layout. The PilaNova reformer shown clean and accessible in a home setting. Subtle visual comparison: small icons or zones suggesting gym membership cards, expensive equipment, monthly fees — all faded/crossed out. The reformer is bright and prominent as the affordable alternative.',
    us_vs_them: 'Scene: Direct comparison layout. Left: a traditional bulky, expensive pilates reformer in a sterile gym (cool, clinical lighting). Right: the PilaNova foldable reformer in a warm, inviting home environment (warm, natural lighting). The visual preference should clearly favor the PilaNova side.',
    storytelling: 'Scene: Narrative sequence feel. A woman at home, morning light streaming through windows, unfolding the PilaNova reformer from its compact stored position. The scene suggests a daily ritual — peaceful, intentional, empowering. Soft, cinematic lighting with warm tones.',
    minimalist: 'Scene: Ultra-clean, minimal composition. The PilaNova reformer on a solid white or light grey background. Generous negative space. One or two subtle shadow lines. No clutter, no props, no model — pure product focus. High-end catalogue photography aesthetic.',
    luxury: 'Scene: Aspirational luxury setting. The PilaNova reformer in an upscale home with marble floors, floor-to-ceiling windows, and city skyline or nature view. Elegant lighting with soft highlights. The model (if present) wears premium black activewear. Everything communicates premium, exclusive lifestyle.',
    educational: 'Scene: Instructional-style layout. The PilaNova reformer shown from a clear, informative angle. Visual callout zones pointing to key features (track rails, resistance bands, fold mechanism). Clean, well-lit studio setting. Infographic-friendly composition with space for text overlays.',
    how_to: 'Scene: Step-by-step visual flow. Show the PilaNova reformer in 3 implied stages: folded/stored, unfolding, and in-use. Clean studio background with consistent lighting. Each stage clearly visible. The composition should flow left-to-right or top-to-bottom logically.',
    benefit_stacking: 'Scene: Dynamic product showcase. The PilaNova reformer at center with visual "benefit rays" — subtle graphic zones radiating outward suggesting multiple benefits. Clean, energetic composition with bright, modern lighting. Space for multiple text overlay zones.',
    curiosity_gap: 'Scene: Intriguing, partially-revealed composition. The PilaNova reformer shown at an artistic angle, partially cropped or dramatically lit to create visual curiosity. One striking detail is highlighted (e.g., the folding mechanism or track rails). Moody, editorial lighting that draws the eye.',
    expert_endorsement: 'Scene: Professional, authoritative setting. The PilaNova reformer in a physical therapy clinic or professional pilates studio. Clean, clinical-but-warm lighting. Space for an "expert quote" text zone. The model (if present) looks like a professional instructor or therapist.',
    user_generated: 'Scene: Authentic, casual home setting. The PilaNova reformer in a real-looking living room or bedroom (not too styled). Natural, slightly imperfect lighting (as if from a phone camera). The model is candid, mid-workout, looking natural — not posed. UGC (user-generated content) aesthetic.',
    lifestyle: 'Scene: Aspirational daily-life integration. The PilaNova reformer seamlessly placed in a beautiful home setting — perhaps next to a yoga mat, a water bottle, and a plant. Morning or golden-hour light. The model is relaxed, post-workout, embodying wellness. Warm, inviting, "I want that life" aesthetic.',
    contrast: 'Scene: Strong visual juxtaposition. Split or diagonal composition. One side shows a chaotic, stressful gym environment (crowded, harsh fluorescent lighting). The other side shows a peaceful home workout with the PilaNova reformer (warm, calm, natural light). The contrast should be immediately striking.',
    question: 'Scene: Thought-provoking visual. The PilaNova reformer shown in an unexpected or intriguing context — perhaps a tiny apartment where it fits perfectly, or next to bulky equipment it clearly outperforms. The composition should make the viewer stop and think. Clean, bold framing with strong visual anchor.',
    guarantee: 'Scene: Trust-building composition. The PilaNova reformer shown prominently with warm, reliable lighting. Visual elements suggesting confidence: clean packaging, a subtle "guarantee badge" zone, or a satisfied customer mid-use. Professional, trustworthy commercial photography style.',
};

/**
 * Layer 5: NEGATIVE PROMPT
 * Anti-hallucination text appended to every image generation prompt.
 * Prevents common AI image generation failures.
 */
const NEGATIVE_PROMPT = `[NEGATIVE PROMPT — MUST AVOID]
DO NOT generate any of the following:
- Extra fingers, extra limbs, distorted hands, mutated body parts
- Text, watermarks, logos, or written words embedded in the image
- Traditional pilates reformer with tower/springs/carriage (the product is a FLAT FOLDABLE BOARD)
- Blurry, low-resolution, or pixelated output
- Overly saturated or neon colors that clash with the brand palette
- Stock photo watermarks or grid overlays
- Multiple copies of the same product in one frame (unless explicitly requested)
- Unrealistic body proportions or uncanny valley faces
- Cluttered, messy compositions with too many visual elements
- Dark, gloomy, or depressing atmospheres (unless the "problem" side of a comparison)`;

// ═══════════════════════════════════════════════════════════
// PROMPT CONSTANTS
// ═══════════════════════════════════════════════════════════

const AD_GENERATION_SYSTEM_PROMPT = `You are a world-class Ad Copywriter and Creative Director with 15+ years of experience crafting high-converting advertisements.

Your job: Generate ad copy that perfectly matches the provided brand identity, layout structure, and marketing angle.

RULES:
1. The headline must be punchy, attention-grabbing, and fit within the layout zone designated for text.
2. The subheadline must expand on the headline with a benefit-driven statement.
3. The CTA must be action-oriented and create urgency.
4. The image_prompt must be a highly detailed description for an image generation AI, including composition, lighting, color palette, mood, and product placement.
5. Return ONLY valid JSON. No markdown, no explanation, no conversational text.
6. All text must match the brand's tone of voice and style guidelines.`;

/**
 * Generations Service - Phase 2: Ad Recreation
 *
 * Orchestrates the full ad generation pipeline using GEMINI ONLY:
 * 1. generateAd: Brand + Concept + Angle → Auto-fetch Product → Gemini Pro → Ad Copy → Gemini Image → Complete Ad
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
    ): Promise<{ generation: AdGeneration; ad_copy: AdCopyResult }> {
        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`🚀 STARTING AD GENERATION`);
        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`📌 User ID: ${userId}`);
        this.logger.log(`📌 Brand ID: ${dto.brand_id}`);
        this.logger.log(`📌 Concept ID: ${dto.concept_id}`);
        this.logger.log(`📌 Marketing Angle: ${dto.marketing_angle_id}`);
        this.logger.log(`📌 Format: ${dto.format_id}`);

        // Step 1: Validate marketing angle and format
        this.logger.log(`\n[STEP 1] 🔍 Validating marketing angle and format...`);
        const angle = MARKETING_ANGLES.find((a) => a.id === dto.marketing_angle_id);
        if (!angle) {
            this.logger.error(`❌ Invalid marketing angle: ${dto.marketing_angle_id}`);
            throw new BadRequestException(AdGenerationMessage.INVALID_MARKETING_ANGLE);
        }
        this.logger.log(`✅ Marketing angle valid: ${angle.label}`);

        const format = AD_FORMATS.find((f) => f.id === dto.format_id);
        if (!format) {
            this.logger.error(`❌ Invalid ad format: ${dto.format_id}`);
            throw new BadRequestException(AdGenerationMessage.INVALID_AD_FORMAT);
        }
        this.logger.log(`✅ Ad format valid: ${format.label} (${format.ratio})`);

        // Step 2: Fetch brand and concept (with ownership checks)
        this.logger.log(`\n[STEP 2] 📚 Fetching brand and concept from database...`);
        const brand = await this.adBrandsService.findOne(dto.brand_id, userId);
        this.logger.log(`✅ Brand fetched: "${brand.name}" (ID: ${brand.id})`);

        const concept = await this.adConceptsService.findOne(dto.concept_id, userId);
        this.logger.log(`✅ Concept fetched: "${concept.name || 'Unnamed'}" (ID: ${concept.id})`);

        // Step 3: Get playbook (use default if not set)
        this.logger.log(`\n[STEP 3] 📖 Getting brand playbook...`);
        const playbook = brand.brand_playbook || {
            tone_of_voice: {
                style: 'Professional',
                keywords: ['quality', 'trust', 'innovation'],
                donts: [],
            },
            colors: {
                primary: '#000000',
                secondary: '#FFFFFF',
                accent: '#FF5733',
            },
            fonts: {
                heading: 'Inter',
                body: 'Inter',
            },
        };
        this.logger.log(`✅ Using ${brand.brand_playbook ? 'CUSTOM' : 'DEFAULT'} playbook`);

        // Step 3.5: Auto-fetch product data by brand name
        this.logger.log(`\n[STEP 3.5] 📦 Fetching product data for brand "${brand.name}"...`);
        const productData = this.getProductByBrand(brand.name);
        this.logger.log(`✅ Product: "${productData.product_name}" (${productData.key_features.length} features)`);

        // Step 4: Create generation record (STATUS: PROCESSING)
        this.logger.log(`\n[STEP 4] 💾 Creating generation record...`);
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
        this.logger.log(`✅ Generation record created: ${generationId}`);

        // Step 5: Build prompt for text generation
        this.logger.log(`\n[STEP 5] 📝 Building text generation prompt...`);
        const userPrompt = this.buildUserPrompt(
            brand.name,
            playbook,
            concept.analysis_json,
            angle,
            format,
            productData,
        );
        this.logger.log(`✅ Prompt built (${userPrompt.length} chars)`);

        // Step 6: Call Gemini for Ad Copy (TEXT)
        this.logger.log(`\n[STEP 6] 🤖 Calling GEMINI for text generation (ad copy)...`);
        await this.generationsRepository.update(generationId, { progress: 30 });

        let adCopy: AdCopyResult;
        try {
            adCopy = await this.callGeminiForAdCopy(userPrompt);
            this.logger.log(`✅ GEMINI TEXT GENERATION COMPLETED`);
            this.logger.log(`   📌 Headline: "${adCopy.headline}"`);
            this.logger.log(`   📌 Subheadline: "${adCopy.subheadline}"`);
            this.logger.log(`   📌 CTA: "${adCopy.cta}"`);
            this.logger.log(`   📌 Image Prompt (${adCopy.image_prompt.length} chars): ${adCopy.image_prompt.substring(0, 150)}...`);
        } catch (error) {
            this.logger.error(`❌ Gemini text generation failed: ${error instanceof Error ? error.message : String(error)}`);
            await this.generationsRepository.update(generationId, {
                status: AdGenerationStatus.FAILED,
                failure_reason: error instanceof Error ? error.message : String(error),
            });
            throw new InternalServerErrorException(AdGenerationMessage.AI_GENERATION_FAILED);
        }

        // Step 7: Build GUARDED image prompt (5-layer guardrails) + Call Gemini
        this.logger.log(`\n[STEP 7] 🛡️ Building guarded image prompt with 5-layer guardrails...`);
        await this.generationsRepository.update(generationId, { progress: 50 });

        const guardedImagePrompt = this.buildGuardedImagePrompt(
            adCopy.image_prompt,
            dto.marketing_angle_id,
        );

        const aspectRatio = FORMAT_RATIO_MAP[dto.format_id] || '1:1';
        this.logger.log(`   📌 Aspect Ratio: ${aspectRatio}`);
        this.logger.log(`   📌 Raw image_prompt: ${adCopy.image_prompt.length} chars`);
        this.logger.log(`   📌 Guarded image_prompt: ${guardedImagePrompt.length} chars`);
        this.logger.log(`   📌 Sending GUARDED image_prompt to Gemini Image Generation...`);

        let generatedImageBase64: string | null = null;
        let generatedImageUrl: string | null = null;
        let imageMimeType = 'image/png';

        try {
            const imageResult = await this.geminiService.generateImage(
                guardedImagePrompt,
                undefined,
                aspectRatio,
            );

            generatedImageBase64 = imageResult.data;
            imageMimeType = imageResult.mimeType || 'image/png';
            this.logger.log(`✅ GEMINI IMAGE GENERATION COMPLETED`);
            this.logger.log(`   📌 MimeType: ${imageMimeType}`);
            this.logger.log(`   📌 Size: ${(generatedImageBase64.length / 1024).toFixed(1)} KB (base64)`);

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

            this.logger.log(`✅ Image saved to disk: ${filePath}`);
            this.logger.log(`   📌 URL: ${generatedImageUrl}`);

        } catch (error) {
            this.logger.error(`❌ Gemini image generation failed: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.warn(`⚠️ Continuing without image - ad copy will still be saved.`);
        }

        // Step 8: Save everything to database
        this.logger.log(`\n[STEP 8] 💾 Saving results to database...`);

        const resultImages = generatedImageUrl ? [
            {
                id: uuidv4(),
                url: generatedImageUrl,
                base64: generatedImageBase64, // Include base64 for frontend
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

        this.logger.log(`✅ Results saved to DB`);
        this.logger.log(`   📌 Ad Copy: SAVED`);
        this.logger.log(`   📌 Result Images: ${resultImages.length} image(s)`);

        // Step 9: Fetch and return updated generation
        this.logger.log(`\n[STEP 9] 📤 Fetching updated generation record...`);
        const updatedGeneration = await this.generationsRepository.findOne({
            where: { id: generationId },
        });

        if (!updatedGeneration) {
            throw new InternalServerErrorException('Failed to fetch updated generation');
        }

        this.logger.log(`═══════════════════════════════════════════════════════════`);
        this.logger.log(`🎉 AD GENERATION COMPLETE`);
        this.logger.log(`   📌 Generation ID: ${updatedGeneration.id}`);
        this.logger.log(`   📌 Status: ${updatedGeneration.status}`);
        this.logger.log(`   📌 Result Images: ${updatedGeneration.result_images?.length || 0}`);
        this.logger.log(`═══════════════════════════════════════════════════════════\n`);

        return { generation: updatedGeneration, ad_copy: adCopy };
    }

    // ═══════════════════════════════════════════════════════════
    // GET PRODUCT BY BRAND (P0 MVP - Hardcoded lookup)
    // ═══════════════════════════════════════════════════════════

    /**
     * Returns the Product JSON for a given brand name.
     * P0 MVP: Uses hardcoded map. Future: DB lookup from Phase 1 data.
     */
    private getProductByBrand(brandName: string): ProductData {
        // Normalize brand name for lookup (lowercase, trimmed)
        const normalized = brandName.toLowerCase().trim();

        // Check hardcoded map
        if (BRAND_PRODUCT_MAP[normalized]) {
            this.logger.log(`📦 Found hardcoded product for brand: "${brandName}"`);
            return BRAND_PRODUCT_MAP[normalized];
        }

        // Default fallback for unknown brands
        this.logger.warn(`⚠️ No product data found for brand "${brandName}" - using generic fallback`);
        return {
            product_name: `${brandName} Product`,
            colors: { primary: '#000000', accent: '#FFFFFF' },
            key_features: ['Premium quality', 'Modern design', 'Best in class'],
            visual_description: `A premium product by ${brandName} with modern design and high-quality materials.`,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // RENDER AD IMAGE (Legacy - for re-rendering)
    // ═══════════════════════════════════════════════════════════

    async renderAdImage(id: string, userId: string): Promise<AdGeneration> {
        this.logger.log(`🔄 Re-rendering image for generation ${id}`);

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
            this.logger.log(`📤 Calling Gemini API for image (ratio: ${aspectRatio})...`);
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

            this.logger.log(`✅ Image saved: ${filePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

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

            this.logger.log(`✅ Image render completed: ${generation.id}`);
            return generation;
        } catch (error) {
            generation.status = AdGenerationStatus.FAILED;
            generation.failure_reason = error instanceof Error ? error.message : String(error);
            await this.generationsRepository.save(generation);

            this.logger.error(`❌ Image render failed: ${error instanceof Error ? error.message : String(error)}`);
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
    // GEMINI TEXT GENERATION (Ad Copy)
    // ═══════════════════════════════════════════════════════════

    private async callGeminiForAdCopy(userPrompt: string): Promise<AdCopyResult> {
        this.logger.log(`📤 Sending prompt to Gemini for ad copy generation...`);

        const fullPrompt = `${AD_GENERATION_SYSTEM_PROMPT}

${userPrompt}`;

        try {
            // Use Gemini's text generation via the internal analyzeDAReference-style call
            // We'll call the generateContent directly for text-only response
            const client = (this.geminiService as any).getClient();

            const response = await client.models.generateContent({
                model: 'gemini-2.0-flash', // Use fast text model
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

            this.logger.log(`📥 Gemini response received (${textResponse.length} chars)`);

            return this.parseAndValidateAdCopy(textResponse);

        } catch (error) {
            this.logger.error(`❌ Gemini API call failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // JSON PARSING & VALIDATION
    // ═══════════════════════════════════════════════════════════

    private parseAndValidateAdCopy(responseText: string): AdCopyResult {
        // Strip markdown code fences if wrapped
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
            // Try to extract JSON from text
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

        // Validate required keys
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
    // GUARDED IMAGE PROMPT BUILDER (5-Layer Guardrails)
    // ═══════════════════════════════════════════════════════════

    /**
     * Wraps the AI-generated image_prompt with strict guardrail layers
     * before sending to Gemini image generation.
     *
     * Pipeline: AI text → raw image_prompt → buildGuardedImagePrompt() → Gemini Image Gen
     *
     * @param rawImagePrompt - The AI-generated image prompt from ad copy
     * @param angleId - The marketing angle ID for scene-specific logic
     * @returns Fully guarded image prompt string
     */
    private buildGuardedImagePrompt(rawImagePrompt: string, angleId: string): string {
        // Layer 4: Get angle-specific scene description
        const sceneDirective = ANGLE_SCENE_MAP[angleId] || '';

        const guardedPrompt = `You are generating a photorealistic advertisement image. Follow ALL rules below with absolute precision.

${PRODUCT_LOCK}

${PERSONA_LOCK}

${READABILITY_LOCK}

${sceneDirective ? `[SCENE DIRECTIVE — ${angleId.toUpperCase()}]\n${sceneDirective}` : ''}

[CREATIVE DIRECTION FROM AI COPYWRITER]
${rawImagePrompt}

${NEGATIVE_PROMPT}

FINAL INSTRUCTION: Generate a single, high-quality, photorealistic advertisement image that follows EVERY guardrail above. The product MUST match the Product Lock description exactly. If a human model is shown, follow the Persona Lock exactly. Ensure text overlay zones have proper contrast per the Readability Lock.`;

        this.logger.log(`🛡️ Guarded image prompt built (${guardedPrompt.length} chars)`);
        this.logger.log(`   📌 Layers applied: Product Lock, Persona Lock, Readability Lock, Scene (${angleId}), Negative Prompt`);

        return guardedPrompt;
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDER
    // ═══════════════════════════════════════════════════════════

    private buildUserPrompt(
        brandName: string,
        playbook: any,
        conceptAnalysis: any,
        angle: { id: string; label: string; description: string },
        format: { id: string; label: string; ratio: string; dimensions: string },
        product: ProductData,
    ): string {
        const zones = conceptAnalysis?.layout?.zones || [];
        const zonesJson = JSON.stringify(zones, null, 2);

        // Support both old flat visual_style and new nested background
        const background = conceptAnalysis?.visual_style?.background;
        const backgroundInfo = background && typeof background === 'object'
            ? `${background.type || 'N/A'} (${background.hex || 'N/A'})`
            : conceptAnalysis?.visual_style?.background_hex || 'N/A';
        const overlayInfo = conceptAnalysis?.visual_style?.overlay || 'none';

        // Content pattern info (from new Visual DNA schema)
        const contentPattern = conceptAnalysis?.content_pattern;
        const contentPatternSection = contentPattern
            ? `\n=== CONTENT PATTERN (from ad analysis) ===
- Hook Type: ${contentPattern.hook_type || 'N/A'}
- Narrative Structure: ${contentPattern.narrative_structure || 'N/A'}
- CTA Style: ${contentPattern.cta_style || 'N/A'}
- Requires Product Image: ${contentPattern.requires_product_image ? 'Yes' : 'No'}`
            : '';

        return `You are a professional copywriter for the brand "${brandName}".

=== BRAND IDENTITY ===
- Tone Style: ${playbook.tone_of_voice?.style || 'Professional'}
- Tone Keywords: ${playbook.tone_of_voice?.keywords?.join(', ') || 'N/A'}
- Words to Avoid: ${playbook.tone_of_voice?.donts?.join(', ') || 'N/A'}
- Primary Color: ${playbook.colors?.primary || 'N/A'}
- Secondary Color: ${playbook.colors?.secondary || 'N/A'}
- Accent Color: ${playbook.colors?.accent || 'N/A'}
- Heading Font: ${playbook.fonts?.heading || 'N/A'}
- Body Font: ${playbook.fonts?.body || 'N/A'}

=== LAYOUT STRUCTURE (from competitor ad analysis) ===
- Layout Type: ${conceptAnalysis?.layout?.type || 'N/A'}
- Visual Mood: ${conceptAnalysis?.visual_style?.mood || 'N/A'}
- Background: ${backgroundInfo}
- Overlay: ${overlayInfo}
- Zones:
${zonesJson}
${contentPatternSection}

=== MARKETING ANGLE ===
- Strategy: ${angle.label}
- Apply this approach: ${angle.description}

=== AD FORMAT ===
- Format: ${format.label} (${format.ratio}, ${format.dimensions})

=== PRODUCT INFO ===
- Product Name: ${product.product_name}
- Colors: ${JSON.stringify(product.colors)}
- Key Features: ${product.key_features.join(', ')}
- Visual Description: ${product.visual_description}

=== YOUR TASK ===
Generate ad copy for the "${product.product_name}" using the "${angle.label}" marketing angle.
The ad must follow the layout structure zones above and match the brand's tone of voice.

IMPORTANT — image_prompt rules:
1. Describe the SCENE and COMPOSITION — do NOT repeat product specs (those are injected separately via guardrails)
2. Focus on: camera angle, lighting direction, color grading, mood, background environment, model pose (if applicable), and overall art direction
3. Mention where the product should be placed in the frame (center, left-third, etc.)
4. Describe the emotional atmosphere and visual storytelling
5. Do NOT include text, watermarks, or logos in the image description
6. Optimize composition for ${format.label} format (${format.ratio}, ${format.dimensions})

Return ONLY this JSON object (no markdown, no explanation):

{
  "headline": "A short, punchy headline (max 8 words) that fits the text zone",
  "subheadline": "A benefit-driven supporting statement (max 20 words)",
  "cta": "An action-oriented call-to-action button text (2-5 words)",
  "image_prompt": "A detailed scene and composition description for the ${angle.label} angle. Focus on camera angle, lighting, mood, environment, model pose, and product placement. Do NOT repeat product physical specs."
}`;
    }
}
