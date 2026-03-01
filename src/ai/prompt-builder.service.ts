import { Injectable, Logger } from '@nestjs/common';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze/analyze-product-direct.dto';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze/analyze-da-preset.dto';
import { DAPreset, DAPresetConfig } from '../database/entities/Product-Visuals/da-preset.entity';
import { Product } from '../database/entities/Product-Visuals/product.entity';
import { ShotOptions, createDefaultShotOptions } from '../common/interfaces/shot-options.interface';
import {
    MergedPrompts,
    MergedPromptObject,
    PromptCamera,
    PromptBackground,
    ProductDetailsInPrompt,
    DAElementsInPrompt,
} from '../common/interfaces/merged-prompts.interface';

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface MergeInput {
    product: AnalyzeProductDirectResponse;
    da: AnalyzeDAPresetResponse;
    options: {
        /** @deprecated Use shot_options instead */
        model_type?: 'adult' | 'kid';
        /** NEW: Per-shot control options */
        shot_options?: ShotOptions;
        /** Resolution for prompt quality suffix: "4K" | "2K" */
        resolution?: string;
        /** Aspect ratio for output images: "4:5" | "1:1" | "9:16" | "16:9" */
        aspect_ratio?: string;
    };
}

/**
 * Input for building prompts from DB entities directly
 */
interface EntityMergeInput {
    product: Product;
    daPreset: DAPreset;
    /** @deprecated Use shotOptions instead */
    modelType?: 'adult' | 'kid';
    /** NEW: Per-shot control options */
    shotOptions?: ShotOptions;
    /** Resolution for prompt quality suffix: "4K" | "2K" */
    resolution?: string;
}

/**
 * Shot type configuration with camera settings
 */
interface ShotTypeConfig {
    type: string;
    display_name: string;
    camera: PromptCamera;
}

/**
 * Full output matching client specification MergedPrompts interface
 */
export interface GeneratedPrompts {
    visual_id: string;
    prompts: MergedPrompts;
    negative_prompt: string;
}

// ═══════════════════════════════════════════════════════════
// SHOT TYPE CONFIGURATIONS (Camera Settings per Shot)
// ═══════════════════════════════════════════════════════════

const SHOT_CONFIGS: Record<string, ShotTypeConfig> = {
    duo: {
        type: 'duo',
        display_name: 'DUO (Two Models)',
        camera: {
            focal_length_mm: 85,
            aperture: 2.8,
            focus: 'subjects',
            angle: 'eye-level',
        },
    },
    solo: {
        type: 'solo',
        display_name: 'SOLO Model',
        camera: {
            focal_length_mm: 85,
            aperture: 2.0,
            focus: 'subject',
            angle: 'eye-level',
        },
    },
    flatlay_front: {
        type: 'flatlay_front',
        display_name: 'Flat Lay Front',
        camera: {
            focal_length_mm: 50,
            aperture: 8.0,
            focus: 'entire garment',
            angle: 'overhead 90°',
        },
    },
    flatlay_back: {
        type: 'flatlay_back',
        display_name: 'Flat Lay Back',
        camera: {
            focal_length_mm: 50,
            aperture: 8.0,
            focus: 'entire garment',
            angle: 'overhead 90°',
        },
    },
    closeup_front: {
        type: 'closeup_front',
        display_name: 'Close-Up Front Detail',
        camera: {
            focal_length_mm: 100,
            aperture: 4.0,
            focus: 'logo/texture detail',
            angle: 'macro',
        },
    },
    closeup_back: {
        type: 'closeup_back',
        display_name: 'Close-Up Back Detail',
        camera: {
            focal_length_mm: 100,
            aperture: 4.0,
            focus: 'patch/branding detail',
            angle: 'macro',
        },
    },
};

// ═══════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════

@Injectable()
export class PromptBuilderService {
    private readonly logger = new Logger(PromptBuilderService.name);

    /**
     * 🆕 Build prompts from DB entities directly (Phase 3)
     * This is the main method for the new workflow
     * Supports both legacy modelType and new shotOptions
     */
    buildPromptsFromEntities(input: EntityMergeInput): GeneratedPrompts {
        const { product, daPreset, modelType, shotOptions } = input;

        this.logger.log(`🏗️ Building prompts from entities: Product=${product.name}, DA=${daPreset.name}`);

        // Get product JSON (final or analyzed)
        const productJson = (product.final_product_json || product.analyzed_product_json) as AnalyzeProductDirectResponse;
        if (!productJson) {
            throw new Error('Product must be analyzed first (no product JSON found)');
        }

        // Convert DAPreset entity to config format
        const daConfig = daPreset.toPresetConfig();

        // Build DA response format from config
        const da: AnalyzeDAPresetResponse = {
            da_name: daConfig.da_name,
            background: daConfig.background,
            floor: daConfig.floor,
            // V2: Convert legacy props to ground structure
            ground: {
                left_items: (daConfig.props?.left_side || []).map((name: string) => ({
                    name,
                    surface: 'on_floor',
                    height_level: 'middle',
                    color: 'N/A',
                    material: 'N/A',
                })),
                right_items: (daConfig.props?.right_side || []).map((name: string) => ({
                    name,
                    surface: 'on_floor',
                    height_level: 'middle',
                    color: 'N/A',
                    material: 'N/A',
                })),
            },
            // V2: adult/kid styling
            styling: {
                adult_bottom: daConfig.styling.pants,
                adult_feet: daConfig.styling.footwear,
                pants: daConfig.styling.pants,
                footwear: daConfig.styling.footwear,
            },
            lighting: daConfig.lighting,
            mood: daConfig.mood,
            quality: daConfig.quality,
        };

        // Use the standard buildPrompts method with shotOptions OR legacy modelType
        return this.buildPrompts({
            product: productJson,
            da,
            options: {
                model_type: modelType,
                shot_options: shotOptions,
                resolution: input.resolution,
            },
        });
    }

