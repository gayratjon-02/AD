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

        // Step 7: Call Gemini for Image Generation
        this.logger.log(`\n[STEP 7] 🎨 Calling GEMINI for image generation...`);
        await this.generationsRepository.update(generationId, { progress: 50 });

        const aspectRatio = FORMAT_RATIO_MAP[dto.format_id] || '1:1';
        this.logger.log(`   📌 Aspect Ratio: ${aspectRatio}`);
        this.logger.log(`   📌 Sending image_prompt to Gemini Image Generation...`);

        let generatedImageBase64: string | null = null;
        let generatedImageUrl: string | null = null;
        let imageMimeType = 'image/png';

        try {
            const imageResult = await this.geminiService.generateImage(
                adCopy.image_prompt,
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

Return ONLY this JSON object (no markdown, no explanation):

{
  "headline": "A short, punchy headline (max 8 words) that fits the text zone",
  "subheadline": "A benefit-driven supporting statement (max 20 words)",
  "cta": "An action-oriented call-to-action button text (2-5 words)",
  "image_prompt": "A highly detailed image generation prompt describing: composition, the ${product.product_name} with its specific colors and features, lighting, color palette (using brand colors), mood, background, and style. Must be optimized for ${format.label} format (${format.ratio}, ${format.dimensions})."
}`;
    }
}
