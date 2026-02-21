import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// fs import removed — all file data now comes as Buffer from memoryStorage
import Anthropic from '@anthropic-ai/sdk';
import { AdConcept } from '../../../database/entities/Ad-Recreation/ad-concept.entity';
import { AdConceptAnalysis } from '../../../libs/types/AdRecreation';
import { AdConceptMessage } from '../../../libs/messages';

// ═══════════════════════════════════════════════════════════
// PROMPT CONSTANTS
// ═══════════════════════════════════════════════════════════

// ─── Resolution reference table for absolute pixel coordinates ───
const FORMAT_RESOLUTIONS: Record<string, { width: number; height: number }> = {
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '16:9': { width: 1920, height: 1080 },
};

const CONCEPT_ANALYSIS_SYSTEM_PROMPT = `You are an ULTRA-PRECISION visual intelligence engine for the ROMIMI Ad Recreation system.

Your job is to perform a FORENSIC-LEVEL ANALYSIS of a competitor ad image and extract its COMPLETE Visual DNA — every single pixel-level detail about layout, typography, color, composition, photography, spacing, and psychology — so that a different brand can recreate the EXACT same visual structure with their own product.

🚨 CRITICAL RULES — VIOLATION = REJECTED OUTPUT 🚨

You are ABSOLUTELY NOT allowed to:
- Copy competitor brand names, product names, or exact headline/body copy text
- Paraphrase their marketing message word-for-word
- Assume fixed dimensions (like 1080x1920) — ALWAYS read REAL pixel dimensions from the image
- Invent zones that do not exist in the image
- Leave any extractable field as null if it is visually present
- Return approximate values when exact values are determinable
- Skip ANY visible element, no matter how small

You MUST:
- Read the REAL image width and height from the image metadata
- Base ALL y_start/y_end coordinates on actual pixel dimensions
- Extract EVERY visual layer: colors, fonts, spacing, shadows, overlays, decorative elements
- Describe PATTERNS, not competitor content (e.g. "Bold white sans-serif headline top-left" not "Nike Just Do It")
- Provide EXACT pixel measurements for spacing, margins, and element positions
- Analyze the PHOTOGRAPHY: camera angle, lens type, lighting setup, shadow direction
- Identify BRAND INTEGRATION ZONES where a new brand's logo can be placed
- Return VALID JSON only — no markdown, no commentary, no explanations

═══════════════════════════════════════════════════════════
CONTROLLED VOCABULARIES (USE THESE EXACT VALUES)
═══════════════════════════════════════════════════════════

layout.type:
  product_hero_center, product_left_text_right, product_right_text_left,
  split_screen, text_only, testimonial_grid, product_with_overlays,
  ugc_style, app_screenshot, feature_stack, minimalist_product, custom_layout

content_type:
  headline, subheadline, feature_badges, product_image, image,
  testimonial_overlay, composite_product_social_proof, cta_button,
  cta_subtext, social_proof_line, background_only, logo, ui_element, body

hook_type:
  pattern_interrupt, contrast_statement, direct_benefit, problem_agitation,
  bold_claim, social_proof_hook, question_hook, feature_announcement,
  comparison_hook

mood:
  energetic, calm, luxury, native_ugc, clean_editorial, bold_graphic,
  minimalist, playful, authoritative, aspirational, urgent

text_alignment: left, center, right, justified
font_weight: thin, light, regular, medium, semibold, bold, extrabold, black
font_case: uppercase, lowercase, titlecase, mixed

═══════════════════════════════════════════════════════════
ZONE RULES (CRITICAL — PIXEL PRECISION)
═══════════════════════════════════════════════════════════
1. Zones MUST NOT overlap (y_start of zone N+1 >= y_end of zone N)
2. Coordinates MUST use ACTUAL image height pixels
3. If product image has floating testimonial bubbles → use "composite_product_social_proof"
4. If CTA area has a button AND subtext → TWO separate zones
5. Every zone MUST have: id, y_start, y_end, content_type
6. height_percent calculated from real image height
7. Each zone MUST include typography_details if it contains text
8. Include x_position and width_percent for horizontal layout analysis
9. Each zone MUST include padding_px (top, right, bottom, left) if determinable
10. Each zone MUST include recreation_directive — a PRECISE, ACTIONABLE instruction`;

