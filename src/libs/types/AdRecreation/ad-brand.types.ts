/**
 * AdBrand Types
 *
 * Type definitions for Brand playbooks in Ad Recreation Module.
 * Matches Spec v3 (Page 10) brand_json schema.
 */

// ═══════════════════════════════════════════════════════════
// Brand Playbook - Spec v3 compliant schema
// ═══════════════════════════════════════════════════════════

export interface BrandPlaybook {
    // Core identity (populated from form fields)
    brand_name: string;
    industry: string;
    website: string;
    currency: string;

    // Visual identity (extracted by Claude)
    brand_colors: {
        primary: string;
        secondary: string;
        background: string;
        accent?: string;
        text_dark: string;
        text_light?: string;
    };
    typography: {
        headline: string;
        body: string;
    };
    tone_of_voice: string; // Simple string, e.g. "warm, empowering, relatable"

    // Marketing
    usps: string[]; // Flat array of USPs
    compliance?: {
        region: string;
        rules: string[];
    };
    current_offer?: {
        discount?: string;
        price_original?: string;
        price_sale?: string;
        free_gifts?: string[];
        free_gifts_value?: string;
        delivery?: string;
    };

    // Logo (populated from uploaded assets)
    logo?: {
        style?: string;
        light_url?: string;
        dark_url?: string;
    };

    // Target audience
    target_audience?: {
        gender: string;
        age_range: string;
        body_type?: string;
        clothing_style?: string;
        personas: string[];
    };

    // Phase 1 product link (nullable)
    product_ref?: string;

    // Runtime-enriched by generation service (NOT from Claude extraction)
    product_identity?: {
        product_name: string;
        product_type: string;
        visual_description: string;
        key_features: string[];
        colors: Record<string, string>;
        negative_traits: string[];
    };
}

// ═══════════════════════════════════════════════════════════
// Backward Compatibility - Normalize old DB rows to new format
// ═══════════════════════════════════════════════════════════

export function normalizeBrandPlaybook(raw: any): BrandPlaybook {
    if (!raw) return raw;
    // Already new format (has brand_colors key)
    if (raw.brand_colors) return raw as BrandPlaybook;

    // Convert old format → spec v3
    return {
        brand_name: raw.brand_name || '',
        industry: raw.industry || '',
        website: raw.website || '',
        currency: raw.currency || '',
        brand_colors: {
            primary: raw.colors?.primary || '#000000',
            secondary: raw.colors?.secondary || '#666666',
            background: raw.colors?.palette?.[3] || '#FFFFFF',
            accent: raw.colors?.accent,
            text_dark: '#1a1a2e',
            text_light: '#FFFFFF',
        },
        typography: {
            headline: raw.fonts?.heading || '',
            body: raw.fonts?.body || '',
        },
        tone_of_voice: typeof raw.tone_of_voice === 'object'
            ? (raw.tone_of_voice?.style || '')
            : (raw.tone_of_voice || ''),
        usps: raw.usp_offers?.key_benefits || raw.usps || [],
        compliance: raw.compliance,
        current_offer: typeof raw.usp_offers?.current_offer === 'string'
            ? { discount: raw.usp_offers.current_offer }
            : raw.current_offer,
        logo: raw.logo,
        target_audience: raw.target_audience,
        product_ref: raw.product_ref,
        product_identity: raw.product_identity,
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
