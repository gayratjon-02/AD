/**
 * AdConcept Types
 *
 * Type definitions for competitor ad analysis in Ad Recreation Module.
 * Matches the Claude Vision output structure from the spec.
 */

// ═══════════════════════════════════════════════════════════
// Concept Zone - Individual zone/section in ad layout
// ═══════════════════════════════════════════════════════════

/**
 * ConceptZone - Simplified zone extracted by Claude Vision
 */
export interface ConceptZone {
    id: string;
    type: 'headline' | 'subheadline' | 'body' | 'cta' | 'visual' | 'logo' | 'background';
    y_start: number;
    y_end: number;
    content_description: string;
}

// ═══════════════════════════════════════════════════════════
// Ad Concept Analysis - Full analysis structure
// ═══════════════════════════════════════════════════════════

/**
 * AdConceptAnalysis - Full structure extracted by Claude Vision
 */
export interface AdConceptAnalysis {
    layout: {
        type: string;
        format: string;
        zones: ConceptZone[];
    };
    visual_style: {
        mood: string;
        background_code: string;
        lighting: string;
    };
    typography: {
        primary_font_style: string;
        secondary_font_style: string;
    };
}
