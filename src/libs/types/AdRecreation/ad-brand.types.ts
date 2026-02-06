/**
 * AdBrand Types
 * 
 * Type definitions for Brand playbooks in Ad Recreation Module.
 */

// ═══════════════════════════════════════════════════════════
// Brand Playbook - Analyzed from PDF upload
// ═══════════════════════════════════════════════════════════

/**
 * Brand Playbook - Contains visual identity guidelines
 */
export interface BrandPlaybook {
    colors?: {
        primary: string;
        secondary: string;
        accent?: string;
        palette?: string[];
    };
    fonts?: {
        heading: string;
        body: string;
        accent?: string;
    };
    tone?: {
        voice: string; // e.g., "professional", "playful", "luxury"
        keywords?: string[];
    };
    logo_usage?: {
        min_size?: string;
        clear_space?: string;
        forbidden_contexts?: string[];
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
 * Brand Assets - Logo URLs
 */
export interface BrandAssets {
    logo_light_mode?: string;
    logo_dark_mode?: string;
    favicon?: string;
    brand_mark?: string;
    additional_assets?: string[];
}
