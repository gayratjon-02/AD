
import { Logger } from '@nestjs/common';

// Interface - validation natijasi
export interface ValidationFlag {
    field: string;
    issue: string;
    original: string;
    corrected?: string;
    confidence: 'auto_fixed' | 'needs_review' | 'critical';
}

export interface ValidatedResult<T> {
    data: T;
    flags: ValidationFlag[];
    was_modified: boolean;
}

export class ProductAnalysisValidator {
    private readonly logger = new Logger(ProductAnalysisValidator.name);

    /**
     * Asosiy validation funksiyasi
     * Claude javobini tekshiradi va xatolarni tuzatadi
     */
    validate<T extends Record<string, any>>(parsed: T): ValidatedResult<T> {
        const flags: ValidationFlag[] = [];
        let data = JSON.parse(JSON.stringify(parsed)); // Deep clone

        // 1. Fabric Type tekshiruvi
        data = this.validateFabricType(data, flags);

        // 2. Ankle Termination tekshiruvi (pants uchun)
        data = this.validateAnkleTermination(data, flags);

        // 3. Patch Placement tekshiruvi (Left/Right)
        data = this.validatePatchPlacement(data, flags);

        // 4. Back Pocket tekshiruvi
        data = this.validateBackPocket(data, flags);

        // 5. Hex Color tekshiruvi
        data = this.validateHexColor(data, flags);

        // 6. has_patch bo'lsa, kerakli fieldlar bormi
        data = this.validatePatchFields(data, flags);

        // 7. Category validation (Pajama + zipper = Track Pants)
        data = this.validateCategory(data, flags);  // ← BU QATOR QO'SHILDI!

        // Log
        if (flags.length > 0) {
            this.logger.warn(`⚠️ Validation: ${flags.length} ta muammo topildi`);
            flags.forEach(f => this.logger.warn(`  - ${f.field}: ${f.issue}`));
        }

        return {
            data,
            flags,
            was_modified: flags.some(f => f.corrected !== undefined),
        };
    }

    /**
     * 1. FABRIC TYPE
     * "corduroy" degan bo'lsa, lekin aslida ribbed jersey bo'lishi mumkin
     */
    private validateFabricType<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const texture = data.visual_specs?.fabric_texture?.toLowerCase() || '';

        if (texture.includes('corduroy')) {
            // Ribbed jersey belgilari
            const ribbedSigns = ['fine', 'stretch', 'jersey', 'knit', 'lightweight', 'soft'];
            const hasRibbedSigns = ribbedSigns.some(s => texture.includes(s));

            // Corduroy belgilari
            const corduroySigns = ['cord', 'wale', 'wide rib', 'thick'];
            const hasCorduroySigns = corduroySigns.some(s => texture.includes(s));

            if (hasRibbedSigns && !hasCorduroySigns) {
                const original = data.visual_specs.fabric_texture;
                // Avtomatik tuzatish
                data.visual_specs.fabric_texture = original
                    .replace(/corduroy/gi, 'ribbed jersey')
                    .replace(/fine-?corduroy/gi, 'fine-ribbed jersey');

                flags.push({
                    field: 'visual_specs.fabric_texture',
                    issue: 'Corduroy → Ribbed jersey ga o\'zgartirildi (stretch/fine belgisi bor)',
                    original,
                    corrected: data.visual_specs.fabric_texture,
                    confidence: 'auto_fixed',
                });
            }
        }

