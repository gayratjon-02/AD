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
 */
export interface GeneratedAdImage {
    id: string;
    url: string;
    format: string; // e.g., "9:16", "1:1"
    angle?: string;
    variation_index: number;
    generated_at: string;
}
