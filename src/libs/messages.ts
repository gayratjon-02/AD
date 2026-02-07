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
