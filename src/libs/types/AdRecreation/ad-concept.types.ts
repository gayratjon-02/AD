/**
 * AdConcept Types
 * 
 * Type definitions for competitor ad analysis in Ad Recreation Module.
 */

// ═══════════════════════════════════════════════════════════
// Layout Zone - Individual zone/section in ad layout
// ═══════════════════════════════════════════════════════════

/**
 * Zone - Individual zone/section in ad layout
 */
export interface LayoutZone {
    id: string;
    type: 'headline' | 'subheadline' | 'body' | 'cta' | 'image' | 'logo' | 'background';
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    content?: string;
    style?: {
        font_size?: string;
        font_weight?: string;
        color?: string;
        background_color?: string;
        alignment?: 'left' | 'center' | 'right';
    };
    z_index?: number;
}

// ═══════════════════════════════════════════════════════════
// Ad Concept Analysis - Full layout structure
// ═══════════════════════════════════════════════════════════

/**
 * Ad Concept Analysis - Full layout structure extracted by Claude Vision
 */
export interface AdConceptAnalysis {
    format: {
        width: number;
        height: number;
        aspect_ratio: string; // e.g., "9:16", "1:1"
    };
    zones: LayoutZone[];
    color_palette?: string[];
    overall_style?: {
        visual_hierarchy?: string;
        dominant_colors?: string[];
        mood?: string;
    };
    text_content?: {
        headline?: string;
        subheadline?: string;
        body?: string;
        cta?: string;
    };
    analyzed_at?: string;
}