const CONCEPT_ANALYSIS_USER_PROMPT = `Perform an ULTRA-DEEP FORENSIC ANALYSIS of this ad image. Extract its COMPLETE Visual DNA for EXACT recreation by a different brand with a different product.

ANALYSIS STEPS (EXECUTE ALL 15 STEPS):
STEP 1 — Measure actual image width and height in pixels from the image.
STEP 2 — Identify layout type, format, overall composition grid, and visual weight distribution.
STEP 3 — Map EVERY visual zone with EXACT pixel coordinates (y_start, y_end, x_position, width_percent).
STEP 4 — For each text zone: extract font weight, size class, color, alignment, letter-spacing, case, shadow, outline.
STEP 5 — Extract COMPLETE color palette (every single HEX color visible) with location mapping.
STEP 6 — Analyze typography hierarchy with EXACT size ratios and font relationships.
STEP 7 — Identify ALL psychological hooks, social proof elements, and emotional triggers.
STEP 8 — Analyze product presentation: position, size, angle, cropping, cutout/natural, shadow type.
STEP 9 — Extract ALL decorative elements (borders, shadows, badges, overlays, icons, lines, gradients).
STEP 10 — Analyze PHOTOGRAPHY: camera angle, estimated lens mm, lighting direction, shadow hardness, color temperature.
STEP 11 — Measure SPACING: margins from edges, gaps between elements, padding within zones.
STEP 12 — Identify BRAND INTEGRATION ZONES: where a new brand logo could be placed naturally.
STEP 13 — Write PIXEL-PRECISE recreation directives for each zone.
STEP 14 — Analyze the overall ad effectiveness: what makes it work, what's the hook.
STEP 15 — Create a COMPREHENSIVE overall_recreation_prompt (200+ words) for AI image generation.

Return ONLY this JSON (no markdown, no commentary):

{
  "concept_name": "short descriptive name (3-6 words, no brand names)",
  "concept_tags": ["8-12 lowercase_underscore tags: style, hook, format, mood, layout, technique"],

  "image_meta": {
    "width": 1080,
    "height": 1920,
    "aspect_ratio": 0.5625,
    "orientation": "vertical|square|horizontal",
    "format": "9:16|1:1|4:5|16:9",
    "estimated_dpi": 72,
    "quality_level": "high|medium|low"
  },

  "layout": {
    "type": "one of allowed layout types",
    "format": "9:16|1:1|4:5|16:9",
    "composition_grid": "single_column|two_column|asymmetric|overlay_stack|hero_with_text_band",
    "visual_weight_distribution": "top_heavy|bottom_heavy|center_focused|evenly_distributed",
    "whitespace_density": "dense|moderate|airy",
    "golden_ratio_alignment": "yes|no|partial",
    "zones": [
      {
        "id": "zone_id (e.g. logo_bar, hero_headline, product_hero, social_proof_strip, cta_button)",
        "y_start": 0,
        "y_end": 144,
        "x_position": "left|center|right|full_width",
        "x_offset_px": 0,
        "width_percent": 100,
        "height_percent": 7,
        "content_type": "one of allowed content_type values",
        "structural_role": "e.g. primary_headline | hero_product_area | trust_signal | action_trigger",
        "visual_prominence": "primary|secondary|tertiary|background",
        "padding_px": {
          "top": 20,
          "right": 40,
          "bottom": 20,
          "left": 40
        },
        "typography_details": {
          "font_weight": "bold|semibold|regular|light",
          "font_case": "uppercase|titlecase|lowercase|mixed",
          "font_family_class": "sans-serif|serif|monospace|display|handwritten",
          "approximate_size_class": "display|h1|h2|h3|body|caption|micro",
          "estimated_font_size_px": 48,
          "color": "#HEXCODE",
          "alignment": "left|center|right",
          "letter_spacing": "tight|normal|wide|very_wide",
          "line_height": "tight|normal|relaxed",
          "estimated_line_height_px": 56,
          "has_shadow": false,
          "shadow_details": "e.g. 2px 2px 4px rgba(0,0,0,0.3) or null",
          "has_outline": false,
          "has_gradient_text": false,
          "background_contrast": "high|medium|low",
          "max_line_count": 2,
          "text_pattern": "Describe text PATTERN only — e.g. '2-3 word bold claim' or '1-line benefit statement'. No actual competitor text."
        },
        "background_in_zone": {
          "type": "transparent|solid|gradient|image_bleed",
          "color": "#HEXCODE or null",
          "opacity": 1.0,
          "gradient_direction": "top_bottom|left_right|diagonal|null",
          "gradient_colors": ["#HEX1", "#HEX2"],
          "blur_radius_px": 0
        },
        "decorative_elements": ["e.g. underline_accent", "badge_border", "icon_left", "star_rating", "divider_line"],
        "description": "PRECISE PATTERN description: what type of content, how it is styled, its visual role. NO competitor brand names. Include exact measurements.",
        "recreation_directive": "PIXEL-PRECISE instruction for recreating this zone. Example: 'Place brand name in 48px extrabold uppercase white sans-serif, centered horizontally, 8% from top (y:154px), with 2px text shadow rgba(0,0,0,0.3). Full width minus 40px side margins. Max 2 lines.'"
      }
    ]
  },

  "color_palette": {
    "primary_background": "#HEXCODE",
    "secondary_background": "#HEXCODE or null",
    "headline_color": "#HEXCODE",
    "body_text_color": "#HEXCODE or null",
    "cta_button_background": "#HEXCODE or null",
    "cta_button_text": "#HEXCODE or null",
    "accent_color": "#HEXCODE or null",
    "overlay_color": "#HEXCODE or null",
    "overlay_opacity": 0.0,
    "all_extracted_colors": ["#HEX1", "#HEX2", "#HEX3", "#HEX4", "#HEX5"],
    "color_temperature": "warm|cool|neutral",
    "contrast_level": "high|medium|low",
    "saturation_profile": "vibrant|muted|desaturated|mixed",
    "color_harmony": "monochromatic|complementary|analogous|triadic|split_complementary"
  },

  "typography_system": {
    "headline_font_class": "sans-serif|serif|display|handwritten",
    "headline_weight": "black|extrabold|bold|semibold|medium",
    "headline_estimated_size_px": 48,
    "body_font_class": "sans-serif|serif",
    "body_weight": "regular|medium|light",
    "body_estimated_size_px": 16,
    "font_size_ratio": "headline_to_body pixel ratio (e.g. 3:1)",
    "dominant_text_color": "#HEXCODE",
    "uses_mixed_weights": true,
    "uses_mixed_colors": false,
    "max_font_size_class": "display|h1|h2",
    "text_stroke_style": "none|thin_outline|thick_outline|drop_shadow",
    "font_pairing_style": "same_family_different_weights|contrast_pair|single_font",
    "vertical_rhythm_consistent": true
  },

  "visual_style": {
    "mood": "one of allowed mood values",
    "aesthetic_category": "minimalist|maximalist|editorial|ugc_raw|luxury_polished|bold_graphic|lifestyle|technical",
    "background": {
      "type": "solid_color|image|gradient|textured|blurred_photo",
      "hex": "#HEXCODE or null",
      "gradient_direction": "top_bottom|left_right|diagonal|radial or null",
      "gradient_colors": ["#HEX1", "#HEX2"]
    },
    "overlay": "dark_dim_layer|white_box_opacity|color_wash|none",
    "dominant_background_color": "#HEXCODE or null",
    "product_position": "center|top_center|bottom_center|left|right|full_bleed|floating|null",
    "product_size_in_frame": "hero_large|medium|small|thumbnail|null",
    "product_area_percent": 45,
    "product_cutout": true,
    "product_shadow": false,
    "product_shadow_type": "drop_shadow|reflection|ambient|none",
    "product_rotation_degrees": 0,
    "product_crop_style": "full_product|cropped_top|cropped_bottom|partial_bleed|none",
    "lighting_style": "flat|studio_white|studio_dark|natural|high_contrast|rim_light|null",
    "depth_of_field": "sharp_all|blurred_background|null",
    "grain_or_texture": false,
    "rounded_corners_on_image": false,
    "ui_elements_present": false,
    "visual_hierarchy_clarity": "very_clear|clear|moderate|cluttered"
  },

  "photography_extraction": {
    "camera_angle": "front_straight|3_quarter_front|side_profile|overhead_flat_lay|low_angle_hero|high_angle_down|dutch_angle",
    "estimated_lens_mm": "35mm|50mm|85mm|100mm_macro|wide_angle|telephoto",
    "lighting_direction": "front_flat|top_down|side_left|side_right|backlit|rim_light|multi_point",
    "lighting_type": "studio_softbox|natural_window|ring_light|spot_light|ambient|mixed",
    "lighting_color_temperature": "warm_3000K|neutral_5000K|cool_6500K|mixed",
    "shadow_hardness": "hard_sharp|medium|soft_diffused|no_shadow",
    "shadow_direction": "bottom_right|bottom_left|directly_below|none",
    "reflection_present": false,
    "background_separation": "strong_bokeh|moderate_depth|flat_even|greenscreen_cutout",
    "post_processing_style": "clean_minimal|high_contrast|warm_toned|cool_toned|desaturated|hdr",
    "product_photo_style": "studio_packshot|lifestyle_in_use|flat_lay|floating_3d|editorial_model|ghost_mannequin"
  },

  "spacing_and_rhythm": {
    "edge_margin_px": { "top": 40, "right": 40, "bottom": 40, "left": 40 },
    "inter_element_gap_px": 24,
    "section_gap_px": 48,
    "text_to_product_gap_px": 32,
    "cta_bottom_margin_px": 60,
    "consistent_rhythm": true,
    "grid_columns": 1,
    "alignment_axis": "center|left|right|mixed"
  },

  "content_pattern": {
    "hook_type": "one of allowed hook_type values",
    "hook_strength": "weak|moderate|strong|very_strong",
    "narrative_structure": "problem_solution|feature_highlight|storytelling|before_after|disruptive_product_announcement|pure_lifestyle|direct_offer",
    "cta_style": "pill_button|rounded_rectangle_button|text_link_with_arrow|swipe_up_icon|implicit_editorial_style|ghost_button",
    "cta_urgency": "none|low|medium|high",
    "cta_text_pattern": "e.g. 'SHOP NOW' pattern — action_verb + object, 2-3 words",
    "requires_product_image": true,
    "requires_human_model": false,
    "requires_lifestyle_scene": false,
    "text_to_image_ratio": "text_dominant|balanced|image_dominant",
    "information_density": "minimal|moderate|information_rich",
    "reading_flow": "top_to_bottom|left_to_right|z_pattern|f_pattern|center_spiral"
  },

  "social_proof_elements": {
    "has_star_rating": false,
    "star_rating_value": null,
    "has_review_count": false,
    "review_count_pattern": "e.g. '10,000+ reviews' or null",
    "has_testimonial_text": false,
    "has_user_photo": false,
    "has_press_mention": false,
    "has_certification_badge": false,
    "has_follower_count": false,
    "trust_signal_count": 0,
    "social_proof_style": "subtle|prominent|hero_element|none"
  },

  "cta_structure": {
    "has_cta_button": true,
    "cta_button_style": "filled|outlined|ghost|text_only|null",
    "cta_button_shape": "pill|rounded_rectangle|sharp_rectangle|null",
    "cta_button_color": "#HEXCODE or null",
    "cta_text_color": "#HEXCODE or null",
    "cta_font_size_class": "body|h3|h2",
    "cta_border_radius_px": 8,
    "cta_padding_px": { "vertical": 12, "horizontal": 32 },
    "has_cta_subtext": false,
    "cta_position_in_frame": "bottom|middle|top|floating|null",
    "cta_width_percent": 60
  },

  "decorative_design_elements": {
    "has_geometric_shapes": false,
    "has_gradient_overlays": false,
    "has_pattern_texture": false,
    "has_border_frame": false,
    "has_badge_or_sticker": false,
    "has_icon_set": false,
    "has_progress_or_list_indicators": false,
    "has_price_tag_element": false,
    "has_discount_callout": false,
    "has_divider_lines": false,
    "has_drop_shadows": false,
    "element_descriptions": ["describe each decorative element with exact position and color"]
  },

  "emotional_triggers": {
    "primary_emotion_targeted": "desire|trust|urgency|fear_of_missing_out|curiosity|aspiration|belonging|pride",
    "secondary_emotion": "string or null",
    "psychological_techniques": ["social_proof", "scarcity", "authority", "reciprocity", "identity_alignment", "anchoring", "exclusivity"],
    "target_audience_signal": "describe implied audience from visual cues",
    "perceived_brand_tier": "budget|mid_range|premium|luxury|ultra_luxury"
  },

  "brand_integration_zones": {
    "primary_logo_zone": {
      "position": "top_left|top_center|top_right|bottom_left|bottom_center|bottom_right|on_product",
      "y_start": 0,
      "y_end": 80,
      "x_start": 0,
      "x_end": 200,
      "max_width_percent": 20,
      "recommended_logo_style": "wordmark|icon|monogram|full_lockup"
    },
    "secondary_brand_zone": {
      "position": "description of secondary brand placement opportunity",
      "available": false
    },
    "product_branding_area": "describe where brand logo/name appears ON the product in the original ad"
  },

  "product_placement_spec": {
    "product_center_x_percent": 50,
    "product_center_y_percent": 55,
    "product_width_percent": 60,
    "product_height_percent": 45,
    "product_bounding_box": {
      "x_start": 216,
      "y_start": 576,
      "x_end": 864,
      "y_end": 1440
    },
    "product_angle": "front|3_quarter|side|top_down|angled",
    "product_z_index": "foreground|midground|background",
    "product_scale_relative_to_frame": "dominant|balanced|accent",
    "cutout_required": true,
    "shadow_type_needed": "drop_shadow|reflection|ambient|none",
    "product_mask_shape": "rectangle|oval|organic|none",
    "overlap_with_text": false,
    "overlap_zones": []
  },

  "recreation_blueprint": {
    "complexity_level": "simple|moderate|complex|very_complex",
    "estimated_generation_difficulty": "easy|moderate|hard|very_hard",
    "key_success_factors": ["list the 5-8 most important visual elements that make this ad effective"],
    "critical_zones": ["list zone IDs that are ESSENTIAL to replicate exactly"],
    "flexible_zones": ["list zone IDs that can be adapted freely"],
    "color_replacement_strategy": "describe EXACTLY how to adapt the color palette for a different brand (which colors to keep, which to replace)",
    "font_replacement_strategy": "describe exact font equivalents to use and weight pairings",
    "product_placement_instructions": "PIXEL-PRECISE instructions for placing the new product (exact coordinates, scale, angle, shadow)",
    "brand_swap_instructions": "EXACT instructions for swapping the competitor brand with a new brand (logo placement, size, color adaptation)",
    "overall_recreation_prompt": "A COMPREHENSIVE 200+ word paragraph instruction for an AI image generator to recreate this EXACT ad layout and visual style with a different brand and product. Include SPECIFIC measurements, colors (hex), positions (pixels/percentages), font sizes, spacing, lighting, and mood. This prompt must be so precise that two different AI models would generate nearly identical layouts."
  }
}

STRICT VALIDATION RULES:
1. No zone overlaps (y_start of N+1 >= y_end of N)
2. No assumed image dimensions — read from actual image
3. No competitor brand/product names anywhere in the output
4. No copied headline text
5. All controlled vocabulary values must match allowed lists
6. recreation_blueprint.overall_recreation_prompt MUST be 200+ words with pixel measurements
7. color_palette.all_extracted_colors must include minimum 5 colors
8. Every zone MUST have a recreation_directive with EXACT measurements
9. product_placement_spec MUST have pixel-level bounding box
10. photography_extraction MUST be filled completely
11. brand_integration_zones MUST identify at least one logo placement zone
12. spacing_and_rhythm MUST have measured pixel values

Return VALID JSON ONLY. No markdown. No explanations. No text before or after JSON.`;



