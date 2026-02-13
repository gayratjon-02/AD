/**
 * Centralized Messages for Ad Recreation Module
 *
 * All error and success messages are defined here to ensure
 * consistency and easy maintenance across the codebase.
 */

// ═══════════════════════════════════════════════════════════
// AD BRAND MESSAGES
// ═══════════════════════════════════════════════════════════

export enum AdBrandMessage {
    // Success
    BRAND_CREATED = 'Ad Brand created successfully',
    BRAND_UPDATED = 'Ad Brand updated successfully',
    ASSETS_UPLOADED = 'Brand assets uploaded successfully',
    PLAYBOOK_ANALYZED = 'Brand playbook analyzed successfully',

    // Not Found
    BRAND_NOT_FOUND = 'Ad Brand not found',

    // Permission
    BRAND_ACCESS_DENIED = 'You do not have access to this brand',

    // Validation - Assets
    LOGO_LIGHT_REQUIRED = 'logo_light file is required',
    LOGO_DARK_REQUIRED = 'logo_dark file is required',
    BOTH_LOGOS_REQUIRED = 'Both logo_light and logo_dark files are required',

    // Validation - Playbook
    PLAYBOOK_FILE_REQUIRED = 'PDF file is required for brand playbook analysis',
    INVALID_PLAYBOOK_TYPE = 'Playbook type must be one of: brand, ads, copy',

    // File Validation
    ONLY_IMAGES_ALLOWED = 'Only image files are allowed (jpg, jpeg, png, gif, svg, webp)',
    ONLY_PDF_ALLOWED = 'Only PDF files are allowed',

    // AI Pipeline
    AI_API_KEY_MISSING = 'Anthropic API key is not configured',
    AI_ANALYSIS_FAILED = 'AI failed to analyze the playbook PDF',
    AI_INVALID_JSON = 'AI returned invalid JSON structure for playbook analysis',
    AI_PDF_UNREADABLE = 'The uploaded PDF could not be processed by AI',
}

// ═══════════════════════════════════════════════════════════
// AD CONCEPT MESSAGES
// ═══════════════════════════════════════════════════════════

export enum AdConceptMessage {
    // Success
    CONCEPT_ANALYZED = 'Ad concept analyzed successfully',
    CONCEPT_FOUND = 'Ad concept retrieved successfully',
    CONCEPT_UPDATED = 'Ad concept updated successfully',
    CONCEPT_DELETED = 'Ad concept deleted successfully',

    // Not Found
    CONCEPT_NOT_FOUND = 'Ad Concept not found',

    // Permission
    CONCEPT_ACCESS_DENIED = 'You do not have access to this concept',

    // Validation
    IMAGE_FILE_REQUIRED = 'Image file is required for concept analysis',
    ONLY_IMAGES_ALLOWED = 'Only image files are allowed (jpg, jpeg, png, webp)',

    // AI Pipeline
    AI_API_KEY_MISSING = 'Anthropic API key is not configured',
    AI_ANALYSIS_FAILED = 'AI failed to analyze the ad concept image',
    AI_INVALID_JSON = 'AI returned invalid JSON structure for concept analysis',
    AI_IMAGE_UNREADABLE = 'The uploaded image could not be processed by AI',
}

// ═══════════════════════════════════════════════════════════
// AD GENERATION MESSAGES
// ═══════════════════════════════════════════════════════════

export enum AdGenerationMessage {
    // Success
    GENERATION_CREATED = 'Ad generation started successfully',
    GENERATION_FOUND = 'Ad generation retrieved successfully',

    // Not Found
    GENERATION_NOT_FOUND = 'Ad Generation not found',

    // Permission
    GENERATION_ACCESS_DENIED = 'You do not have access to this generation',

    // Validation
    INVALID_MARKETING_ANGLE = 'Invalid marketing angle ID',
    INVALID_AD_FORMAT = 'Invalid ad format ID',
    BRAND_PLAYBOOK_REQUIRED = 'Brand must have a brand playbook before generating ads',
    BRAND_PRODUCT_IDENTITY_REQUIRED = 'Brand playbook must include product_identity. Please re-analyze or update the brand playbook.',

    // AI Pipeline
    AI_GENERATION_FAILED = 'AI failed to generate ad copy',

    // Render
    RENDER_STARTED = 'Image rendering started successfully',
    RENDER_COMPLETED = 'Ad image rendered successfully',
    RENDER_FAILED = 'AI failed to render the ad image',
    RENDER_NO_COPY = 'Generation must have ad copy before rendering. Run generate first.',
    GEMINI_API_KEY_MISSING = 'Gemini API key is not configured',
}
