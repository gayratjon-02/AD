/**
 * AdConcept Types
 *
 * Type definitions for competitor ad analysis in Ad Recreation Module.
 * This is the exact schema enforced on Claude Vision's JSON output.
 */

// ═══════════════════════════════════════════════════════════
// Concept Zone - Individual zone/section in ad layout
// ═══════════════════════════════════════════════════════════

/**
 * ConceptZone - A spatial zone extracted by Claude Vision
 * Coordinates are ABSOLUTE PIXEL values based on the format's standard resolution:
 *   9:16 → height 1920px | 1:1 → height 1080px | 4:5 → height 1350px | 16:9 → height 1080px
 */
export interface ConceptZone {
    id: string;
    y_start: number;
    y_end: number;
    content_type: 'headline' | 'body' | 'cta_button' | 'image' | 'logo' | 'ui_element';
    typography_style: string;
    description: string;
}

// ═══════════════════════════════════════════════════════════
// Visual Style - Background configuration
// ═══════════════════════════════════════════════════════════

export interface VisualBackground {
    type: 'solid_color' | 'image' | 'gradient';
    hex: string | null;
}

// ═══════════════════════════════════════════════════════════
// Content Pattern - Marketing angle structure
// ═══════════════════════════════════════════════════════════

export interface ContentPattern {
    hook_type: string;
    narrative_structure: string;
    cta_style: string;
    requires_product_image: boolean;
}

// ═══════════════════════════════════════════════════════════
// Ad Concept Analysis - Full analysis structure
// ═══════════════════════════════════════════════════════════

/**
 * AdConceptAnalysis - Visual DNA extracted by Claude Vision
 * Used to recreate the ad structure for a different brand.
 */
export interface AdConceptAnalysis {
    layout: {
        type: string;
        format: string;
        zones: ConceptZone[];
    };
    visual_style: {
        mood: string;
        background: VisualBackground;
        overlay: string;
    };
    content_pattern: ContentPattern;
}
