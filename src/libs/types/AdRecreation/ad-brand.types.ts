/**
 * AdBrand Types
 * 
 * Type definitions for Brand playbooks in Ad Recreation Module.
 */

// ═══════════════════════════════════════════════════════════
// Brand Playbook - Analyzed from PDF upload
// ═══════════════════════════════════════════════════════════

/**
 * Brand Playbook - Visual identity + product identity extracted by Claude
 * This is the canonical schema for all brand analysis outputs (PDF + text).
 * The first 4 fields (colors, fonts, tone_of_voice, logo_rules) are required.
 * The remaining fields are optional for backward compatibility with existing DB rows.
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

    // Product identity — used to build dynamic PRODUCT_LOCK guardrail
    product_identity?: {
        product_name: string;
        product_type: string;
        visual_description: string;
        key_features: string[];
        colors: Record<string, string>;
        negative_traits: string[];
    };

    // Target audience — used to build dynamic PERSONA_LOCK guardrail
    target_audience?: {
        gender: string;
        age_range: string;
        body_type?: string;
        clothing_style?: string;
        personas: string[];
    };

    // Compliance constraints — injected into negative prompt
    compliance?: {
        region: string;
        rules: string[];
    };

    // USP and offers — provided to AI copywriter for ad copy
    usp_offers?: {
        key_benefits: string[];
        current_offer?: string;
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
