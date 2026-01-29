import { Injectable, Logger } from '@nestjs/common';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze-product-direct.dto';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze-da-preset.dto';
import { DAPreset, DAPresetConfig } from '../database/entities/da-preset.entity';
import { Product } from '../database/entities/product.entity';
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
        model_type: 'adult' | 'kid';
    };
}

/**
 * Input for building prompts from DB entities directly
 */
interface EntityMergeInput {
    product: Product;
    daPreset: DAPreset;
    modelType: 'adult' | 'kid';
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
        display_name: 'DUO (Father + Son)',
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
     */
    buildPromptsFromEntities(input: EntityMergeInput): GeneratedPrompts {
        const { product, daPreset, modelType } = input;

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
            props: daConfig.props,
            styling: daConfig.styling,
            lighting: daConfig.lighting,
            mood: daConfig.mood,
            quality: daConfig.quality,
        };

        // Use the standard buildPrompts method
        return this.buildPrompts({
            product: productJson,
            da,
            options: { model_type: modelType },
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
        const logoTextFront = this.checkLogoRule(product.design_front.has_logo, product.design_front.logo_text, product.design_front.logo_type);

        // ═══════════════════════════════════════════════════════════
        // 2. BRAND GUARDIAN RULES
        // ═══════════════════════════════════════════════════════════

        // FOOTWEAR RULE: Indoor scenes = BAREFOOT
        const footwear = this.applyFootwearRule(da.styling.footwear, da.background.type);

        // PANTS RULE: Default to Black chino pants if not specified
        const pants = this.applyPantsRule(da.styling.pants);

        // CATEGORY DETECTION: Check if product is a bottom garment
        const isProductBottom = this.isBottomGarment(product.general_info.category);

        // ═══════════════════════════════════════════════════════════
        // 3. COMMON PROMPT FRAGMENTS
        // ═══════════════════════════════════════════════════════════

        const qualitySuffix = `, ${da.quality}, ${da.lighting.type}, ${da.lighting.temperature}`;
        const baseAttire = `Wearing ${product.visual_specs.color_name} ${product.general_info.product_name}`;

        // SMART STYLING: If product IS a bottom → only footwear, no DA pants
        // If product is NOT a bottom (top/jacket) → include both pants and footwear
        const styling = isProductBottom
            ? footwear  // Product is pants/shorts → just footwear
            : `Wearing ${pants}, ${footwear}`;  // Product is top → include DA pants + footwear

        if (isProductBottom) {
            this.logger.log(`👖 Category Detection: Product "${product.general_info.category}" is a BOTTOM → skipping DA pants`);
        }

        // Props (handle empty arrays gracefully)
        const leftProps = da.props.left_side.length > 0 ? da.props.left_side.join(', ') : 'minimal decor';
        const rightProps = da.props.right_side.length > 0 ? da.props.right_side.join(', ') : 'minimal decor';
        const scene = `${da.background.type}, ${da.floor.type}. Props: ${leftProps} on the left, ${rightProps} on the right`;
        const propsText = `${leftProps}, ${rightProps}`;

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

        const negativePrompt = 'text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers';

        // ═══════════════════════════════════════════════════════════
        // 6. GENERATE 6 SHOT PROMPTS (MergedPromptObject format)
        // ═══════════════════════════════════════════════════════════

        // 6.1 DUO (Father + Son)
        const duoPrompt = this.buildDuoPrompt(product, da, baseAttire, styling, scene, zipperText, qualitySuffix);
        const duo: MergedPromptObject = {
            ...SHOT_CONFIGS.duo,
            prompt: duoPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.2 SOLO
        const soloPrompt = this.buildSoloPrompt(product, da, options.model_type, baseAttire, styling, scene, zipperText, logoTextFront, qualitySuffix);
        const solo: MergedPromptObject = {
            ...SHOT_CONFIGS.solo,
            display_name: options.model_type === 'adult' ? 'SOLO Adult Model' : 'SOLO Kid Model',
            prompt: soloPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.3 FLAT LAY FRONT (with size variation)
        const flatLayFrontPrompt = this.buildFlatLayFrontPrompt(product, da, options.model_type, logoTextFront, qualitySuffix);
        const flatlay_front: MergedPromptObject = {
            ...SHOT_CONFIGS.flatlay_front,
            display_name: options.model_type === 'adult' ? 'Flat Lay Front (Adult Size)' : 'Flat Lay Front (Kid Size)',
            prompt: flatLayFrontPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: {
                ...productDetails,
                size: options.model_type === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.4 FLAT LAY BACK (with size variation)
        const flatLayBackPrompt = this.buildFlatLayBackPrompt(product, da, options.model_type, qualitySuffix);
        const flatlay_back: MergedPromptObject = {
            ...SHOT_CONFIGS.flatlay_back,
            display_name: options.model_type === 'adult' ? 'Flat Lay Back (Adult Size)' : 'Flat Lay Back (Kid Size)',
            prompt: flatLayBackPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: {
                ...productDetails,
                size: options.model_type === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.5 CLOSE UP FRONT
        const closeUpFrontPrompt = this.buildCloseUpFrontPrompt(product, da, qualitySuffix);
        const closeup_front: MergedPromptObject = {
            ...SHOT_CONFIGS.closeup_front,
            prompt: closeUpFrontPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.6 CLOSE UP BACK
        const closeUpBackPrompt = this.buildCloseUpBackPrompt(product, da, qualitySuffix);
        const closeup_back: MergedPromptObject = {
            ...SHOT_CONFIGS.closeup_back,
            prompt: closeUpBackPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

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
     * FOOTWEAR RULE: Indoor scenes = BAREFOOT
     * Only allow shoes for outdoor street scenes
     */
    private applyFootwearRule(footwear: string, backgroundType: string): string {
        const background = backgroundType.toLowerCase();

        // Check if outdoor street scene
        const isOutdoorStreet =
            background.includes('street') ||
            background.includes('sidewalk') ||
            background.includes('pavement') ||
            background.includes('outdoor') ||
            background.includes('urban');

        // If NOT outdoor street, force BAREFOOT
        if (!isOutdoorStreet) {
            this.logger.log(`👟 Footwear Rule: Indoor scene detected → forcing BAREFOOT`);
            return 'BAREFOOT';
        }

        return footwear || 'casual sneakers';
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

    private checkLogoRule(hasLogo: boolean, text: string, type: string): string {
        if (!hasLogo) {
            return '';
        }
        return `Visible logo: ${text} (${type}).`;
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDERS (6 Shot Types)
    // ═══════════════════════════════════════════════════════════

    private buildDuoPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        qualitySuffix: string
    ): string {
        return `Photorealistic editorial fashion photography. Father and Son standing together in a ${da.mood} moment. ` +
            `Both wearing matching ${baseAttire}. ${styling}. ${scene}. ` +
            `${product.design_front.description}.${zipperText} ` +
            `Real human skin texture, natural poses, editorial quality.${qualitySuffix}`;
    }

    private buildSoloPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        logoTextFront: string,
        qualitySuffix: string
    ): string {
        let subject = '';
        if (modelType === 'adult') {
            subject = 'Handsome 30s male model, Mediterranean features, natural confident pose';
        } else {
            subject = 'Cute young boy (age 5-7), playful natural pose';
        }

        return `Photorealistic editorial fashion photography. ${subject}. ` +
            `${baseAttire}. ${product.design_front.description}. ${logoTextFront}. ` +
            `${styling}. ${scene}.${zipperText} ` +
            `Real human skin texture, editorial quality.${qualitySuffix}`;
    }

    /**
     * FLAT LAY FRONT with Size Variation
     * Adult: "Adult-size garment" - larger proportions
     * Kid: "Child-size garment" - smaller, compact proportions
     */
    private buildFlatLayFrontPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        logoTextFront: string,
        qualitySuffix: string
    ): string {
        // SIZE VARIATION: Different size descriptions for adult vs kid
        const sizeDescription = modelType === 'adult'
            ? 'Adult-size garment with standard adult proportions'
            : 'Child-size garment with smaller, compact proportions';

        return `Professional overhead flat lay photography of ${product.general_info.product_name}. ` +
            `${sizeDescription}. ` +
            `${product.design_front.description}. ${logoTextFront}. ` +
            `Laid flat on ${da.floor.type} surface. ` +
            `NO PEOPLE, NO HANDS, PERFECTLY FOLDED, pristine condition.${qualitySuffix}`;
    }

    /**
     * FLAT LAY BACK with Size Variation
     * Adult: "Adult-size garment" - larger proportions
     * Kid: "Child-size garment" - smaller, compact proportions
     */
    private buildFlatLayBackPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        qualitySuffix: string
    ): string {
        const patchDetail = product.design_back.has_patch
            ? `Visible patch: ${product.design_back.patch_detail}. `
            : '';
        const technique = product.design_back.technique
            ? `Technique: ${product.design_back.technique}. `
            : '';

        // SIZE VARIATION: Different size descriptions for adult vs kid
        const sizeDescription = modelType === 'adult'
            ? 'Adult-size garment with standard adult proportions'
            : 'Child-size garment with smaller, compact proportions';

        return `Professional overhead flat lay photography of the BACK of ${product.general_info.product_name}. ` +
            `${sizeDescription}. ` +
            `${product.design_back.description}. ${patchDetail}${technique}` +
            `Showing rear details clearly. NO PEOPLE, NO HANDS.${qualitySuffix}`;
    }

    private buildCloseUpFrontPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        qualitySuffix: string
    ): string {
        const hardwareText = product.garment_details.hardware_finish
            ? `, hardware: ${product.garment_details.hardware_finish}`
            : '';

        return `Macro detail shot of ${product.visual_specs.fabric_texture}. ` +
            `Focus on ${product.design_front.logo_type}${hardwareText}. ` +
            `Hard side lighting to emphasize texture and details.${qualitySuffix}`;
    }

    private buildCloseUpBackPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        qualitySuffix: string
    ): string {
        const techniqueText = product.design_back.technique
            ? `, technique: ${product.design_back.technique}`
            : '';
        const patchDetail = product.design_back.patch_detail || 'rear branding';

        return `Macro detail shot of the rear brand patch. ` +
            `Focus on ${patchDetail}${techniqueText}. ` +
            `Emphasizing craftsmanship and quality.${qualitySuffix}`;
    }
}