// ═══════════════════════════════════════════════════════════
// MEDIA TYPE MAP
// ═══════════════════════════════════════════════════════════

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const MEDIA_TYPE_MAP: Record<string, ClaudeImageMediaType> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

/**
 * Ad Concepts Service - Phase 2: Ad Recreation
 *
 * Handles real Claude Vision analysis of uploaded ad images.
 * Extracts Visual DNA (layout patterns, visual style, content strategy) for ad recreation.
 */
@Injectable()
export class AdConceptsService {
    private readonly logger = new Logger(AdConceptsService.name);
    private readonly model = 'claude-sonnet-4-20250514';
    private anthropicClient: Anthropic | null = null;

    constructor(
        @InjectRepository(AdConcept)
        private adConceptsRepository: Repository<AdConcept>,
        private readonly configService: ConfigService,
    ) { }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE CONCEPT (main entry point)
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyze an uploaded ad image with Claude Vision and save the concept.
     *
     * Pipeline:
     * 1. Read image file → Buffer → Base64
     * 2. Detect media type from file extension
     * 3. Send to Claude Vision with Visual DNA extraction prompt
     * 4. Parse and validate JSON response
     * 5. Save to ad_concepts table
     */
    async analyze(userId: string, imageUrl: string, fileBuffer: Buffer, mimeType: string): Promise<AdConcept> {
        this.logger.log(`Analyzing concept for user ${userId}: ${imageUrl}`);

        // Real Claude Vision analysis
        const analysisResult = await this.analyzeImageWithClaude(fileBuffer, mimeType);

        // Auto-populate name and tags from Claude's analysis
        const autoName = analysisResult.concept_name || null;
        const autoTags = Array.isArray(analysisResult.concept_tags) ? analysisResult.concept_tags : [];

        this.logger.log(`Auto-generated name: "${autoName}", tags: [${autoTags.join(', ')}]`);

        const concept = this.adConceptsRepository.create({
            user_id: userId,
            original_image_url: imageUrl,
            analysis_json: analysisResult,
            name: autoName,
            tags: autoTags,
        });

        const saved = await this.adConceptsRepository.save(concept);
        this.logger.log(`Saved Ad Concept: ${saved.id}`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET CONCEPT BY ID (with ownership check)
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdConcept> {
        const concept = await this.adConceptsRepository.findOne({
            where: { id },
        });

        if (!concept) {
            throw new NotFoundException(AdConceptMessage.CONCEPT_NOT_FOUND);
        }

        if (concept.user_id !== userId) {
            throw new ForbiddenException(AdConceptMessage.CONCEPT_ACCESS_DENIED);
        }

        return concept;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL CONCEPTS FOR USER (with optional tag filtering)
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string, tags?: string[]): Promise<AdConcept[]> {
        const qb = this.adConceptsRepository
            .createQueryBuilder('concept')
            .where('concept.user_id = :userId', { userId });

        // Filter by tags using JSONB overlap operator (?|)
        if (tags && tags.length > 0) {
            qb.andWhere('concept.tags ::jsonb ?| ARRAY[:...tags]', { tags });
        }

        qb.orderBy('concept.created_at', 'DESC');

        return qb.getMany();
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE CONCEPT (name, notes, tags, analysis_json)
    // ═══════════════════════════════════════════════════════════

    async updateConcept(
        id: string,
        userId: string,
        updates: { name?: string; notes?: string; tags?: string[]; analysis_json?: object },
    ): Promise<AdConcept> {
        // First verify ownership
        const concept = await this.findOne(id, userId);

        // Apply only provided fields
        if (updates.name !== undefined) concept.name = updates.name;
        if (updates.notes !== undefined) concept.notes = updates.notes;
        if (updates.tags !== undefined) concept.tags = updates.tags;
        if (updates.analysis_json !== undefined) concept.analysis_json = updates.analysis_json as any;

        const saved = await this.adConceptsRepository.save(concept);
        this.logger.log(`Updated Ad Concept: ${id} (fields: ${Object.keys(updates).join(', ')})`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // INCREMENT USE COUNT (called when concept is used in generation)
    // ═══════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════
    // DELETE CONCEPT (with ownership check)
    // ═══════════════════════════════════════════════════════════

    async remove(id: string, userId: string): Promise<void> {
        const concept = await this.findOne(id, userId);
        await this.adConceptsRepository.remove(concept);
        this.logger.log(`Deleted Ad Concept: ${id}`);
    }

    async incrementUseCount(id: string): Promise<void> {
        await this.adConceptsRepository
            .createQueryBuilder()
            .update(AdConcept)
            .set({ use_count: () => 'use_count + 1' })
            .where('id = :id', { id })
            .execute();

        this.logger.log(`Incremented use_count for concept: ${id}`);
    }


    // ═══════════════════════════════════════════════════════════
    // REAL CLAUDE VISION PIPELINE
    // ═══════════════════════════════════════════════════════════

    private async analyzeImageWithClaude(fileBuffer: Buffer, mimeType: string): Promise<AdConceptAnalysis> {
        this.logger.log(`Analyzing image with Claude Vision`);

        // Step 1: Convert buffer to Base64
        let imageBase64: string;
        let mediaType: ClaudeImageMediaType;
        try {
            imageBase64 = fileBuffer.toString('base64');
            mediaType = (MEDIA_TYPE_MAP['.' + (mimeType.split('/')[1] || 'jpeg')] || mimeType) as ClaudeImageMediaType;
            this.logger.log(`Image loaded: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB (${mediaType})`);
        } catch (error) {
            this.logger.error(`Failed to process image buffer: ${error.message}`);
            throw new BadRequestException(AdConceptMessage.AI_IMAGE_UNREADABLE);
        }

        // Step 2: Initialize Anthropic client
        const client = this.getAnthropicClient();

        // Step 3: Send to Claude Vision
        let responseText: string;
        try {
            const message = await client.messages.create({
                model: this.model,
                max_tokens: 8192,
                system: CONCEPT_ANALYSIS_SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mediaType,
                                    data: imageBase64,
                                },
                            },
                            {
                                type: 'text',
                                text: CONCEPT_ANALYSIS_USER_PROMPT,
                            },
                        ],
                    },
                ],
            });

            // Extract text from response
            const textBlock = message.content.find((block) => block.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
                throw new Error('No text response from Claude');
            }
            responseText = textBlock.text;

            this.logger.log(`Claude Vision response received (${message.usage?.input_tokens} in / ${message.usage?.output_tokens} out tokens)`);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Claude Vision API call failed: ${error.message}`);
            throw new InternalServerErrorException(AdConceptMessage.AI_ANALYSIS_FAILED);
        }

        // Step 4: Parse JSON and validate
        const analysis = this.parseAndValidateAnalysis(responseText);

        this.logger.log(`[STRICT] Concept extracted: ${analysis.layout.type} (${analysis.layout.format || 'auto'}), ${analysis.layout.zones.length} zones, mood: ${analysis.visual_style.mood}, hook: ${analysis.content_pattern.hook_type}`);
        return analysis;
    }

    // ═══════════════════════════════════════════════════════════
    // STRICT EXTRACTION PARSER + VALIDATION
    // ═══════════════════════════════════════════════════════════

    // Controlled vocabularies for validation
    private static readonly ALLOWED_LAYOUT_TYPES = [
        'product_hero_center', 'product_left_text_right', 'product_right_text_left',
        'split_screen', 'text_only', 'testimonial_grid', 'product_with_overlays',
        'ugc_style', 'app_screenshot', 'feature_stack', 'minimalist_product', 'custom_layout',
        // Legacy values (backward compat)
        'centered_hero', 'notes_app', 'tweet_style', 'text_overlay', 'product_showcase',
    ];

    private static readonly ALLOWED_CONTENT_TYPES = [
        'headline', 'subheadline', 'body', 'feature_badges', 'product_image', 'image',
        'testimonial_overlay', 'composite_product_social_proof', 'cta_button',
        'cta_subtext', 'social_proof_line', 'background_only', 'logo', 'ui_element',
    ];

    private static readonly ALLOWED_HOOK_TYPES = [
        'pattern_interrupt', 'contrast_statement', 'direct_benefit', 'problem_agitation',
        'bold_claim', 'social_proof_hook', 'question_hook', 'feature_announcement',
        'comparison_hook',
        // Legacy values (backward compat)
        'question', 'controversial_statement', 'revolutionary_claim', 'social_proof',
    ];

    private parseAndValidateAnalysis(responseText: string): AdConceptAnalysis {
        // Strip markdown code fences if Claude wrapped the JSON
        let cleaned = responseText.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        let parsed: any;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            this.logger.error(`Failed to parse Claude response as JSON: ${cleaned.substring(0, 200)}...`);
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        // ── Validate required top-level keys ──
        if (!parsed.layout || !parsed.visual_style) {
            this.logger.error('Missing required keys: layout or visual_style');
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        if (!parsed.layout.type) {
            this.logger.error('Missing layout.type');
            throw new InternalServerErrorException(AdConceptMessage.AI_INVALID_JSON);
        }

        // ── Validate layout.type against controlled vocabulary ──
        if (!AdConceptsService.ALLOWED_LAYOUT_TYPES.includes(parsed.layout.type)) {
            this.logger.warn(`[STRICT] layout.type "${parsed.layout.type}" not in allowed list — keeping but flagging`);
        }

        // ── Determine image height (prefer real dimensions from image_meta) ──
        let maxHeight: number;
        if (parsed.image_meta?.height && parsed.image_meta.height > 100) {
            maxHeight = parsed.image_meta.height;
            this.logger.log(`[STRICT] Using real image height: ${maxHeight}px (${parsed.image_meta.width}x${maxHeight})`);
        } else {
            const format = parsed.layout.format;
            const resolution = FORMAT_RESOLUTIONS[format];
            maxHeight = resolution ? resolution.height : 1920;
            this.logger.warn(`[STRICT] No image_meta — falling back to format-based height: ${maxHeight}px`);
        }

        // ── Auto-detect format from image_meta if missing ──
        if (!parsed.layout.format && parsed.image_meta?.width && parsed.image_meta?.height) {
            const ratio = parsed.image_meta.width / parsed.image_meta.height;
            if (ratio < 0.7) parsed.layout.format = '9:16';
            else if (ratio < 0.85) parsed.layout.format = '4:5';
            else if (ratio < 1.15) parsed.layout.format = '1:1';
            else parsed.layout.format = '16:9';
            this.logger.log(`[STRICT] Auto-detected format: ${parsed.layout.format} (ratio: ${ratio.toFixed(2)})`);
        }
        if (!parsed.layout.format) parsed.layout.format = '9:16';

        // ── Validate zones ──
        if (!Array.isArray(parsed.layout.zones)) {
            parsed.layout.zones = [];
        }

        for (let i = 0; i < parsed.layout.zones.length; i++) {
            const zone = parsed.layout.zones[i];
            if (!zone.id) zone.id = `zone_${i + 1}`;

            // Coerce to integers
            zone.y_start = typeof zone.y_start === 'number' ? Math.round(zone.y_start) : 0;
            zone.y_end = typeof zone.y_end === 'number' ? Math.round(zone.y_end) : maxHeight;

            // Auto-fix: if values look like percentages (0-100 range for tall formats)
            if (maxHeight > 100 && zone.y_end <= 100 && zone.y_start <= 100) {
                this.logger.warn(`[STRICT] Zone "${zone.id}" has percentage-like values (${zone.y_start}-${zone.y_end}), converting to pixels`);
                zone.y_start = Math.round((zone.y_start / 100) * maxHeight);
                zone.y_end = Math.round((zone.y_end / 100) * maxHeight);
            }

            // Clamp to valid range
            zone.y_start = Math.max(0, Math.min(zone.y_start, maxHeight));
            zone.y_end = Math.max(0, Math.min(zone.y_end, maxHeight));

            // Ensure y_end > y_start
            if (zone.y_end <= zone.y_start) {
                zone.y_end = Math.min(zone.y_start + 100, maxHeight);
            }

            // Calculate height_percent if not provided
            if (zone.height_percent === undefined) {
                zone.height_percent = Math.round(((zone.y_end - zone.y_start) / maxHeight) * 100);
            }

            // Validate content_type against controlled vocabulary
            if (zone.content_type && !AdConceptsService.ALLOWED_CONTENT_TYPES.includes(zone.content_type)) {
                this.logger.warn(`[STRICT] Zone "${zone.id}" content_type "${zone.content_type}" not in allowed list`);
                // Map legacy "image" to "product_image" if it looks like a product zone
                if (zone.content_type === 'image') {
                    // Keep as-is — "image" is in allowed list
                }
            }

            if (!zone.content_type) zone.content_type = 'headline';
            if (!zone.typography_style) zone.typography_style = 'Sans-Serif Regular';
            if (!zone.description) zone.description = '';
        }

        // ── ZONE OVERLAP DETECTION ──
        const sortedZones = [...parsed.layout.zones].sort((a: any, b: any) => a.y_start - b.y_start);
        for (let i = 1; i < sortedZones.length; i++) {
            const prev = sortedZones[i - 1];
            const curr = sortedZones[i];
            if (curr.y_start < prev.y_end) {
                this.logger.warn(`[STRICT] ⚠️ ZONE OVERLAP: "${prev.id}" (${prev.y_start}-${prev.y_end}) overlaps with "${curr.id}" (${curr.y_start}-${curr.y_end})`);
                // Auto-fix: snap current zone's start to previous zone's end
                curr.y_start = prev.y_end;
                if (curr.y_end <= curr.y_start) {
                    curr.y_end = curr.y_start + 50;
                }
            }
        }

        // ── Validate visual_style ──
        if (!parsed.visual_style.mood) parsed.visual_style.mood = 'neutral';
        if (!parsed.visual_style.background || typeof parsed.visual_style.background !== 'object') {
            const oldHex = parsed.visual_style.background_hex || parsed.visual_style.dominant_background_color;
            parsed.visual_style.background = {
                type: 'solid_color',
                hex: oldHex || '#FFFFFF',
            };
        }
        if (!parsed.visual_style.background.type) parsed.visual_style.background.type = 'solid_color';
        if (parsed.visual_style.background.hex === undefined) parsed.visual_style.background.hex = '#FFFFFF';
        if (!parsed.visual_style.overlay) parsed.visual_style.overlay = 'none';

        // ── Validate content_pattern ──
        if (!parsed.content_pattern || typeof parsed.content_pattern !== 'object') {
            parsed.content_pattern = {
                hook_type: 'direct_benefit',
                narrative_structure: 'feature_highlight',
                cta_style: 'pill_button',
                requires_product_image: false,
            };
        }
        if (!parsed.content_pattern.hook_type) parsed.content_pattern.hook_type = 'direct_benefit';

        // Validate hook_type against controlled vocabulary
        if (!AdConceptsService.ALLOWED_HOOK_TYPES.includes(parsed.content_pattern.hook_type)) {
            this.logger.warn(`[STRICT] hook_type "${parsed.content_pattern.hook_type}" not in controlled vocabulary`);
        }

        if (!parsed.content_pattern.narrative_structure) parsed.content_pattern.narrative_structure = 'feature_highlight';
        if (!parsed.content_pattern.cta_style) parsed.content_pattern.cta_style = 'pill_button';
        if (parsed.content_pattern.requires_product_image === undefined) parsed.content_pattern.requires_product_image = false;

        // ── Validate concept_name ──
        if (parsed.concept_name && typeof parsed.concept_name !== 'string') {
            parsed.concept_name = String(parsed.concept_name);
        }

        // ── Validate concept_tags ──
        if (parsed.concept_tags) {
            if (!Array.isArray(parsed.concept_tags)) {
                parsed.concept_tags = [];
            } else {
                parsed.concept_tags = parsed.concept_tags
                    .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
                    .map((t: string) => t.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
            }
        } else {
            const autoTags: string[] = [];
            if (parsed.layout?.type) autoTags.push(parsed.layout.type);
            if (parsed.visual_style?.mood) autoTags.push(parsed.visual_style.mood);
            if (parsed.content_pattern?.hook_type) autoTags.push(parsed.content_pattern.hook_type);
            if (parsed.layout?.format) autoTags.push(parsed.layout.format.replace(':', 'x'));
            parsed.concept_tags = autoTags;
        }

        // ── Auto-generate concept_name if missing ──
        if (!parsed.concept_name) {
            const layoutLabel = (parsed.layout?.type || 'unknown').replace(/_/g, ' ');
            const moodLabel = parsed.visual_style?.mood || '';
            parsed.concept_name = `${this.capitalizeWords(layoutLabel)} ${this.capitalizeWords(moodLabel)} Ad`.trim();
        }

        // ── Ensure new enriched sections have defaults if missing ──
        if (!parsed.color_palette || typeof parsed.color_palette !== 'object') {
            parsed.color_palette = {
                primary_background: parsed.visual_style?.dominant_background_color || '#000000',
                all_extracted_colors: [],
                color_temperature: 'neutral',
                contrast_level: 'medium',
            };
        }
        if (!parsed.typography_system || typeof parsed.typography_system !== 'object') {
            parsed.typography_system = {
                headline_font_class: 'sans-serif',
                headline_weight: 'bold',
                body_font_class: 'sans-serif',
                body_weight: 'regular',
                uses_mixed_weights: false,
                uses_mixed_colors: false,
            };
        }
        if (!parsed.social_proof_elements || typeof parsed.social_proof_elements !== 'object') {
            parsed.social_proof_elements = { trust_signal_count: 0 };
        }
        if (!parsed.decorative_design_elements || typeof parsed.decorative_design_elements !== 'object') {
            parsed.decorative_design_elements = { element_descriptions: [] };
        }
        if (!parsed.emotional_triggers || typeof parsed.emotional_triggers !== 'object') {
            parsed.emotional_triggers = {
                primary_emotion_targeted: 'desire',
                psychological_techniques: [],
            };
        }
        if (!parsed.recreation_blueprint || typeof parsed.recreation_blueprint !== 'object') {
            parsed.recreation_blueprint = {
                complexity_level: 'moderate',
                key_success_factors: [],
                critical_zones: [],
                flexible_zones: [],
                overall_recreation_prompt: '',
            };
        }

        // ── V6: Ensure new enriched sections have defaults ──
        if (!parsed.photography_extraction || typeof parsed.photography_extraction !== 'object') {
            parsed.photography_extraction = {
                camera_angle: 'front_straight',
                lighting_direction: 'front_flat',
                lighting_type: 'studio_softbox',
                shadow_hardness: 'soft_diffused',
                product_photo_style: 'studio_packshot',
            };
        }
        if (!parsed.spacing_and_rhythm || typeof parsed.spacing_and_rhythm !== 'object') {
            parsed.spacing_and_rhythm = {
                edge_margin_px: { top: 40, right: 40, bottom: 40, left: 40 },
                inter_element_gap_px: 24,
                consistent_rhythm: true,
                alignment_axis: 'center',
            };
        }
        if (!parsed.brand_integration_zones || typeof parsed.brand_integration_zones !== 'object') {
            parsed.brand_integration_zones = {
                primary_logo_zone: {
                    position: 'top_center',
                    recommended_logo_style: 'wordmark',
                },
            };
        }
        if (!parsed.product_placement_spec || typeof parsed.product_placement_spec !== 'object') {
            parsed.product_placement_spec = {
                product_center_x_percent: 50,
                product_center_y_percent: 50,
                product_scale_relative_to_frame: 'dominant',
                cutout_required: false,
            };
        }

        // ── Clean up legacy flat fields ──
        delete parsed.visual_style.background_hex;
        delete parsed.visual_style.font_color_primary;

        // ── Log enriched extraction summary ──
        this.logger.log(`[DEEP EXTRACTION] ✅ Zones: ${parsed.layout.zones.length}, layout: ${parsed.layout.type}, hook: ${parsed.content_pattern.hook_type}, mood: ${parsed.visual_style.mood}`);
        if (parsed.image_meta) {
            this.logger.log(`[DEEP EXTRACTION] Image: ${parsed.image_meta.width}x${parsed.image_meta.height} (${parsed.image_meta.orientation})`);
        }
        if (parsed.color_palette?.all_extracted_colors?.length) {
            this.logger.log(`[DEEP EXTRACTION] Colors: ${parsed.color_palette.all_extracted_colors.join(', ')}`);
        }
        if (parsed.recreation_blueprint?.complexity_level) {
            this.logger.log(`[DEEP EXTRACTION] Complexity: ${parsed.recreation_blueprint.complexity_level}`);
        }
        if (parsed.emotional_triggers?.primary_emotion_targeted) {
            this.logger.log(`[DEEP EXTRACTION] Emotion: ${parsed.emotional_triggers.primary_emotion_targeted}`);
        }

        return parsed as AdConceptAnalysis;
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    private getAnthropicClient(): Anthropic {
        if (this.anthropicClient) return this.anthropicClient;

        const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
        if (!apiKey) {
            throw new InternalServerErrorException(AdConceptMessage.AI_API_KEY_MISSING);
        }

        this.anthropicClient = new Anthropic({ apiKey });
        this.logger.log('Anthropic client initialized for concept analysis');

        return this.anthropicClient;
    }

    // ═══════════════════════════════════════════════════════════
    // STRING HELPERS
    // ═══════════════════════════════════════════════════════════

    private capitalizeWords(str: string): string {
        return str.replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
