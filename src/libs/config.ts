
// 🚀 Use Gemini 3 Pro Image Preview for image generation
// QATIYAN: Faqat gemini-3-pro-image-preview modelidan foydalanish kerak
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';

export type GeminiImageResult = {
	mimeType: string;
	data?: string;
	text?: string;
};