    /**
     * Original method - Build prompts from DTO interfaces
     * Returns full MergedPrompts format with camera, background, product_details, da_elements
     */
    buildPrompts(input: MergeInput): GeneratedPrompts {
        this.logger.log(`🏗️ Building prompts for product: ${input.product.general_info.product_name} with DA: ${input.da.da_name}`);

        const { product, da, options } = input;
        const visualId = crypto.randomUUID();

        // ═══════════════════════════════════════════════════════════
        // 1. HALLUCINATION CHECKS & DATA PREP
        // ═══════════════════════════════════════════════════════════

        const zipperText = this.checkZipperRule(product);
        const logoTextFront = this.checkLogoRule(
            product.design_front.has_logo,
            product.design_front.logo_text,
            product.design_front.logo_type,
            product.design_front.font_family,
            product.design_front.size_relative_pct
        );

        // ═══════════════════════════════════════════════════════════
        // 2. BRAND GUARDIAN RULES
        // ═══════════════════════════════════════════════════════════

        // 🆕 SMART FOOTWEAR: Match footwear to product category (no more barefoot forcing)
        const footwear = this.applySmartFootwearMatching(da.styling.footwear, product.general_info.category);

        // PANTS RULE: Default to Black chino pants if not specified
        const pants = this.applyPantsRule(da.styling.pants);

        // CATEGORY DETECTION: Check if product is a bottom garment
        const isProductBottom = this.isBottomGarment(product.general_info.category);

        // ═══════════════════════════════════════════════════════════
        // 3. COMMON PROMPT FRAGMENTS (quality = lighting only; resolution appended at END)
        // Resolution keywords are force-appended at the very end of each prompt (see step 6).
        // ═══════════════════════════════════════════════════════════

        const resolution = (options.resolution && String(options.resolution).trim().toUpperCase()) || '4K';
        const resolutionSuffix = this.getResolutionQualitySuffix(resolution);
        this.logger.log(`📐 Resolution for prompts: "${resolution}" → force-append suffix (${resolutionSuffix.length} chars)`);

        // 📸 DYNAMIC CAMERA/LIGHTING: Per-shot camera and lighting descriptions
        const duoCameraLighting = this.buildShotCameraLighting('duo', da);
        const soloCameraLighting = this.buildShotCameraLighting('solo', da);
        const flatlayFrontCameraLighting = this.buildShotCameraLighting('flatlay_front', da);
        const flatlayBackCameraLighting = this.buildShotCameraLighting('flatlay_back', da);
        const closeupFrontCameraLighting = this.buildShotCameraLighting('closeup_front', da);
        const closeupBackCameraLighting = this.buildShotCameraLighting('closeup_back', da);

        // 🚀 DEFAULT TOP RULE: If product is a Bottom, model must wear a white t-shirt (Anti-Nudity)
        let baseAttire = `Wearing ${product.visual_specs.color_name} ${product.general_info.product_name}`;
        if (isProductBottom) {
            baseAttire = `Wearing a plain white t-shirt on upper body, fully clothed top. ${baseAttire}`;
            this.logger.log(`👕 Anti-Nudity: Product is BOTTOM → Prepending 'White T-Shirt' to positive prompt`);
        }

        // SMART STYLING: If product IS a bottom → only footwear, no DA pants
        // If product is NOT a bottom (top/jacket) → include both pants and footwear
        const styling = isProductBottom
            ? footwear  // Product is pants/shorts → just footwear
            : `Wearing ${pants}, ${footwear}`;  // Product is top → include DA pants + footwear
        // Solo shot: use solo-safe footwear (no "Child"/"father") to avoid Vertex RAI child filter
        const footwearSolo = this.getSoloSafeFootwear(footwear);
        const stylingSolo = isProductBottom
            ? footwearSolo
            : `Wearing ${pants}, ${footwearSolo}`;

        if (isProductBottom) {
            this.logger.log(`👖 Category Detection: Product "${product.general_info.category}" is a BOTTOM → skipping DA pants`);
        }

        // V2: Ground items (handle both legacy props and new ground structure)
        const leftItems = da.ground?.left_items || [];
        const rightItems = da.ground?.right_items || [];
        const leftProps = leftItems.length > 0
            ? leftItems.map((item: any) => typeof item === 'string' ? item : item.name).join(', ')
            : '';
        const rightProps = rightItems.length > 0
            ? rightItems.map((item: any) => typeof item === 'string' ? item : item.name).join(', ')
            : '';

        // Build props instruction: only mention props if DA actually has them
        const hasAnyProps = leftProps || rightProps;
        const propsInstruction = hasAnyProps
            ? `Props: ${leftProps || 'nothing'} on the left, ${rightProps || 'nothing'} on the right.`
            : 'NO PROPS — clean empty space on both sides. Do NOT add any objects, decorations, or elements to the scene.';

        const scene = `SCENE FROM DA REFERENCE: ${da.background.type} wall (${da.background.hex}), ${da.floor.type} floor (${da.floor.hex}). WALL-TO-FLOOR TRANSITION: Replicate the EXACT same smooth transition from the DA reference image — the wall must blend into the floor with NO visible fold, NO crease, NO hard line, NO sharp corner. Copy the DA reference image's infinity cove curve exactly. ${propsInstruction} Lighting: ${da.lighting.type}, ${da.lighting.temperature}. Mood: ${da.mood}. COPY this exact room from the DA reference photo.`;
        const propsText = hasAnyProps ? `${leftProps}, ${rightProps}`.replace(/^, |, $/g, '') : 'none';

        // ═══════════════════════════════════════════════════════════
        // 4. BUILD COMMON OBJECTS FOR MergedPromptObject
        // ═══════════════════════════════════════════════════════════

        const background: PromptBackground = {
            wall: da.background.type,
            floor: da.floor.type,
        };

        const productDetails: ProductDetailsInPrompt = {
            type: product.general_info.category,
            color: product.visual_specs.color_name,
            logos: logoTextFront || undefined,
            zip: zipperText || undefined,
        };

        const daElements: DAElementsInPrompt = {
            background: da.background.type,
            props: propsText,
            mood: da.mood,
        };

        // ═══════════════════════════════════════════════════════════
        // 5. NEGATIVE PROMPT (shared across all shots)
        // ═══════════════════════════════════════════════════════════

        const GLOBAL_NEGATIVE_PROMPT = 'collage, split screen, inset image, picture in picture, multiple views, overlay, montage, composite image, promotional material, text blocks, watermarks, border, frame, padding, white background';
        let negativePrompt = `${GLOBAL_NEGATIVE_PROMPT}, text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers`;

        // 🚀 ANTI-ARTIFACT: Block black corners, dark patches, unwanted overlays
        negativePrompt += ', black corner, dark corner, black patch, black rectangle, black square, black bar, black border, vignette, dark edge, corner artifact, black overlay, UI element, logo overlay, stamp, badge, label, tag, sticker';

        // 🚀 ANTI-NUDITY SHIELD: ALWAYS block shirtless for human model shots (duo, solo)
        negativePrompt += ', shirtless, naked torso, bare chest, bare skin, abs showing, muscles exposed, underwear model, swimwear, skin showing, topless, navel, exposed torso, no shirt';

        // ═══════════════════════════════════════════════════════════
        // 6. GENERATE 6 SHOT PROMPTS (MergedPromptObject format)
        // ═══════════════════════════════════════════════════════════

        // 6.1 DUO (Father + Son) — Client requirement: matching outfits on father and son
        // Gemini API allows father/son terminology (no need for Vertex RAI workaround)
        const duoStyling = styling; // Use original styling, no workaround needed for Gemini
        const duoPrompt = this.buildDuoPrompt(product, da, baseAttire, duoStyling, scene, zipperText, duoCameraLighting, isProductBottom);
        const duoFinalPrompt = duoPrompt + resolutionSuffix;
        const duo: MergedPromptObject = {
            visual_id: `visual_1_duo_family`,
            shot_type: 'duo',
            model_type: 'adult',
            gemini_prompt: duoFinalPrompt,
            prompt: duoFinalPrompt, // Backward compat
            negative_prompt: negativePrompt,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: 'DUO (Father + Son)',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: productDetails,
            da_elements: daElements
        } as MergedPromptObject;

        // ═══════════════════════════════════════════════════════════
        // 🆕 SHOT OPTIONS: Derive per-shot settings from options
        // ═══════════════════════════════════════════════════════════
        // If shot_options provided, use per-shot settings
        // Otherwise, fall back to legacy model_type (backward compatible)

        // 🔍 DEBUG: Log raw options received
        this.logger.log(`🔍 DEBUG options.shot_options RAW: ${JSON.stringify(options.shot_options)}`);
        this.logger.log(`🔍 DEBUG options.model_type: ${options.model_type}`);

        const shotOptions = options.shot_options || createDefaultShotOptions(options.model_type || 'adult');

        // 🔍 DEBUG: Log resolved shotOptions
        this.logger.log(`🔍 DEBUG resolved shotOptions: ${JSON.stringify(shotOptions)}`);
        this.logger.log(`🔍 DEBUG shotOptions.solo: ${JSON.stringify(shotOptions.solo)}`);

        // SOLO: Get subject from shot_options.solo.subject
        const soloSubject = shotOptions.solo?.subject || options.model_type || 'adult';
        this.logger.log(`🎯 Prompt Builder Resolved SOLO Subject: "${soloSubject}" (from shotOptions.solo.subject: ${shotOptions.solo?.subject}, fallback model_type: ${options.model_type})`);

        // FLAT LAY: Get size from shot_options.flatlay_front.size / flatlay_back.size
        const flatLayFrontSize = shotOptions.flatlay_front?.size || options.model_type || 'adult';
        const flatLayBackSize = shotOptions.flatlay_back?.size || options.model_type || 'adult';

        this.logger.log(`🎯 Shot Settings: SOLO=${soloSubject}, FlatLayFront=${flatLayFrontSize}, FlatLayBack=${flatLayBackSize}`);

        // 6.2 SOLO (uses soloSubject - can be different from flat lay)
        const soloPrompt = this.buildSoloPrompt(product, da, soloSubject, baseAttire, stylingSolo, scene, zipperText, logoTextFront, soloCameraLighting, isProductBottom);
        const soloFinalPrompt = soloPrompt + resolutionSuffix;

        // 🚀 STRICT NEGATIVE PROMPTING FOR SOLO
        let soloNegative = negativePrompt;
        const TWO_PEOPLE_NEGATIVES = ', two people, two subjects, father and son, parent, family, group, couple, second person, crowd, background people, multiple people, holding hands, looking at each other, double body, twin, clone';

        if (soloSubject === 'kid') {
            // For KID solo: Block adults/fathers AND second person
            soloNegative += `${TWO_PEOPLE_NEGATIVES}, adult, man, father, male model, beard, stubble, mustache, facial hair, mature man, wrinkles, tall, muscular, hairy chest`;
        } else {
            // For ADULT solo: Block kids AND second person
            soloNegative += `${TWO_PEOPLE_NEGATIVES}, child, kid, toddler, baby, small size, son, daughter`;
        }

        const solo: MergedPromptObject = {
            visual_id: `visual_2_solo_${soloSubject}`,
            shot_type: 'solo',
            model_type: soloSubject,
            gemini_prompt: soloFinalPrompt,
            prompt: soloFinalPrompt, // Backward compat
            negative_prompt: soloNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: soloSubject === 'adult' ? 'SOLO Adult Model' : 'SOLO Kid Model',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: productDetails,
            da_elements: daElements
        } as MergedPromptObject;

        // 6.3 FLAT LAY FRONT — FORCE: resolution suffix at very end
        const flatLayFrontPrompt = this.buildFlatLayFrontPrompt(product, da, flatLayFrontSize, logoTextFront, flatlayFrontCameraLighting);
        const flatLayFrontFinal = flatLayFrontPrompt + resolutionSuffix;
        const flatLayFrontNegative = this.buildShotNegativePrompt('flatlay_front', product);
        const flatlay_front: MergedPromptObject = {
            visual_id: `visual_3_flatlay_front_${flatLayFrontSize}`,
            shot_type: 'flatlay_front',
            model_type: flatLayFrontSize,
            gemini_prompt: flatLayFrontFinal,
            prompt: flatLayFrontFinal, // Backward compat
            negative_prompt: flatLayFrontNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: flatLayFrontSize === 'adult' ? 'Flat Lay Front (Adult Size)' : 'Flat Lay Front (Kid Size)',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: {
                ...productDetails,
                size: flatLayFrontSize === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements
        } as MergedPromptObject;

        // 6.4 FLAT LAY BACK — FORCE: resolution suffix at very end
        const flatLayBackPrompt = this.buildFlatLayBackPrompt(product, da, flatLayBackSize, flatlayBackCameraLighting);
        const flatLayBackFinal = flatLayBackPrompt + resolutionSuffix;
        const flatLayBackNegative = this.buildShotNegativePrompt('flatlay_back', product);
        const flatlay_back: MergedPromptObject = {
            visual_id: `visual_4_flatlay_back_${flatLayBackSize}`,
            shot_type: 'flatlay_back',
            model_type: flatLayBackSize,
            gemini_prompt: flatLayBackFinal,
            prompt: flatLayBackFinal, // Backward compat
            negative_prompt: flatLayBackNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: flatLayBackSize === 'adult' ? 'Flat Lay Back (Adult Size)' : 'Flat Lay Back (Kid Size)',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: {
                ...productDetails,
                size: flatLayBackSize === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements
        } as MergedPromptObject;

        // 6.5 CLOSE UP FRONT — Model wearing garment, focus on front details (DA compliant)
        const closeUpFrontPrompt = this.buildCloseUpFrontPrompt(product, da, closeupFrontCameraLighting);
        const closeUpFrontFinal = closeUpFrontPrompt + resolutionSuffix;
        // Closeup shows model wearing - allow partial body but no full face
        const closeUpFrontNegative = this.buildShotNegativePrompt('closeup_front', product) + ', full body shot, wide shot, distance shot, full face visible';
        const closeup_front: MergedPromptObject = {
            visual_id: `visual_5_closeup_front_product`,
            shot_type: 'closeup_front',
            model_type: 'product',
            gemini_prompt: closeUpFrontFinal,
            prompt: closeUpFrontFinal, // Backward compat
            negative_prompt: closeUpFrontNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: 'Close Up Front',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: productDetails,
            da_elements: daElements
        } as MergedPromptObject;

        // 6.6 CLOSE UP BACK — Product-only macro of back details (patch, yoke, fabric)
        const closeUpBackPrompt = this.buildCloseUpBackPrompt(product, da, closeupBackCameraLighting);
        const closeUpBackFinal = closeUpBackPrompt + resolutionSuffix;
        // Product-only macro — block humans and wide shots
        let closeUpBackNegative = this.buildShotNegativePrompt('closeup_back', product) + ', full body shot, wide shot, distance shot';

        // 🚀 ANTI-ROUND SHIELD: If patch is square/rectangular, blocking round shapes
        const patchDetail = product.design_back?.patch_detail || '';
        const backDesc = product.design_back?.description || '';
        const backText = (patchDetail + ' ' + backDesc).toLowerCase();

        if (backText.includes('square') || backText.includes('rectang')) {
            closeUpBackNegative += ', circular patch, round patch, oval patch, curved edges, rounded corners, sphere shaped patch';
        }

        const closeup_back: MergedPromptObject = {
            visual_id: `visual_6_closeup_back_product`,
            shot_type: 'closeup_back',
            model_type: 'product',
            gemini_prompt: closeUpBackFinal,
            prompt: closeUpBackFinal, // Backward compat
            negative_prompt: closeUpBackNegative,
            output: {
                resolution: resolution,
                aspect_ratio: options['aspect_ratio'] || '4:5' // Default to 4:5 if not passed
            },
            // Legacy/Helper fields
            camera: undefined, // Cleared to reduce noise
            background: background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            display_name: 'Close Up Back',
            last_edited_at: null,
        };

        // BACKFILLING OTHER OBJECTS WITH NEW STRUCTURE
        // DUO
        // The `duo` object is already defined above, no need for `duo_final`
        // SOLO
        // The `solo` object is already defined above, no need for `solo_final`
        // FLAT LAY FRONT
        // The `flatlay_front` object is already defined above, no need for `flatlay_front_final`
        // FLAT LAY BACK
        // The `flatlay_back` object is already defined above, no need for `flatlay_back_final`
        // CLOSE UP FRONT
        // The `closeup_front` object is already defined above, no need for `closeup_front_final`

        return {
            visual_id: visualId,
            prompts: {
                duo,
                solo,
                flatlay_front,
                flatlay_back,
                closeup_front,
                closeup_back,
            },
            negative_prompt: negativePrompt,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // BRAND GUARDIAN RULES
    // ═══════════════════════════════════════════════════════════

    /**
     * 🆕 SMART FOOTWEAR MATCHING
     * 
     * Assigns stylish footwear based on product category instead of forcing barefoot.
     * Models should always wear appropriate shoes matching the outfit style.
     * 
     * @param daFootwear - Footwear from DA preset (may be null/empty)
     * @param productCategory - Product category (e.g., 'Joggers', 'Jacket')
     * @returns Appropriate footwear string
     */
    private applySmartFootwearMatching(daFootwear: string, productCategory: string): string {
        const category = (productCategory || '').toLowerCase();
        const existingFootwear = (daFootwear || '').toLowerCase().trim();

        // If DA has specific footwear (not barefoot or empty), use it
        if (existingFootwear && existingFootwear !== 'barefoot' && existingFootwear !== '') {
            this.logger.log(`👟 Smart Footwear: Using DA footwear → "${daFootwear}"`);
            return daFootwear;
        }

        // 🏃 SPORTY/ATHLETIC Categories → Clean white sneakers
        const sportyKeywords = ['sweatpant', 'jogger', 'tracksuit', 'track pant', 'athletic', 'sport', 'hoodie'];
        if (sportyKeywords.some(keyword => category.includes(keyword))) {
            const footwear = 'Clean white premium leather sneakers';
            this.logger.log(`👟 Smart Footwear: Sporty category "${productCategory}" → "${footwear}"`);
            return footwear;
        }

        // 🧥 OUTERWEAR/FORMAL Categories → Stylish boots
        const outerwearKeywords = ['jacket', 'coat', 'outerwear', 'blazer', 'parka', 'bomber', 'trucker', 'leather'];
        if (outerwearKeywords.some(keyword => category.includes(keyword))) {
            const footwear = 'Stylish leather Chelsea boots in matching tones';
            this.logger.log(`👟 Smart Footwear: Outerwear category "${productCategory}" → "${footwear}"`);
            return footwear;
        }

        // 👖 CASUAL PANTS Categories → Casual sneakers
        const casualPantsKeywords = ['chino', 'trouser', 'pant', 'jean', 'denim'];
        if (casualPantsKeywords.some(keyword => category.includes(keyword))) {
            const footwear = 'Minimalist white leather sneakers';
            this.logger.log(`👟 Smart Footwear: Casual pants "${productCategory}" → "${footwear}"`);
            return footwear;
        }

        // 👕 DEFAULT: Fashionable footwear for any other category
        const defaultFootwear = 'Fashionable footwear matching the outfit style';
        this.logger.log(`👟 Smart Footwear: Default for "${productCategory}" → "${defaultFootwear}"`);
        return defaultFootwear;
    }

    /**
     * Solo-safe footwear: Vertex RAI blocks prompts that mention "Child" or "father" even for solo shots.
     * When DA footwear is duo-style (e.g. "Child in white sneakers, father in black leather dress shoes"),
     * return a single-adult phrasing so solo prompts pass safety.
     */
    private getSoloSafeFootwear(footwear: string): string {
        const lower = (footwear || '').toLowerCase();
        if (lower.includes('child') || lower.includes('father') || lower.includes('son')) {
            // Prefer "black leather dress shoes" for editorial; keep it neutral
            const soloFootwear = 'black leather dress shoes';
            this.logger.log(`👟 Solo-safe footwear: DA had duo phrasing → "${soloFootwear}"`);
            return soloFootwear;
        }
        return footwear;
    }

    /**
     * Duo-safe styling: Vertex RAI blocks prompts that mention "Child", "father", "son" in DUO shots.
     * When DA styling is father/son style (e.g. "Child in white sneakers, father in black leather dress shoes"),
     * rephrase to two-adult wording so the DUO prompt passes safety.
     */
    private getDuoSafeStyling(styling: string): string {
        if (!styling || typeof styling !== 'string') return styling;
        const lower = styling.toLowerCase();
        if (!lower.includes('child') && !lower.includes('father') && !lower.includes('son')) return styling;
        // Rephrase "Child in X, father in Y" → "One model in X, one in Y" (keep footwear detail, remove child/father)
        let out = styling
            .replace(/\bChild\s+in\s+/gi, 'One model in ')
            .replace(/\bfather\s+in\s+/gi, 'one in ')
            .replace(/\bson\s+in\s+/gi, 'one in ');
        this.logger.log(`👟 Duo-safe styling: DA had father/son phrasing → "${out.slice(0, 120)}..."`);
        return out;
    }

    /**
     * Public method to apply resolution keywords to an existing prompt string.
     * Useful for applying resolution settings at generation time.
     */
    applyResolutionKeywords(prompt: string, resolution: string): string {
        const suffix = this.getResolutionQualitySuffix(resolution);
        if (!suffix) return prompt;
        // Avoid double applying if already present (basic check)
        if (prompt.includes('8k resolution') && suffix.includes('8k resolution')) return prompt;
        return `${prompt}${suffix}`;
    }

    /**
     * Resolution-based quality suffix — force-appended at the very end of each prompt.
     * 4K -> high-fidelity; else -> standard. Do NOT put aspect ratio in prompt text.
     */
    private getResolutionQualitySuffix(resolution?: string): string {
        const r = (resolution && String(resolution).trim().toUpperCase()) || '4K';
        if (r === '4K') {
            return ', 8k resolution, ultra-sharp focus, highly detailed texture, wallpaper quality, hasselblad x2d photography';
        }
        return ', high quality, professional photography';
    }

    /**
     * PANTS RULE: Default to Black chino pants
     */
    private applyPantsRule(pants: string): string {
        if (!pants || pants.trim() === '') {
            return 'Black chino pants (#1A1A1A)';
        }
        return pants;
    }

    /**
     * CATEGORY DETECTION: Check if product is a bottom garment
     *
     * Bottom garments include: pants, trousers, jeans, joggers, shorts, leggings, skirts, etc.
     * When product IS a bottom, we should NOT add DA's default pants styling
     * to avoid conflicts like "Wearing Track Pants. Wearing Black chino pants..."
     *
     * @param category - Product category from general_info.category
     * @returns true if product is a bottom garment
     */
    private isBottomGarment(category: string): boolean {
        if (!category) return false;

        const normalizedCategory = category.toLowerCase().trim();

        // Keywords that indicate a bottom garment
        const bottomKeywords = [
            'pant',      // pants, track pants, cargo pants
            'trouser',   // trousers
            'jean',      // jeans
            'jogger',    // joggers
            'short',     // shorts
            'leg',       // leggings
            'bottom',    // bottoms
            'skirt',     // skirts
            'chino',     // chinos
            'sweatpant', // sweatpants
            'cargo',     // cargo (if standalone)
        ];

        // Check if category contains any bottom keyword
        const isBottom = bottomKeywords.some(keyword => normalizedCategory.includes(keyword));

        return isBottom;
    }

    // ═══════════════════════════════════════════════════════════
    // HALLUCINATION CHECKS
    // ═══════════════════════════════════════════════════════════

    private checkZipperRule(product: AnalyzeProductDirectResponse): string {
        const bottom = product.garment_details.bottom_termination?.toLowerCase() || '';
        if (bottom.includes('zipper') || bottom.includes('zip')) {
            return ' Straight leg fit, visible ankle zippers.';
        }
        return '';
    }

    private checkLogoRule(hasLogo: boolean, text: string, type: string, fontFamily?: string, sizeRelative?: string): string {
        if (!hasLogo) {
            return '';
        }
        let out = `Visible logo: ${text} (${type})`;
        if (fontFamily) out += `, ${fontFamily} font`;
        if (sizeRelative) out += `. Size: ${sizeRelative}`;
        return out + '.';
    }

    // ═══════════════════════════════════════════════════════════
    // 🎨 COLOR WEIGHTING SYSTEM (Anti-Hallucination for Flat Lay/Closeup)
    // ═══════════════════════════════════════════════════════════

    /**
     * Apply color weighting for product-only shots (no human model)
     * This forces the AI to respect the specific color instead of defaulting
     * 
     * @param colorName - Product color name (e.g., "DEEP BURGUNDY SUEDE")
     * @param shotType - Type of shot (flatlay_front, flatlay_back, closeup_front, closeup_back)
     * @returns Weighted color string like "(DEEP BURGUNDY SUEDE:1.5)"
     */
    private applyColorWeighting(colorName: string, shotType: string): string {
        const productOnlyShots = ['flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];

        if (productOnlyShots.includes(shotType)) {
            // Apply high weight (1.5) to color for product-only shots
            return `(${colorName}:1.5)`;
        }

        return colorName;
    }

    /**
     * Generate material-specific negative prompts to prevent color bias
     * Suede tends to generate as beige/tan by default - we need to block these
     * 
     * @param material - Product material (e.g., "Suede", "Leather")
     * @param actualColor - The actual product color to avoid blocking
     * @returns Additional negative prompt terms
     */
    private getMaterialNegativePrompt(material: string, actualColor: string): string {
        const materialLower = material?.toLowerCase() || '';
        const colorLower = actualColor?.toLowerCase() || '';

        // Check if material is Suede or Nubuck
        if (materialLower.includes('suede') || materialLower.includes('nubuck')) {
            const suedeBiasColors = ['beige', 'tan', 'camel', 'sand', 'khaki', 'cream', 'ivory'];

            // Filter out colors that match the actual product color
            const colorsToBlock = suedeBiasColors.filter(biasColor => {
                // Don't block if actual color contains this bias color
                return !colorLower.includes(biasColor);
            });

            if (colorsToBlock.length > 0) {
                this.logger.log(`🎨 Suede Material Detected → Blocking bias colors: ${colorsToBlock.join(', ')}`);
                return `, ${colorsToBlock.join(', ')} color, wrong color`;
            }
        }

        // Check if material is Leather (tends to look shiny/black)
        if (materialLower.includes('leather') && !colorLower.includes('black')) {
            this.logger.log(`🎨 Leather Material Detected → Blocking black leather bias`);
            return ', black leather, dark leather, shiny leather';
        }

        return '';
    }

    /**
     * Build texture reinforcement string for materials
     * Ensures the AI generates correct material appearance
     * 
     * @param material - Product material
     * @param fabricTexture - Fabric texture from analysis
     * @returns Texture reinforcement phrase
     */
    private getTextureReinforcement(material: string, fabricTexture: string): string {
        const materialLower = material?.toLowerCase() || '';
        const textureLower = fabricTexture?.toLowerCase() || '';

        // Suede: matte, light-absorbing, napped
        if (materialLower.includes('suede') || materialLower.includes('nubuck')) {
            if (!textureLower.includes('matte') && !textureLower.includes('napped')) {
                return 'matte finish, soft napped texture, light-absorbing surface';
            }
        }

        // Velvet: plush, light-absorbing
        if (materialLower.includes('velvet') || materialLower.includes('velour')) {
            return 'plush velvet texture, light-absorbing, soft sheen';
        }

        // Corduroy: vertical ridges
        if (materialLower.includes('corduroy')) {
            return 'vertical corduroy ridges, matte cotton texture';
        }

        return '';
    }

    /**
     * Build shot-specific negative prompt with material bias blocking
     * 
     * @param shotType - Type of shot
     * @param product - Product data
     * @returns Complete negative prompt for this shot
     */
    private buildShotNegativePrompt(shotType: string, product: AnalyzeProductDirectResponse): string {
        // Base negative prompt
        // Base negative prompt - ALWAYS START WITH GLOBAL ANTI-COLLAGE PROTOCOL
        const GLOBAL_NEGATIVE_PROMPT = 'collage, split screen, inset image, picture in picture, multiple views, overlay, montage, composite image, promotional material, text blocks, watermarks, border, frame, padding, white background';

        let negativePrompt = `${GLOBAL_NEGATIVE_PROMPT}, text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers`;

        // ANTI-ARTIFACT: Block black corners, dark patches, unwanted overlays
        negativePrompt += ', black corner, dark corner, black patch, black rectangle, black square, black bar, black border, vignette, dark edge, corner artifact, black overlay, UI element, logo overlay, stamp, badge, label, tag, sticker';

        // Get material from fabric texture (analyze for material keywords)
        const fabricTexture = product.visual_specs.fabric_texture || '';
        const colorName = product.visual_specs.color_name || '';

        // Add material-specific negative prompts for product-only shots
        const productOnlyShots = ['flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
        if (productOnlyShots.includes(shotType)) {
            const materialNegative = this.getMaterialNegativePrompt(fabricTexture, colorName);
            negativePrompt += materialNegative;

            // Also add color consistency blockers
            negativePrompt += ', wrong color, color shift, faded color, washed out';

            // Product-only shots: block multiple items and quality issues
            if (shotType.includes('flatlay') || shotType.includes('closeup')) {
                negativePrompt += ', multiple garments, cluttered, busy background, double logo, duplicate text, blurry details, distorted letters, extra branding, messy stitching, bad focus, ghosting, motion blur';
            }
        }

        return negativePrompt;
    }

    // ═══════════════════════════════════════════════════════════
    // PRODUCT IDENTITY BLOCK (Consistency across all shots)
    // ═══════════════════════════════════════════════════════════

    /**
     * Build a product identity block that describes ALL distinctive design elements.
     * This MUST be included in every shot prompt to ensure consistency.
     * Covers: pocket patches, embossing, monograms, panels, overlays, etc.
     * 
     * 🎯 KEY FIX: Now includes chest pocket pattern details from pockets_array
     * to ensure consistent pocket embossing patterns across ALL shot types.
     */
    private buildProductIdentityBlock(product: AnalyzeProductDirectResponse, includeFront = true, includeBack = false): string {
        const parts: string[] = [];

        if (includeFront) {
            // Front design description (pocket details, panels, overlays)
            if (product.design_front.description) {
                parts.push(product.design_front.description);
            }
            // Micro details (embossing, stitching patterns, monograms)
            if (product.design_front.micro_details) {
                parts.push(`Details: ${product.design_front.micro_details}`);
            }

            // 🎯 NEW: Extract chest pocket with EXACT pattern details for consistent rendering
            const chestPocket = product.garment_details?.pockets_array?.find(
                (p) => p.position?.toLowerCase().includes('chest') ||
                    p.position?.toLowerCase().includes('left') ||
                    p.name?.toLowerCase().includes('chest')
            );

            if (chestPocket) {
                // Build comprehensive pocket description with all details
                const pocketMaterial = chestPocket.material || 'leather';
                const pocketShape = chestPocket.shape || 'square';
                const pocketColor = chestPocket.color || '';
                const pocketSpecialFeatures = chestPocket.special_features || '';

                let pocketDescription = `CHEST POCKET: ${pocketMaterial} ${pocketShape} pocket`;
                if (pocketColor) pocketDescription += ` in ${pocketColor}`;

                // 🎯 CRITICAL: Add embossing/monogram pattern details
                if (pocketSpecialFeatures) {
                    pocketDescription += `. POCKET PATTERN: ${pocketSpecialFeatures}`;
                    this.logger.log(`🎯 ProductIdentity: Adding pocket pattern - ${pocketSpecialFeatures}`);
                }

                parts.push(pocketDescription);
            }
        }

        if (includeBack) {
            if (product.design_back.has_patch && product.design_back.patch_detail) {
                parts.push(`Back: ${product.design_back.patch_detail}`);
            }
            if (product.design_back.technique) {
                parts.push(`Technique: ${product.design_back.technique}`);
            }
        }

        // Construction details
        if (product.garment_details.seam_architecture) {
            parts.push(`Construction: ${product.garment_details.seam_architecture}`);
        }

        const details = parts.filter(Boolean).join('. ');
        if (!details) return '';

        return `${details}. CRITICAL: All pocket patches, embossing patterns, monograms, and design details must EXACTLY match the reference product images. Copy the EXACT pattern from reference - do not invent new patterns.`;
    }

    // ═══════════════════════════════════════════════════════════
    // DYNAMIC CAMERA & LIGHTING PER SHOT TYPE
    // ═══════════════════════════════════════════════════════════

    /**
     * Build shot-specific camera and lighting description.
     * DA defines base lighting mood/temperature, but camera angle,
     * focal length, and lighting direction adapt per shot type.
     */
    private buildShotCameraLighting(
        shotType: string,
        da: AnalyzeDAPresetResponse
    ): string {
        const baseLightTemp = da.lighting?.temperature || 'warm tones';

        switch (shotType) {
            case 'duo':
                return `85mm lens, f/2.8, eye-level angle. ${da.lighting?.type || 'Soft diffused studio lighting'}, ${baseLightTemp}. Full-body framing, two subjects centered. ${da.quality || '8K editorial fashion photography'}`;

            case 'solo':
                return `85mm lens, f/2.0, eye-level angle. ${da.lighting?.type || 'Soft diffused studio lighting'}, ${baseLightTemp}. Full-body framing, single subject centered. ${da.quality || '8K editorial fashion photography'}`;

            case 'flatlay_front':
            case 'flatlay_back':
                return `50mm lens, f/8, front-facing straight-on angle. Even flat lighting with minimal shadows to show garment details clearly, ${baseLightTemp}. ${da.quality || '8K product photography'}`;

            case 'closeup_front':
            case 'closeup_back':
                return `100mm macro lens, f/4, close-range angle. Directional raking light to reveal fabric texture and stitching details, ${baseLightTemp}. Shallow depth of field. ${da.quality || '8K macro product photography'}`;

            default:
                return `${da.lighting?.type || 'Soft diffused studio lighting'}, ${baseLightTemp}. ${da.quality || '8K photography'}`;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDERS (6 Shot Types)
    // ═══════════════════════════════════════════════════════════

    /**
     * DUO PROMPT - Subject-First Architecture
     * 
     * 🎯 CRITICAL: SUBJECT must be FIRST in prompt!
     * Vertex Imagen RAI blocks "father/son" and "younger male" (child inference).
     * Use two-adults-only wording so RAI does not filter.
     */
    private buildDuoPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        cameraLighting: string,
        isProductBottom: boolean = false
    ): string {
        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 1: SUBJECT FIRST (Father + Son — Client Requirement)
        // Now using Gemini API which allows father/son terminology
        // ═══════════════════════════════════════════════════════════
        const clothingRule = isProductBottom
            ? 'BOTH MUST be wearing PLAIN WHITE CREW-NECK T-SHIRTS on upper body — shirts cover entire torso from neck to waist. ZERO bare skin on chest or stomach. NEVER shirtless.'
            : 'BOTH FULLY CLOTHED, NEVER SHIRTLESS.';
        const subjectPart = isProductBottom
            ? `Father and son wearing matching outfits. Adult male in his 30s (athletic build, light stubble beard) with his 5-year-old son. ${clothingRule} Both smiling naturally, relaxed family pose. Fashion editorial. Both looking at camera.`
            : `Father and son wearing matching outfits. Adult male in his 30s (athletic build, light stubble beard) with his 5-year-old son. ${clothingRule} Both smiling naturally, relaxed family pose. Fashion editorial. Both looking at camera.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 2: APPAREL (What they're wearing) - USE baseAttire (includes t-shirt when product is bottom!)
        // ═══════════════════════════════════════════════════════════
        const productIdentity = this.buildProductIdentityBlock(product, true, false);

        const apparelPart = isProductBottom
            ? `Both wearing: Upper body — plain white t-shirt (MANDATORY, NEVER shirtless). Lower body — ${baseAttire}. Fabric: ${product.visual_specs.fabric_texture}. ${productIdentity}. ${zipperText}.`
            : `Both ${baseAttire}. Fabric: ${product.visual_specs.fabric_texture}. ${productIdentity}. ${zipperText}.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 3: ENVIRONMENT (Where) — MUST match DA reference image exactly
        // ═══════════════════════════════════════════════════════════
        const environmentPart = `${styling}. ${scene}.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 4: TECHNICAL (Camera/Quality) — DYNAMIC per shot type
        // ═══════════════════════════════════════════════════════════
        const technicalPart = `${cameraLighting}. Real human skin texture, natural poses. The environment MUST be identical to the DA scene reference image provided. Do NOT add any objects, furniture, or decorations that are not in the DA reference image.`;

        // 🎯 FLOOR/BG ENFORCEMENT: Ultra-strong DA scene matching at START and END
        const floorPrefix = `COPY THE EXACT BACKGROUND AND FLOOR FROM THE DA REFERENCE IMAGE. Wall: ${da.background.type} (${da.background.hex}). Floor: ${da.floor.type} (${da.floor.hex}). The generated image background and floor must be a PIXEL-PERFECT COPY of the DA reference photo. ⚠️ WALL-TO-FLOOR TRANSITION: Look at the DA reference image — the wall-to-floor meeting point is a smooth, gradual curve with NO fold, NO crease, NO hard edge. You MUST replicate this EXACT smooth transition. Do NOT create any visible line, fold, or sharp corner where wall meets floor. This is the #1 quality requirement.`;
        const floorSuffix = `FINAL CHECK — WALL-TO-FLOOR JUNCTION: Compare your generated image against the DA reference (LAST image). The transition where the wall meets the floor MUST be smooth and identical to the DA reference — NO fold, NO crease, NO visible hard line. If the DA reference shows a curved infinity cove, your image must show the SAME curve. Wall=${da.background.type} (${da.background.hex}), Floor=${da.floor.type} (${da.floor.hex}).`;

        return `${floorPrefix} ${subjectPart} ${apparelPart} ${environmentPart} ${technicalPart} ${floorSuffix}`;
    }

    /**
     * SOLO PROMPT - Subject-First Architecture
     * 
     * 🎯 CRITICAL: SUBJECT (KID/ADULT) must be FIRST in prompt!
     * Gemini gives highest weight to early tokens.
     * 
     * Prompt Order:
     * 1. SUBJECT (who) - KID or ADULT description FIRST
     * 2. APPAREL (what) - Product wearing
     * 3. ENVIRONMENT (where) - DA background/props
     * 4. TECHNICAL (how) - Camera/quality
     */
    private buildSoloPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        logoTextFront: string,
        cameraLighting: string,
        isProductBottom: boolean = false
    ): string {
        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 1: SUBJECT FIRST (Most Important!)
        // ═══════════════════════════════════════════════════════════
        let subjectPart = '';
        if (isProductBottom) {
            // Product is pants/shorts → model wears plain white t-shirt on top
            const clothingRule = 'MUST be wearing a PLAIN WHITE CREW-NECK T-SHIRT on upper body — shirt covers entire torso from neck to waist. ZERO bare skin on chest or stomach. NEVER shirtless.';
            if (modelType === 'kid') {
                subjectPart = `KIDS FASHION. Subject: SINGLE 5-YEAR-OLD BOY wearing a plain white t-shirt on upper body and the product on lower body. Small child size. (NO ADULTS, NO OLDER KIDS). ${clothingRule} Playful editorial expression, natural child pose.`;
            } else {
                subjectPart = `Subject: SINGLE ADULT MALE MODEL wearing a plain white t-shirt on upper body and the product on lower body. Age 30s. Full adult size. (NO KIDS). ${clothingRule} Athletic build, confident gaze, light stubble beard.`;
            }
        } else {
            // Product is top/jacket/hoodie → model wears the PRODUCT itself, no white t-shirt
            const clothingRule = 'FULLY CLOTHED. The model is wearing the PRODUCT GARMENT described below.';
            if (modelType === 'kid') {
                subjectPart = `KIDS FASHION. Subject: SINGLE 5-YEAR-OLD BOY wearing the product garment described below. Small child size. (NO ADULTS, NO OLDER KIDS). ${clothingRule} Playful editorial expression, natural child pose.`;
            } else {
                subjectPart = `Subject: SINGLE ADULT MALE MODEL wearing the product garment described below. Age 30s. Full adult size. (NO KIDS). ${clothingRule} Athletic build, confident gaze, light stubble beard.`;
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 2: APPAREL (What they're wearing)
        // ═══════════════════════════════════════════════════════════
        const productIdentity = this.buildProductIdentityBlock(product, true, false);

        const apparelPart = isProductBottom
            ? `Upper body: plain white t-shirt (MANDATORY — model is NEVER shirtless). Lower body: ${baseAttire}. ` +
              `Fabric: ${product.visual_specs.fabric_texture}. ${productIdentity}. ${logoTextFront}. ${zipperText}.`
            : `${baseAttire}. ` +
              `Fabric: ${product.visual_specs.fabric_texture}. ${productIdentity}. ${logoTextFront}. ${zipperText}.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 3: ENVIRONMENT (Where) — MUST match DA reference image exactly
        // ═══════════════════════════════════════════════════════════
        const environmentPart = `${styling}. ${scene}. Standing naturally.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 4: TECHNICAL (Camera/Quality) — DYNAMIC per shot type
        // ═══════════════════════════════════════════════════════════
        const technicalPart = modelType === 'kid'
            ? `${cameraLighting}. Natural child pose. The environment MUST be identical to the DA scene reference image provided.`
            : `${cameraLighting}. Real human skin texture, natural pose. The environment MUST be identical to the DA scene reference image provided.`;

        // 🎯 FLOOR/BG ENFORCEMENT: Ultra-strong DA scene matching at START and END
        const floorPrefix = `COPY THE EXACT BACKGROUND AND FLOOR FROM THE DA REFERENCE IMAGE. Wall: ${da.background.type} (${da.background.hex}). Floor: ${da.floor.type} (${da.floor.hex}). The generated image background and floor must be a PIXEL-PERFECT COPY of the DA reference photo. ⚠️ WALL-TO-FLOOR TRANSITION: Look at the DA reference image — the wall-to-floor meeting point is a smooth, gradual curve with NO fold, NO crease, NO hard edge. You MUST replicate this EXACT smooth transition. Do NOT create any visible line, fold, or sharp corner where wall meets floor. This is the #1 quality requirement.`;
        const floorSuffix = `FINAL CHECK — WALL-TO-FLOOR JUNCTION: Compare your generated image against the DA reference (LAST image). The transition where the wall meets the floor MUST be smooth and identical to the DA reference — NO fold, NO crease, NO visible hard line. If the DA reference shows a curved infinity cove, your image must show the SAME curve. Wall=${da.background.type} (${da.background.hex}), Floor=${da.floor.type} (${da.floor.hex}).`;

        const cleanImageRule = 'CLEAN IMAGE ONLY: The entire image must be a clean photograph with NO black corners, NO dark patches, NO overlays, NO UI elements, NO stamps, NO badges anywhere in the frame. Every pixel must be part of the scene.';

        return `${floorPrefix} ${subjectPart} ${apparelPart} ${environmentPart} ${technicalPart} ${cleanImageRule} ${floorSuffix}`;
    }

    /**
     * FLATLAY FRONT - PRODUCT-ONLY: Garment on hanger, ZERO humans
     *
     * 🎯 CRITICAL FIX: Gemini ignores negative instructions ("NO model").
     * Instead, use ONLY POSITIVE language describing exactly what we want.
     * SHOT DESCRIPTION FIRST — Gemini weights early tokens highest.
     *
     * Adult: "Adult-size garment" / Kid: "Child-size garment"
     * PANTS: Folded over the hanger bar
     * 🎨 COLOR WEIGHTING: Prevents AI defaulting to beige/tan for suede
     */
    private buildFlatLayFrontPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        logoTextFront: string,
        cameraLighting: string
    ): string {
        const sizeDescription = modelType === 'adult'
            ? 'Adult-size'
            : 'Child-size (5-year-old)';

        // 🎨 COLOR WEIGHTING
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'flatlay_front');

        // 🎨 TEXTURE REINFORCEMENT
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        // 👖 PANTS DETECTION
        const productName = product.general_info.product_name?.toLowerCase() || '';
        const isPants = productName.includes('pant') ||
            productName.includes('trouser') ||
            productName.includes('jean') ||
            productName.includes('jogger') ||
            productName.includes('short') ||
            productName.includes('bottom');

        const productIdentity = this.buildProductIdentityBlock(product, true, false);
        const daBackground = da.background?.type || 'elegant studio backdrop';

        // 🎯 SHOT DESCRIPTION FIRST — most important tokens at the beginning
        const shotDescription = isPants
            ? `PRODUCT-ONLY PHOTOGRAPH of a single ${sizeDescription} ${weightedColor} ${product.general_info.product_name} folded neatly over a wooden hanger bar. The hanger hangs from a small metal wall hook against a ${daBackground}. Front view, centered composition. The pants are FLAT and EMPTY — just fabric draped over the hanger with natural folds. Waistband visible at top, legs hanging down.`
            : `PRODUCT-ONLY PHOTOGRAPH of a single ${sizeDescription} ${weightedColor} ${product.general_info.product_name} hanging on a wooden hanger from a small metal wall hook against a ${daBackground}. Front view, centered composition. The garment hangs FLAT and EMPTY with natural drape — sleeves relaxed at sides, fabric falling under its own weight. Full garment visible from collar to hem.`;

        // Product details
        const productData = `Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ${productIdentity}. ${logoTextFront}.`;

        // Environment from DA — WALL ONLY, no floor visible in flatlay shots
        const environmentPart = `Background: ONLY the ${daBackground} wall (${da.background?.hex || '#FFFFFF'}) is visible behind the hanging garment. The entire frame shows ONLY the wall surface — there is NO floor visible in this shot. Mood: ${da.mood || 'editorial elegance'}.`;

        // Quality — dynamic camera/lighting per shot type
        const helpers = `Clean minimalist product display. Pristine garment condition. Single garment only. Still life product photography. Wall-only background, no floor in frame. ${cameraLighting}`;

        return `${shotDescription} ${productData} ${environmentPart} ${helpers}`;
    }

    /**
     * FLATLAY BACK - PRODUCT-ONLY: Garment on hanger showing BACK, ZERO humans
     *
     * 🎯 CRITICAL FIX: Gemini ignores negative instructions ("NO model").
     * Instead, use ONLY POSITIVE language describing exactly what we want.
     * SHOT DESCRIPTION FIRST — Gemini weights early tokens highest.
     *
     * Adult: "Adult-size garment" / Kid: "Child-size garment"
     * PANTS: Folded over the hanger bar showing back
     * 🎨 COLOR WEIGHTING: Prevents AI defaulting to beige/tan for suede
     */
    private buildFlatLayBackPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        cameraLighting: string
    ): string {
        const patchDetail = product.design_back.has_patch
            ? `Visible patch: ${product.design_back.patch_detail}. `
            : '';
        const technique = product.design_back.technique
            ? `Technique: ${product.design_back.technique}. `
            : '';

        const sizeDescription = modelType === 'adult'
            ? 'Adult-size'
            : 'Child-size (5-year-old)';

        // 🎨 COLOR WEIGHTING (1.5)
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'flatlay_back');

        // 🎨 TEXTURE REINFORCEMENT
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        // 👖 PANTS DETECTION
        const productName = product.general_info.product_name?.toLowerCase() || '';
        const isPants = productName.includes('pant') ||
            productName.includes('trouser') ||
            productName.includes('jean') ||
            productName.includes('jogger') ||
            productName.includes('short') ||
            productName.includes('bottom');

        const productIdentity = this.buildProductIdentityBlock(product, false, true);
        const daBackground = da.background?.type || 'elegant studio backdrop';

        // 🎯 SHOT DESCRIPTION FIRST — most important tokens at the beginning
        const shotDescription = isPants
            ? `PRODUCT-ONLY PHOTOGRAPH of a single ${sizeDescription} ${weightedColor} ${product.general_info.product_name} folded neatly over a wooden hanger bar, turned to show the BACK side. The hanger hangs from a small metal wall hook against a ${daBackground}. Back view, centered composition. The pants are FLAT and EMPTY — just fabric draped over the hanger. Back pockets and waistband clearly visible.`
            : `PRODUCT-ONLY PHOTOGRAPH of a single ${sizeDescription} ${weightedColor} ${product.general_info.product_name} hanging on a wooden hanger from a small metal wall hook against a ${daBackground}. BACK VIEW, centered composition. The garment hangs FLAT and EMPTY with natural drape, turned to show the rear side. Back details clearly visible from shoulders to hem.`;

        // Product details (back-specific)
        const productData = `${product.design_back.description}. ${patchDetail}${technique}Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ${productIdentity}.`;

        // Environment from DA — WALL ONLY, no floor visible in flatlay shots
        const environmentPart = `Background: ONLY the ${daBackground} wall (${da.background?.hex || '#FFFFFF'}) is visible behind the hanging garment. The entire frame shows ONLY the wall surface — there is NO floor visible in this shot. Mood: ${da.mood || 'editorial elegance'}.`;

        // Quality — dynamic camera/lighting per shot type
        const helpers = `Clean minimalist product display. Pristine garment condition. Single garment only. Still life product photography. Wall-only background, no floor in frame. ${cameraLighting}`;

        return `${shotDescription} ${productData} ${environmentPart} ${helpers}`;
    }

    /**
     * CLOSE UP FRONT - PRODUCT-ONLY MACRO DETAIL (fabric, pocket, logo, stitching)
     *
     * 🎯 CRITICAL FIX: Changed from "child model wearing garment" to PRODUCT-ONLY macro.
     * Client wants: close-up detail of clothing material, logo, pocket texture.
     * ZERO humans — just the garment fabric and details in extreme close-up.
     *
     * 🎨 COLOR WEIGHTING: Applied to prevent color bias in macro shots
     */
    private buildCloseUpFrontPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        cameraLighting: string
    ): string {
        const parts: string[] = [];
        if (product.garment_details.closure_details) parts.push(`closure: ${product.garment_details.closure_details}`);
        if (product.garment_details.hardware_finish) parts.push(`hardware: ${product.garment_details.hardware_finish}`);
        const hardwareText = parts.length > 0 ? `, ${parts.join('; ')}` : '';

        // 🎨 COLOR WEIGHTING
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'closeup_front');

        // 🎯 Extract chest pocket details from pockets_array for precise rendering
        const chestPocket = product.garment_details.pockets_array?.find(
            (p) => p.position?.toLowerCase().includes('chest') ||
                p.position?.toLowerCase().includes('left') ||
                p.name?.toLowerCase().includes('chest')
        );

        // Build pocket-specific prompt with EXACT specifications
        let pocketDetails = '';
        let exactPocketSpec = '';
        let geometryPhrase = '';
        if (chestPocket) {
            const pocketMaterial = chestPocket.material || 'leather';
            const pocketShape = chestPocket.shape || 'square';
            const pocketColor = chestPocket.color || '';
            const pocketSize = chestPocket.size || '';

            exactPocketSpec = `POCKET SPECIFICATION: ${pocketShape.toUpperCase()} shape, ${pocketMaterial.toUpperCase()} material${pocketColor ? `, ${pocketColor.toUpperCase()} color` : ''}${pocketSize ? `, ${pocketSize}` : ''}. `;

            pocketDetails = `VISIBLE CHEST POCKET: ${pocketMaterial} ${pocketShape} pocket${pocketColor ? `, ${pocketColor} color` : ''}${pocketSize ? `, ${pocketSize}` : ''}. `;
            if (chestPocket.special_features) {
                pocketDetails += `POCKET DETAIL: ${chestPocket.special_features}. `;
            }

            const shapeLower = pocketShape.toLowerCase();
            if (shapeLower.includes('square')) {
                geometryPhrase = 'Focus on the SQUARE pocket patch with sharp corners. ';
            } else if (shapeLower.includes('rectang')) {
                geometryPhrase = 'Focus on the RECTANGULAR pocket patch with sharp corners. ';
            }

            this.logger.log(`🎯 CloseUp Front: Extracted pocket details - ${pocketMaterial} ${pocketShape}, special: ${chestPocket.special_features || 'none'}`);
        }

        const frontDescription = product.design_front.description || '';
        const microDetails = product.design_front.micro_details ? `Micro details: ${product.design_front.micro_details}. ` : '';
        const productIdentity = this.buildProductIdentityBlock(product, true, false);

        // 🎯 SHOT DESCRIPTION FIRST — PRODUCT-ONLY macro, no humans
        const shotDescription = `EXTREME CLOSE-UP MACRO PRODUCT PHOTOGRAPH of ${weightedColor} ${product.general_info.product_name} fabric and front details. The garment is laid flat on a surface. Camera positioned very close to the front chest area, capturing fabric texture, stitching, pocket patch, and material details in sharp focus. Shallow depth of field. Only the garment fabric fills the frame.`;

        // Product details
        const productData = `FRONT DETAILS IN FOCUS: ${frontDescription}. ${geometryPhrase}${exactPocketSpec}${pocketDetails}${microDetails}${productIdentity}.${hardwareText} Fabric texture: ${product.visual_specs.fabric_texture}. Sharp macro focus on pocket patches, embossing patterns, buttons, stitching, and logo. Pocket patch must EXACTLY match reference images.`;

        // 🎯 Environment — soft blurred DA background behind the close-up
        const environmentPart = `Background: ${da.background.type} (${da.background.hex}) with soft bokeh blur. Shallow depth of field keeping garment details razor-sharp.`;

        // Quality — dynamic camera/lighting per shot type
        const helpers = `Macro product photography. Extreme close-up still life. Fabric texture detail. Single garment only. ${cameraLighting}`;

        return `${shotDescription} ${productData} ${environmentPart} ${helpers}`;
    }



    /**
     * CLOSE UP BACK - PRODUCT-ONLY MACRO (back detail of garment)
     * 🎯 CRITICAL FIX: Changed from "child model from behind" to PRODUCT-ONLY macro.
     * Client wants: close-up detail of back patch, logo, yoke, fabric texture.
     * ZERO humans — just the garment fabric and back details in extreme close-up.
     *
     * 🎨 COLOR WEIGHTING: Applied to prevent color bias in macro shots
     */
    private buildCloseUpBackPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        cameraLighting: string
    ): string {
        const techniqueText = product.design_back.technique
            ? `, technique: ${product.design_back.technique}`
            : '';
        const patchDetail = product.design_back.patch_detail || 'rear branding';

        // 🎨 COLOR WEIGHTING
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'closeup_back');

        // 🎨 TEXTURE REINFORCEMENT
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `. ${textureReinforcement}` : '';

        // 🎯 Extract EXACT patch specifications from product JSON
        const patchShape = product.design_back.patch_shape || 'square';
        const patchColor = product.design_back.patch_color || '';
        const yokeMaterial = product.design_back.yoke_material || '';

        // Build yoke description for leather yoke panels
        let yokeDescription = '';
        if (yokeMaterial) {
            yokeDescription = `Leather yoke panel across upper back area in ${weightedColor}. `;
        }

        // Build EXACT patch specification string
        let exactPatchSpec = '';
        if (patchColor || patchShape) {
            exactPatchSpec = `PATCH SPECIFICATION: ${patchShape.toUpperCase()} shape, ${patchColor.toUpperCase()} color. `;
            this.logger.log(`🎯 CloseUp Back: Extracted patch specs - shape: ${patchShape}, color: ${patchColor}, yoke: ${yokeMaterial || 'none'}`);
        }

        // 🚀 GEOMETRY ENFORCEMENT: Detect explicit shape keywords
        const combinedText = (patchDetail + ' ' + (product.design_back.description || '')).toLowerCase();
        let geometryPhrase = '';

        if (combinedText.includes('square') || patchShape.toLowerCase() === 'square') {
            geometryPhrase = 'Focus on the SQUARE leather patch with sharp corners. ';
        } else if (combinedText.includes('rectang') || patchShape.toLowerCase().includes('rectang')) {
            geometryPhrase = 'Focus on the RECTANGULAR leather patch with sharp corners. ';
        }

        const productIdentity = this.buildProductIdentityBlock(product, false, true);

        // 🎯 SHOT DESCRIPTION FIRST — PRODUCT-ONLY macro, no humans
        const shotDescription = `EXTREME CLOSE-UP MACRO PRODUCT PHOTOGRAPH of ${weightedColor} ${product.general_info.product_name} back details. The garment is laid flat on a surface, showing the back side. Camera positioned very close to the upper back area, capturing back patch, yoke, fabric texture, stitching, and label details in sharp focus. Shallow depth of field. Only the garment fabric fills the frame.`;

        // Product details — back details with EXACT patch specifications
        const productData = `BACK DETAILS IN FOCUS: ${yokeDescription}${geometryPhrase}${exactPatchSpec}${patchDetail} prominently visible and sharp. Patch must be ${patchColor.toUpperCase() || 'exact color from reference'}, ${patchShape.toUpperCase()} shaped. Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}.${techniqueText} ${productIdentity}. Shoulder seams, collar back, and stitching details visible. Sharp macro focus on back patch, embossing patterns, and logo.`;

        // 🎯 Environment — soft blurred DA background behind the close-up
        const environmentPart = `Background: ${da.background.type} (${da.background.hex}) with soft bokeh blur. Shallow depth of field keeping garment details razor-sharp.`;

        // Quality — dynamic camera/lighting per shot type
        const helpers = `Macro product photography. Extreme close-up still life. Back fabric texture detail. Single garment only. ${cameraLighting}`;

        return `${shotDescription} ${productData} ${environmentPart} ${helpers}`;
    }

    // ═══════════════════════════════════════════════════════════
    // PACKSHOT PROMPT BUILDERS (4 shots: front, back, detail1, detail2)
    // ═══════════════════════════════════════════════════════════

    /**
     * Orchestrator: Build all 4 packshot prompts from analyzed product JSON
     */
    buildPackshotPrompts(
        productJson: AnalyzeProductDirectResponse,
        hangerMode: boolean,
        detail1Focus?: string,
        detail2Focus?: string,
    ): { front_packshot: string; back_packshot: string; detail_1: string; detail_2: string; detail_1_focus: string; detail_2_focus: string; negative_prompt: string } {
        this.logger.log(`📦 Building packshot prompts: hanger=${hangerMode}, detail1="${detail1Focus || 'auto'}", detail2="${detail2Focus || 'auto'}"`);

        // Auto-detect detail focus areas if not provided
        const resolvedDetail1Focus = detail1Focus || this.autoDetectDetailFocus(productJson, 'front');
        const resolvedDetail2Focus = detail2Focus || this.autoDetectDetailFocus(productJson, 'back');

        this.logger.log(`📦 Resolved detail focus: detail1="${resolvedDetail1Focus}", detail2="${resolvedDetail2Focus}"`);

        const resolution = '4K';
        const resolutionSuffix = this.getResolutionQualitySuffix(resolution);

        const frontPrompt = this.buildFrontPackshotPrompt(productJson, hangerMode) + resolutionSuffix;
        const backPrompt = this.buildBackPackshotPrompt(productJson, hangerMode) + resolutionSuffix;
        const detail1Prompt = this.buildPackshotDetailPrompt(productJson, resolvedDetail1Focus, 'front') + resolutionSuffix;
        const detail2Prompt = this.buildPackshotDetailPrompt(productJson, resolvedDetail2Focus, 'back') + resolutionSuffix;

        const negativePrompt = 'collage, split screen, inset image, picture in picture, multiple views, overlay, montage, composite image, text, watermark, blurry, low quality, distorted, mannequin face, visible mannequin, human face, human hands, person, model, 3d render, wrong color, color shift, faded color';

        return {
            front_packshot: frontPrompt,
            back_packshot: backPrompt,
            detail_1: detail1Prompt,
            detail_2: detail2Prompt,
            detail_1_focus: resolvedDetail1Focus,
            detail_2_focus: resolvedDetail2Focus,
            negative_prompt: negativePrompt,
        };
    }

    /**
     * Auto-detect the best focus area for detail shots based on product analysis
     */
    private autoDetectDetailFocus(product: AnalyzeProductDirectResponse, side: 'front' | 'back'): string {
        if (side === 'front') {
            if (product.design_front.has_logo && product.design_front.logo_text) {
                return 'logo and front branding';
            }
            const chestPocket = product.garment_details?.pockets_array?.find(
                (p) => p.position?.toLowerCase().includes('chest') || p.name?.toLowerCase().includes('chest'),
            );
            if (chestPocket) {
                return 'chest pocket detail and embossing';
            }
            return 'front fabric texture and stitching';
        }

        // back
        if (product.design_back.has_patch && product.design_back.patch_detail) {
            return 'back patch and label';
        }
        if (product.design_back.yoke_material) {
            return 'yoke panel detail';
        }
        return 'back fabric texture and construction';
    }

    /**
     * FRONT PACKSHOT — product hanging on hanger or ghost mannequin, front view
     * Clean e-commerce product photo on pure white background
     */
    private buildFrontPackshotPrompt(product: AnalyzeProductDirectResponse, hangerMode: boolean): string {
        const colorName = product.visual_specs.color_name || product.visual_specs.primary_color_name || '';
        const weightedColor = this.applyColorWeighting(colorName, 'flatlay_front');
        const productIdentity = this.buildProductIdentityBlock(product, true, false);
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture,
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';
        const logoText = this.checkLogoRule(
            product.design_front.has_logo,
            product.design_front.logo_text,
            product.design_front.logo_type,
            product.design_front.font_family,
            product.design_front.size_relative_pct,
        );

        const displayMethod = hangerMode
            ? 'hanging on a premium wooden hanger with a chrome hook. The garment hangs flat and empty with natural drape under its own weight'
            : 'displayed on an invisible ghost mannequin giving a 3D hollow-body effect. The garment appears to float with natural shape as if worn by an invisible person';

        const shotDescription = `PROFESSIONAL E-COMMERCE PRODUCT PHOTOGRAPH. Single ${weightedColor} ${product.general_info.product_name} ${displayMethod}. FRONT VIEW, perfectly centered in frame. Pure white background (#FFFFFF). Clean, minimal, commercial product photography.`;

        const productData = `Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ${productIdentity}. ${logoText}. Full garment visible from collar/neckline to hem. All buttons, zippers, and closures clearly visible.`;

        const technical = `50mm lens, f/8, front-facing straight-on angle. Even studio lighting with soft shadows. Pure white seamless background. E-commerce product photography standard. Color-accurate representation of ${weightedColor}.`;

        return `${shotDescription} ${productData} ${technical}`;
    }

    /**
     * BACK PACKSHOT — product hanging on hanger or ghost mannequin, back view
     * Clean e-commerce product photo on pure white background
     */
    private buildBackPackshotPrompt(product: AnalyzeProductDirectResponse, hangerMode: boolean): string {
        const colorName = product.visual_specs.color_name || product.visual_specs.primary_color_name || '';
        const weightedColor = this.applyColorWeighting(colorName, 'flatlay_back');
        const productIdentity = this.buildProductIdentityBlock(product, false, true);
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture,
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        const patchDetail = product.design_back.has_patch
            ? `Visible patch: ${product.design_back.patch_detail}. `
            : '';
        const technique = product.design_back.technique
            ? `Technique: ${product.design_back.technique}. `
            : '';

        const displayMethod = hangerMode
            ? 'hanging on a premium wooden hanger with a chrome hook, turned to show the BACK side. The garment hangs flat and empty with natural drape'
            : 'displayed on an invisible ghost mannequin giving a 3D hollow-body effect, turned to show the BACK side. The garment appears to float with natural shape';

        const shotDescription = `PROFESSIONAL E-COMMERCE PRODUCT PHOTOGRAPH. Single ${weightedColor} ${product.general_info.product_name} ${displayMethod}. BACK VIEW, perfectly centered in frame. Pure white background (#FFFFFF). Clean, minimal, commercial product photography.`;

        const productData = `${product.design_back.description}. ${patchDetail}${technique}Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ${productIdentity}. Back details clearly visible from shoulders to hem.`;

        const technical = `50mm lens, f/8, front-facing straight-on angle. Even studio lighting with soft shadows. Pure white seamless background. E-commerce product photography standard. Color-accurate representation of ${weightedColor}.`;

        return `${shotDescription} ${productData} ${technical}`;
    }

    /**
     * PACKSHOT DETAIL — extreme close-up of a specific area
     * Macro detail shot for e-commerce
     */
    private buildPackshotDetailPrompt(
        product: AnalyzeProductDirectResponse,
        focusArea: string,
        side: 'front' | 'back',
    ): string {
        const colorName = product.visual_specs.color_name || product.visual_specs.primary_color_name || '';
        const weightedColor = this.applyColorWeighting(colorName, side === 'front' ? 'closeup_front' : 'closeup_back');
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture,
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        let detailContext = '';
        if (side === 'front') {
            const productIdentity = this.buildProductIdentityBlock(product, true, false);
            detailContext = `FRONT DETAILS: ${product.design_front.description || ''}. ${productIdentity}.`;
            if (product.design_front.micro_details) {
                detailContext += ` Micro details: ${product.design_front.micro_details}.`;
            }
        } else {
            const productIdentity = this.buildProductIdentityBlock(product, false, true);
            detailContext = `BACK DETAILS: ${product.design_back.description || ''}. ${productIdentity}.`;
            if (product.design_back.patch_detail) {
                detailContext += ` Patch: ${product.design_back.patch_detail}.`;
            }
        }

        const shotDescription = `EXTREME CLOSE-UP MACRO PRODUCT PHOTOGRAPH of ${weightedColor} ${product.general_info.product_name}. Camera positioned very close to capture ${focusArea} in razor-sharp focus. The garment is laid flat on a white surface. Only the fabric detail fills the frame. Shallow depth of field.`;

        const productData = `FOCUS AREA: ${focusArea}. ${detailContext} Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. Sharp macro focus capturing every thread, stitch, and texture detail.`;

        const technical = `100mm macro lens, f/4, close-range. Directional raking light to reveal fabric texture and stitching details. Pure white background with soft bokeh. E-commerce detail photography. Color-accurate ${weightedColor}.`;

        return `${shotDescription} ${productData} ${technical}`;
    }
}
