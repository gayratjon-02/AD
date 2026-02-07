/**
 * AdBrand Types
 * 
 * Type definitions for Brand playbooks in Ad Recreation Module.
 */

// ═══════════════════════════════════════════════════════════
// Brand Playbook - Analyzed from PDF upload
// ═══════════════════════════════════════════════════════════

/**
 * Brand Playbook - Visual identity guidelines extracted by Claude from PDF
 * This is the exact schema enforced on Claude's JSON output.
 */
export interface BrandPlaybook {
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        palette: string[];
    };
    fonts: {
        heading: string;
        body: string;
        usage_rules: string;
    };
    tone_of_voice: {
        style: string;
        keywords: string[];
        donts: string[];
    };
    logo_rules: {
        clear_space: string;
        forbidden_usage: string[];
    };
}

// ═══════════════════════════════════════════════════════════
// Ads Playbook - Layout rules for ad generation
// ═══════════════════════════════════════════════════════════

/**
 * Ads Playbook - Layout rules for ad generation
 */
export interface AdsPlaybook {
    layout_rules?: {
        preferred_formats?: string[]; // e.g., ["9:16", "1:1"]
        grid_system?: string;
        safe_zones?: Record<string, any>;
    };
    visual_style?: {
        image_treatment?: string;
        overlay_opacity?: number;
        corner_radius?: number;
    };
}

// ═══════════════════════════════════════════════════════════
// Copy Playbook - Textual hooks and angles
// ═══════════════════════════════════════════════════════════

/**
 * Copy Playbook - Textual hooks and angles
 */
export interface CopyPlaybook {
    hooks?: string[];
    angles?: {
        name: string;
        description: string;
        example_headlines?: string[];
    }[];
    cta_variations?: string[];
    forbidden_words?: string[];
}

// ═══════════════════════════════════════════════════════════
// Brand Assets - Logo URLs
// ═══════════════════════════════════════════════════════════

/**
 * Brand Assets - Logo URLs (matches PDF spec)
 * logo_light and logo_dark are REQUIRED at upload time,
 * but nullable in the DB until first upload.
 */
export interface BrandAssets {
    logo_light?: string;
    logo_dark?: string;
}
