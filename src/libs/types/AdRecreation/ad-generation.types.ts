/**
 * AdGeneration Types
 * 
 * Type definitions for generation results in Ad Recreation Module.
 */

// ═══════════════════════════════════════════════════════════
// Generated Image Result
// ═══════════════════════════════════════════════════════════

/**
 * Generated Ad Image - Result from ad generation
 * Supports both URL (file-based) and Base64 (inline) image data
 */
export interface GeneratedAdImage {
    id: string;
    url?: string;           // File URL (optional - may be base64 only)
    base64?: string;        // Base64 encoded image data
    mimeType?: string;      // e.g., "image/png", "image/jpeg"
    format: string;         // e.g., "9:16", "1:1"
    angle?: string;
    variation_index: number;
    generated_at: string;
}

// ═══════════════════════════════════════════════════════════
// Ad Generation Result — Structured output format
// ═══════════════════════════════════════════════════════════

/**
 * AdGenerationResult — Structured response from ad generation
 * Contains the final merged prompt along with content and design metadata.
 */
export interface AdGenerationResult {
    generation_id: string;
    content: {
        headline: string;
        subheadline: string;
        cta: string;
    };
    design: {
        layout_type: string;
        zones: any[];
        format: string;
        ratio: string;
    };
    generation_prompt: string;
}
