// PRODUCTION: gemini-2.5-flash-image (Imagen 3 has been shut down)
// Reference: https://ai.google.dev/gemini-api/docs/image-generation
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image-preview';

// Image generation result type
export type GeminiImageResult = {
	mimeType: string;  // 'image/png' or 'image/jpeg'
	data?: string;     // base64 encoded image data
	text?: string;     // Optional text response
};

// Valid aspect ratios for Gemini image generation
export const VALID_ASPECT_RATIOS = [
	'1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
] as const;

// Valid image sizes — gemini-2.0-flash only supports 1K
// gemini-3-pro-image-preview supports 1K, 2K, 4K
export const VALID_IMAGE_SIZES = ['1K', '2K', '4K'] as const;




export const FILE_SIZE_LIMIT = { fileSize: 30 * 1024 * 1024 }; // 30MB

export const FRONT_BACK_REFERENCE_IMAGES = [
	{ name: 'front_images', maxCount: 5 },
	{ name: 'back_images', maxCount: 5 },
	{ name: 'reference_images', maxCount: 10 },
]