        return data;
    }

    /**
     * 2. ANKLE TERMINATION
     * Zipper + Cuff = imkonsiz
     */
    private validateAnkleTermination<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const category = data.general_info?.category?.toLowerCase() || '';
        const isPants = ['pant', 'jogger', 'track', 'trouser', 'pajama'].some(p => category.includes(p));

        if (!isPants) return data;

        const bottom = data.garment_details?.bottom_termination?.toLowerCase() || '';
        const hasZipper = bottom.includes('zipper') || bottom.includes('zip');
        const hasCuff = bottom.includes('cuff') || bottom.includes('elastic') || bottom.includes('ribbed');

        if (hasZipper && hasCuff) {
            const original = data.garment_details.bottom_termination;

            // Zipper ko'proq aniq, shuning uchun zipper qoldirish
            data.garment_details.bottom_termination = 'Straight hem with side ankle zipper';

            flags.push({
                field: 'garment_details.bottom_termination',
                issue: 'IMKONSIZ: Zipper + Cuff birga bo\'lmaydi. Zipper qoldirildi.',
                original,
                corrected: data.garment_details.bottom_termination,
                confidence: 'auto_fixed',
            });
        }

        return data;
    }

    /**
     * 3. PATCH PLACEMENT
     * "left/right" bo'lsa, "wearer's" qo'shish
     */
    private validatePatchPlacement<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        if (!data.design_back?.placement) return data;

        let placement = data.design_back.placement;
        const hasWearer = /wearer'?s/i.test(placement);

        if (!hasWearer) {
            // "right hip" → "wearer's RIGHT hip"
            if (/\bright\s+(hip|side|pocket|area)/i.test(placement)) {
                const original = placement;
                placement = placement.replace(/\bright\s+(hip|side|pocket|area)/gi, "wearer's RIGHT $1");
                data.design_back.placement = placement;

                flags.push({
                    field: 'design_back.placement',
                    issue: '"wearer\'s" qo\'shildi (orientation aniqlik uchun)',
                    original,
                    corrected: placement,
                    confidence: 'auto_fixed',
                });
            }

            // "left hip" → "wearer's LEFT hip"
            if (/\bleft\s+(hip|side|pocket|area)/i.test(placement)) {
                const original = placement;
                placement = placement.replace(/\bleft\s+(hip|side|pocket|area)/gi, "wearer's LEFT $1");
                data.design_back.placement = placement;

                flags.push({
                    field: 'design_back.placement',
                    issue: '"wearer\'s" qo\'shildi (orientation aniqlik uchun)',
                    original,
                    corrected: placement,
                    confidence: 'auto_fixed',
                });
            }
        }

        return data;
    }

    /**
     * 4. BACK POCKET
     * Pants bo'lsa, back pocket bo'lishi kerak
     */
    private validateBackPocket<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const category = data.general_info?.category?.toLowerCase() || '';
        const isPants = ['pant', 'jogger', 'track', 'pajama'].some(p => category.includes(p));

        if (!isPants) return data;

        const pockets = data.garment_details?.pockets?.toLowerCase() || '';
        const hasBackPocket = ['back', 'welt', 'rear'].some(p => pockets.includes(p));

        if (!hasBackPocket) {
            flags.push({
                field: 'garment_details.pockets',
                issue: 'Back pocket eslatilmagan. Ko\'p joggers da back welt pocket bor - rasmdan tekshiring.',
                original: data.garment_details?.pockets || '',
                confidence: 'needs_review',
            });
        }

        return data;
    }

    /**
     * 5. HEX COLOR
     * Format to'g'ri bo'lishi kerak
     */
    private validateHexColor<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const hex = data.visual_specs?.hex_code || '';

        if (hex && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            // # yo'q bo'lsa, qo'shish
            if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                const original = hex;
                data.visual_specs.hex_code = `#${hex}`;

                flags.push({
                    field: 'visual_specs.hex_code',
                    issue: '# belgisi qo\'shildi',
                    original,
                    corrected: data.visual_specs.hex_code,
                    confidence: 'auto_fixed',
                });
            } else {
                flags.push({
                    field: 'visual_specs.hex_code',
                    issue: 'Noto\'g\'ri hex format',
                    original: hex,
                    confidence: 'needs_review',
                });
            }
        }

        return data;
    }

    /**
     * 6. PATCH FIELDS
     * has_patch: true bo'lsa, kerakli fieldlar to'liq bo'lishi kerak
     */
    private validatePatchFields<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        if (!data.design_back?.has_patch) return data;

        const required = ['patch_color', 'patch_detail', 'placement', 'size', 'technique'];
        const missing: string[] = [];

        for (const field of required) {
            const val = data.design_back[field];
            if (!val || val === 'N/A' || val === '') {
                missing.push(field);
            }
        }

        if (missing.length > 0) {
            flags.push({
                field: 'design_back',
                issue: `has_patch: true, lekin bu fieldlar yo'q: ${missing.join(', ')}`,
                original: JSON.stringify(missing),
                confidence: 'critical',
            });
        }

        return data;
    }

    /**
     * 7. CATEGORY VALIDATION
     * Pajama + ankle zipper = Track Pants
     * Joggers + zipper = Track Pants
     */
    private validateCategory<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const category = data.general_info?.category?.toLowerCase() || '';
        const bottom = data.garment_details?.bottom_termination?.toLowerCase() || '';
        const hasZipper = bottom.includes('zipper') || bottom.includes('zip');
        const hasCuff = bottom.includes('cuff') || bottom.includes('elastic');

        // Pajama + zipper = Track Pants
        if (category.includes('pajama') && hasZipper) {
            const original = data.general_info.category;
            data.general_info.category = 'Track Pants';

            flags.push({
                field: 'general_info.category',
                issue: 'Pajama + ankle zipper = Track Pants ga o\'zgartirildi',
                original,
                corrected: data.general_info.category,
                confidence: 'auto_fixed',
            });
        }

        // Joggers + zipper (no cuff) = Track Pants
        if (category.includes('jogger') && hasZipper && !hasCuff) {
            const original = data.general_info.category;
            data.general_info.category = 'Track Pants';

            flags.push({
                field: 'general_info.category',
                issue: 'Joggers + ankle zipper (no cuff) = Track Pants ga o\'zgartirildi',
                original,
                corrected: data.general_info.category,
                confidence: 'auto_fixed',
            });
        }

        // Track Pants + cuff (no zipper) = Joggers
        if (category.includes('track') && hasCuff && !hasZipper) {
            const original = data.general_info.category;
            data.general_info.category = 'Joggers';

            flags.push({
                field: 'general_info.category',
                issue: 'Track Pants + elastic cuff (no zipper) = Joggers ga o\'zgartirildi',
                original,
                corrected: data.general_info.category,
                confidence: 'auto_fixed',
            });
        }

        return data;
    }
}

/**
 * Helper function - tez ishlatish uchun
 */
export function validateProductAnalysis<T extends Record<string, any>>(parsed: T): ValidatedResult<T> {
    const validator = new ProductAnalysisValidator();
    return validator.validate(parsed);
}








