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
 * Coordinates are 0-100% relative to the image dimensions.
 */
export interface ConceptZone {
    id: string;
    y_start: number;
    y_end: number;
    content_type: 'text' | 'image' | 'video' | 'cta';
    description: string;
}

// ═══════════════════════════════════════════════════════════
// Ad Concept Analysis - Full analysis structure
// ═══════════════════════════════════════════════════════════

/**
 * AdConceptAnalysis - Layout pattern extracted by Claude Vision
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
        background_hex: string;
        font_color_primary: string;
    };
}
