import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { AIMessage, FileMessage } from '../libs/enums';
import { GEMINI_MODEL, VALID_IMAGE_SIZES, GeminiImageResult } from '../libs/config';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { AnalyzedDAJSON } from '../common/interfaces/da-json.interface';
import { PRODUCT_ANALYSIS_PROMPT } from './prompts/product-analysis.prompt';
import { DA_ANALYSIS_PROMPT } from './prompts/da-analysis.prompt';
import * as fs from 'fs';
import * as path from 'path';


// Custom error types for better error handling
export class GeminiTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GeminiTimeoutError';
	}
}

export class GeminiGenerationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GeminiGenerationError';
	}
}

@Injectable()
export class GeminiService {
	private client: GoogleGenAI | null = null;
	private readonly logger = new Logger(GeminiService.name);

	// gemini-2.5-flash-image (Imagen 3 shut down)
	private readonly MODEL = GEMINI_MODEL;
	private readonly ANALYSIS_MODEL = 'gemini-2.5-flash'; // Optimized for multimodal analysis

	// ⏱️ Timeout: 3 daqiqa (180 sekund) - image generation can take longer
	private readonly TIMEOUT_MS = 180 * 1000; // 3 minutes in milliseconds

	/** DTO aspect_ratio -> Gemini generationConfig (1:1, 9:16, 4:5, 16:9) */
	private static readonly ASPECT_RATIO_MAP: Record<string, string> = {
		'1:1': '1:1',
		'9:16': '9:16',  // Portrait/Story
		'4:5': '4:5',
		'16:9': '16:9',
		'3:4': '3:4',
		'4:3': '4:3',
		'2:3': '2:3',
		'3:2': '3:2',
		'21:9': '21:9',
	};

	constructor(private readonly configService: ConfigService) { }

	/**
	 * Map DTO aspect_ratio to Gemini API config (1:1, 9:16, 4:5, 16:9).
	 */
	private mapAspectRatioToGemini(dtoRatio?: string): string {
		if (!dtoRatio || typeof dtoRatio !== 'string') return '4:5';
		const normalized = dtoRatio.trim();
		return GeminiService.ASPECT_RATIO_MAP[normalized] ?? '4:5';
	}

	/**
	 * Normalize resolution to Gemini imageSize (1K, 2K, 4K).
	 */
	private mapResolutionToGemini(resolution?: string): string {
		if (!resolution || typeof resolution !== 'string') return '1K';
		const upper = resolution.trim().toUpperCase();
		return VALID_IMAGE_SIZES.includes(upper as any) ? upper : '1K';
	}

	/**
	 * Promise with timeout wrapper
	 */
	private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new GeminiTimeoutError(
					`⏱️ ${operationName} timed out after ${timeoutMs / 1000} seconds (${timeoutMs / 60000} minutes)`
				));
			}, timeoutMs);

			promise
				.then((result) => {
					clearTimeout(timeoutId);
					resolve(result);
				})
				.catch((error) => {
					clearTimeout(timeoutId);
					reject(error);
				});
		});
	}

	/**
	 * 🚀 PRODUCTION-READY: Generate images using Gemini 2.5 Flash Image
	 * Uses the correct @google/genai SDK format with responseModalities
	 * @param userApiKey - Optional user-specific API key
	 */
	async generateImages(prompt: string, aspectRatio?: string, resolution?: string, userApiKey?: string): Promise<{ images: GeminiImageResult[] }> {
		const client = this.getClient(userApiKey);
		const startTime = Date.now();

		// Default aspect_ratio to 4:5 if missing; then map to Gemini format (4:5 -> 3:4; 1:1, 9:16, 16:9 supported)
		const ratioText = this.mapAspectRatioToGemini(aspectRatio ?? '4:5');
		const resolutionText = this.mapResolutionToGemini(resolution);


		// 🚀 CRITICAL: Sanitize prompt to avoid PII policy violations
		// Defensive check for empty prompt
		if (!prompt) {
			this.logger.error('❌ CRITICAL: generateImages called with EMPTY/UNDEFINED prompt!');
			throw new GeminiGenerationError('Prompt string is required');
		}

		const sanitizedPrompt = this.sanitizePromptForImageGeneration(prompt);

		// Enhanced prompt: STRICT—render exactly as specified
		const enhancedPrompt = `Render EXACTLY as specified. Do NOT add, remove, or change any element. 100% match to the product specification. No creative additions.

Professional product photography: ${sanitizedPrompt}.
High quality studio lighting, sharp details, clean background.`;

		this.logger.log(`🎨 ========== GEMINI IMAGE GENERATION START ==========`);
		this.logger.log(`📋 Model: ${this.MODEL}`);
		this.logger.log(`📐 Aspect ratio (DTO: ${aspectRatio ?? 'default'} -> API: ${ratioText})`);
		this.logger.log(`📏 Resolution (DTO: ${resolution ?? 'default'} -> API: ${resolutionText})`);
		this.logger.log(`⏱️ Timeout: ${this.TIMEOUT_MS / 1000} seconds`);
		this.logger.log(`📝 Original prompt (first 200 chars): ${prompt.substring(0, 200)}...`);
		this.logger.log(`📝 Sanitized prompt (first 200 chars): ${sanitizedPrompt.substring(0, 200)}...`);
		this.logger.log(`📝 Enhanced prompt (first 300 chars): ${enhancedPrompt.substring(0, 300)}...`);

		try {
			const imageConfig = {
				aspectRatio: ratioText,
				imageSize: resolutionText,
			};
			this.logger.log(`📐 Final Gemini generation config: ${JSON.stringify(imageConfig)}`);

			// 🚀 CRITICAL: Use EXACT format from Google's official documentation
			// Reference: https://ai.google.dev/gemini-api/docs/image-generation
			const generatePromise = client.models.generateContent({
				model: this.MODEL,
				contents: enhancedPrompt, // Can be string directly
				config: {
					responseModalities: ['TEXT', 'IMAGE'], // CRITICAL: Force image generation
					imageConfig,
					safetySettings: [
						{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
					]
				}
			});

			// Wrap with timeout
			const response = await this.withTimeout(
				generatePromise,
				this.TIMEOUT_MS,
				'Gemini image generation'
			);

			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
			this.logger.log(`⏱️ Gemini response received in ${elapsedTime}s`);

			// 🔍 MANDATORY LOGGING: Debug response structure
			this.logger.log(`📊 Candidates count: ${response.candidates?.length || 0}`);

			if (!response.candidates || response.candidates.length === 0) {
				this.logger.error(`❌ CRITICAL: No candidates in Gemini response!`);
				this.logger.error(`Full response:`, JSON.stringify(response, null, 2));
				throw new GeminiGenerationError('Gemini returned no candidates');
			}

			const candidate = response.candidates[0];
			const parts = candidate.content?.parts || [];

			this.logger.log(`📊 Parts count: ${parts.length}`);

			if (parts.length === 0) {
				this.logger.error(`❌ CRITICAL: No parts in Gemini response!`);
				this.logger.error(`Candidate:`, JSON.stringify(candidate, null, 2));
				const finishReason = (candidate as any).finishReason || (candidate as any).finish_reason;
				if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
					throw new GeminiGenerationError(
						'Image generation was blocked by platform safety policy. For DUO (Father+Son) or child model shots, the platform may block generation. Try SOLO (Adult) or FLAT LAY shots instead.'
					);
				}
				throw new GeminiGenerationError('Gemini returned no parts');
			}

			// 🔍 MANDATORY: Parse response parts and log each one
			const images: GeminiImageResult[] = [];
			let textResponse = '';

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i] as any;
				const partKeys = Object.keys(part);
				this.logger.log(`🔍 Part ${i} keys: [${partKeys.join(', ')}]`);

				// Check for text part
				if (part.text) {
					textResponse = part.text;
					this.logger.log(`📝 Part ${i} is TEXT (first 200 chars): ${part.text.substring(0, 200)}`);

					// 🚀 CRITICAL: Check if model REFUSED to generate images
					const lowerText = part.text.toLowerCase();
					if (
						lowerText.includes('cannot generate') ||
						lowerText.includes('unable to generate') ||
						lowerText.includes('i cannot') ||
						lowerText.includes('i am unable') ||
						lowerText.includes('violates') ||
						lowerText.includes('policy')
					) {
						this.logger.error(`❌ CRITICAL: Model REFUSED to generate image!`);
						this.logger.error(`Refusal text: ${part.text}`);
						throw new GeminiGenerationError(`Model refused: ${part.text.substring(0, 300)}`);
					}
				}

				// 🚀 CRITICAL: Check for image part (inlineData)
				if (part.inlineData) {
					const mimeType = part.inlineData.mimeType || 'image/png';
					const data = part.inlineData.data;

					this.logger.log(`✅ Part ${i} is IMAGE!`);
					this.logger.log(`   - mimeType: ${mimeType}`);
					this.logger.log(`   - data length: ${data?.length || 0} characters`);

					if (data && data.length > 0) {
						images.push({
							mimeType: mimeType,
							data: data // base64 string
						});
						this.logger.log(`✅ Image ${images.length} added successfully!`);
					} else {
						this.logger.warn(`⚠️ Part ${i} has inlineData but no data content!`);
					}
				}


				// Check for thought parts (Gemini 3 Pro uses thinking)
				if (part.thought) {
					this.logger.log(`💭 Part ${i} is THOUGHT (thinking process)`);
				}
			}

			// 🚀 CRITICAL: Verify we got images
			if (images.length === 0) {
				this.logger.error(`❌ CRITICAL: Gemini returned NO IMAGES!`);
				this.logger.error(`📝 Text response was: ${textResponse}`);
				this.logger.error(`📊 Total parts: ${parts.length}`);

				// Try to provide helpful error message
				if (textResponse) {
					throw new GeminiGenerationError(
						`Gemini did not generate any images. Model response: ${textResponse.substring(0, 300)}`
					);
				} else {
					throw new GeminiGenerationError(
						'Gemini did not generate any images and provided no explanation.'
					);
				}
			}

			this.logger.log(`🎉 SUCCESS: Generated ${images.length} image(s) in ${elapsedTime}s`);
			this.logger.log(`🎨 ========== GEMINI IMAGE GENERATION COMPLETE ==========`);

			return { images };

		} catch (error: any) {
			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

			// ⏱️ Handle timeout error
			if (error instanceof GeminiTimeoutError) {
				this.logger.error(`⏱️ TIMEOUT: Image generation timed out after ${elapsedTime}s`);
				throw new InternalServerErrorException(
					`Image generation timed out after ${this.TIMEOUT_MS / 60000} minutes. Please try again.`
				);
			}

			// Handle generation error (model refused, etc.)
			if (error instanceof GeminiGenerationError) {
				this.logger.error(`❌ Generation error after ${elapsedTime}s: ${error.message}`);
				throw new InternalServerErrorException(error.message);
			}

			// Handle SDK errors
			const errorMessage = error?.message || String(error);
			this.logger.error(`❌ Gemini SDK error after ${elapsedTime}s: ${errorMessage}`);

			// Log full error for debugging
			if (error.stack) {
				this.logger.error(`Stack trace: ${error.stack}`);
			}

			if (error instanceof InternalServerErrorException) {
				throw error;
			}

			throw new InternalServerErrorException(`Gemini error: ${errorMessage.substring(0, 200)}`);
		}
	}

	/**
	 * 🚀 Generate single image - main entry point
	 * Includes retry logic for resilience
	 * @param userApiKey - Optional user-specific API key
	 */
	async generateImage(
		prompt: string,
		_modelName?: string, // ignored, we always use gemini-2.5-flash-image
		aspectRatio?: string,
		resolution?: string,
		userApiKey?: string
	): Promise<GeminiImageResult> {
		const maxRetries = 2;
		const startTime = Date.now();

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				if (attempt > 0) {
					this.logger.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries}...`);
					await new Promise(resolve => setTimeout(resolve, 3000));
				}

				const result = await this.generateImages(prompt, aspectRatio, resolution, userApiKey);

				if (result.images.length > 0) {
					const image = result.images[0];
					this.logger.log(`✅ Image generated successfully!`);
					this.logger.log(`   - mimeType: ${image.mimeType}`);
					this.logger.log(`   - data length: ${image.data?.length || 0}`);
					return image;
				}

				throw new GeminiGenerationError('No images generated');

			} catch (error: any) {
				const isLastAttempt = attempt === maxRetries - 1;
				const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

				// Don't retry on quota exhaustion (429)
				if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('quota')) {
					this.logger.error(`❌ Gemini API quota exhausted — not retrying`);
					throw new InternalServerErrorException('Gemini API quota exhausted. Please wait and try again later.');
				}

				// Don't retry on timeout
				if (error instanceof InternalServerErrorException &&
					error.message.includes('timed out')) {
					this.logger.error(`⏱️ Timeout error - not retrying`);
					throw error;
				}

				// Don't retry on policy violations
				if (error.message && (
					error.message.includes('violates') ||
					error.message.includes('policy') ||
					error.message.includes('refused')
				)) {
					this.logger.error(`🚫 Policy violation - not retrying`);
					throw error;
				}

				if (isLastAttempt) {
					this.logger.error(`❌ All ${maxRetries} attempts failed after ${elapsedTime}s`);
					throw error;
				}

				this.logger.warn(`⚠️ Attempt ${attempt + 1} failed after ${elapsedTime}s: ${error.message}`);
			}
		}

		throw new InternalServerErrorException(AIMessage.GEMINI_API_ERROR);
	}

	/**
	 * 🆕 Generate image WITH reference images
	 * 
	 * This method sends product reference images (front/back) to Gemini
	 * along with the text prompt, enabling accurate reproduction of:
	 * - Exact pocket count and positions
	 * - Button count and placement
	 * - Logo/branding details
	 * - Fabric texture and color
	 * 
	 * @param prompt - The text prompt describing the shot
	 * @param referenceImages - Array of image URLs (front/back product images)
	 * @param aspectRatio - Output aspect ratio
	 * @param resolution - Output resolution
	 * @param userApiKey - Optional user-specific API key
	 */
	async generateImageWithReference(
		prompt: string,
		referenceImages: string[],
		aspectRatio?: string,
		resolution?: string,
		userApiKey?: string,
		options?: { daReferenceUrl?: string; shotType?: string }
	): Promise<GeminiImageResult> {
		const client = this.getClient(userApiKey);
		const startTime = Date.now();

		// Filter valid images
		const validImages = (referenceImages || []).filter(img => img && img.trim() !== '');

		const hasDAReference = !!options?.daReferenceUrl;
		const shotType = options?.shotType || '';
		const isProductOnlyShot = ['flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'].includes(shotType);
		this.logger.log(`🚀 generateImages: model=${this.MODEL}, ratio=${aspectRatio || '4:5'}, refs=${validImages.length}, hasDA=${hasDAReference}, shot=${shotType}, productOnly=${isProductOnlyShot}, prompt=${prompt.length} chars`);

		// If no valid reference images, fall back to regular generation
		if (validImages.length === 0) {
			this.logger.warn('No valid reference images — falling back to text-only generation');
			return this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		}

		// Build image parts from URLs
		const imageParts = await this.buildImageParts(validImages);

		this.logger.log(`📦 Image parts loaded: ${imageParts.length}/${validImages.length}`);

		if (imageParts.length === 0) {
			this.logger.warn('Failed to load any reference images — falling back to text-only');
			return this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		}

		// Map aspect ratio and resolution
		const ratioText = this.mapAspectRatioToGemini(aspectRatio ?? '4:5');
		const resolutionText = this.mapResolutionToGemini(resolution);

		// 🎯 CRITICAL: Choose prompt wrapper based on shot type
		// Product-only shots (flatlay, closeup_front) must NOT mention models/wearing
		let referencePrompt: string;
		if (isProductOnlyShot) {
			referencePrompt = this.buildProductOnlyReferencePrompt(prompt);
			this.logger.log(`🎯 Using PRODUCT-ONLY prompt wrapper for ${shotType}`);
		} else if (hasDAReference) {
			referencePrompt = this.buildDASceneReferencePrompt(prompt);
		} else {
			referencePrompt = this.buildAdConceptReferencePrompt(prompt);
		}

		this.logger.log(`📤 Sending to Gemini: ratio=${ratioText}, size=${resolutionText}, prompt=${referencePrompt.length} chars`);

		try {
			const imageConfig = {
				aspectRatio: ratioText,
				imageSize: resolutionText,
			};

			// 🚀 CRITICAL: Send text + reference images together
			const generatePromise = client.models.generateContent({
				model: this.MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: referencePrompt },
							...imageParts  // Reference images as visual guide
						]
					}
				],
				config: {
					responseModalities: ['TEXT', 'IMAGE'],
					imageConfig,
					safetySettings: [
						{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
					]
				}
			});

			// Wrap with timeout
			const response = await this.withTimeout(
				generatePromise,
				this.TIMEOUT_MS,
				'Gemini image generation with reference'
			);

			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

			// Parse response
			if (!response.candidates || response.candidates.length === 0) {
				this.logger.error(`❌ No candidates in response (${elapsedTime}s)`);
				throw new GeminiGenerationError('Gemini returned no candidates');
			}

			const candidate = response.candidates[0];
			const parts = candidate.content?.parts || [];

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i] as any;

				if (part.inlineData) {
					const mimeType = part.inlineData.mimeType || 'image/png';
					const data = part.inlineData.data;
					const dataLen = data?.length || 0;

					if (data && data.length > 0) {
						this.logger.log(`🎉 Image generated in ${elapsedTime}s (${(dataLen / 1024).toFixed(1)} KB)`);
						return { mimeType, data };
					}
				}

				if (part.text) {
					const lowerText = part.text.toLowerCase();
					if (lowerText.includes('cannot generate') || lowerText.includes('unable to')) {
						this.logger.error(`❌ Model refused: ${part.text.substring(0, 200)}`);
						throw new GeminiGenerationError(`Model refused: ${part.text.substring(0, 200)}`);
					}
				}
			}

			this.logger.error(`❌ No image data in response parts (${elapsedTime}s)`);
			throw new GeminiGenerationError('Gemini did not generate any images with reference');

		} catch (error: any) {
			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

			this.logger.error(`❌ Generation failed (${elapsedTime}s): ${error.message}`);

			// On 429 quota exhaustion — throw error (no Vertex fallback)
			if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('quota')) {
				throw new InternalServerErrorException('Gemini API quota exhausted. Please wait and try again later.');
			}

			this.logger.warn('🔄 Falling back to text-only generation...');

			return this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		}
	}



	/**
	 * Generate batch of images sequentially
	 */
	async generateBatch(prompts: string[], aspectRatio?: string, resolution?: string): Promise<GeminiImageResult[]> {
		const results: GeminiImageResult[] = [];

		for (const prompt of prompts) {
			try {
				const result = await this.generateImage(prompt, undefined, aspectRatio, resolution);
				results.push(result);
			} catch (error: any) {
				this.logger.error(`Batch generation failed for prompt: ${prompt.substring(0, 100)}...`);
				// Continue with next prompt
			}
		}

		return results;
	}

	/**
	 * Build prompt for DA scene reference mode (Product Visuals).
	 * The LAST image in referenceImages is the DA scene reference.
	 * Gemini must replicate the EXACT scene (background, lighting, props, composition).
	 */
	private buildDASceneReferencePrompt(prompt: string): string {
		// Detect if the product is a bottom garment (pants/joggers/shorts) from the inner prompt
		const isBottomProduct = prompt.toLowerCase().includes('white t-shirt') ||
			prompt.toLowerCase().includes('fully clothed top');

		const clothingBlock = isBottomProduct
			? `🚨 MANDATORY CLOTHING RULE — READ THIS FIRST 🚨
The product in the reference images is PANTS/JOGGERS/SHORTS (a bottom garment ONLY).
The model MUST wear a PLAIN WHITE CREW-NECK T-SHIRT on the upper body.
The white t-shirt MUST be visible from neck to waist — FULLY covering the entire torso.
ZERO bare skin on chest, stomach, or torso. The model is NEVER shirtless.
If you generate a shirtless model, the image is REJECTED. Always add the white t-shirt.
The reference images show ONLY the pants — that does NOT mean the model is shirtless. ADD THE WHITE T-SHIRT.`
			: `👕 CLOTHING: Every person MUST be FULLY CLOTHED. No bare skin on torso.`;

		return `${clothingBlock}

GENERATE THIS IMAGE IN THE EXACT SAME ROOM AS THE DA REFERENCE PHOTO (LAST IMAGE). COPY the background wall and floor from the DA reference photo exactly — same wall color, same floor color, same floor material.

REFERENCE IMAGES GUIDE:
- FIRST images = PRODUCT reference. Copy the exact garment: fabric color, texture, pockets, zippers, buttons, logos, every detail.
- LAST image = DA SCENE reference. This is the room/studio. COPY this room exactly: wall color, wall texture, floor color, floor material, lighting direction, props placement, camera angle, mood. The ONLY thing different is the outfit — the room stays IDENTICAL.

⚠️ WALL-TO-FLOOR TRANSITION RULE ⚠️
Look at the DA reference image (LAST image) very carefully. See how the wall meets the floor.
You MUST replicate the EXACT same wall-to-floor transition from the DA reference image:
1. If the DA reference shows a smooth curved infinity cove (cyclorama), generate the SAME smooth curve — NO sharp edge, NO fold, NO crease, NO visible line.
2. If the DA reference shows a gradual gradient where wall color blends into floor color, replicate that EXACT gradient.
3. The transition zone between wall and floor must be IDENTICAL to the DA reference photo — same softness, same curve radius, same color blending.
4. FORBIDDEN: Do NOT create a hard fold, visible crease, sharp corner, or abrupt color change where the wall meets the floor.
5. Study the DA reference image's lower third carefully — the wall-floor meeting point must be a PIXEL-PERFECT copy.

BACKGROUND AND FLOOR RULES:
1. Generate the EXACT same wall — same color, same material, same texture as DA reference.
2. Generate the EXACT same floor — same color, same material, same finish as DA reference.
3. The generated photo must look like it was taken in the SAME studio as the DA reference.

🚫 EXCLUDE: collar labels, neck tags, size labels, care labels, inner garment tags.

SHOT REQUIREMENTS:
${this.sanitizePromptForImageGeneration(prompt)}

Professional editorial fashion photography. 8K quality, sharp details. Match the DA reference lighting and atmosphere exactly.

${isBottomProduct ? 'REMINDER: The model MUST be wearing a PLAIN WHITE T-SHIRT on upper body. ZERO bare skin on torso. The white shirt must be clearly visible.' : ''}

FINAL RULE: The WALL-TO-FLOOR TRANSITION in your generated image must be IDENTICAL to the DA reference photo (LAST image). NO fold, NO crease, NO hard line — replicate the smooth transition exactly as shown in the DA reference. Same colors, same materials, same smooth curve.`;
	}

	/**
	 * Build prompt for PRODUCT-ONLY shots (flatlay, closeup_front).
	 *
	 * 🎯 CRITICAL: This wrapper NEVER mentions models, wearing, fashion photography.
	 * Only references product images for exact garment reproduction.
	 * Uses ONLY positive language — describes what IS in the image.
	 */
	private buildProductOnlyReferencePrompt(prompt: string): string {
		return `🎯 PRODUCT-ONLY PHOTOGRAPH — Still life, no humans.

📸 PRODUCT REFERENCE IMAGES:
These show the EXACT garment you must reproduce. Match ALL details precisely:
- EXACT fabric color, texture, and material
- EXACT pocket count, positions, patches, and design elements
- EXACT button count, zipper placement, and hardware
- EXACT collar, cuff, and seam details
- Every distinctive design element must be reproduced IDENTICALLY

SHOT REQUIREMENTS:
${prompt}

HIGH QUALITY OUTPUT: Professional still life product photography. Studio lighting, sharp details, clean composition. 8K quality.`;
	}

	/**
	 * Build prompt for Ad Recreation concept reference mode.
	 * The LAST image is a competitor ad concept for style/layout reference.
	 */
	private buildAdConceptReferencePrompt(prompt: string): string {
		return `🎯 CRITICAL: The reference images serve DIFFERENT ROLES. Read the IMAGE ROLE MAP in the prompt below to understand each image's purpose.

📸 FOR PRODUCT REFERENCE IMAGES (first images — see IMAGE ROLE MAP):
These show the EXACT product you MUST reproduce. Match ALL details precisely:

🎨 POCKET PATCHES & DESIGN ELEMENTS (HIGHEST PRIORITY):
- EXACT pocket patch pattern, embossing, and monogram from PRODUCT reference images
- EXACT pocket patch material appearance (leather, fabric), color, and texture
- EXACT pocket patch shape, size, and position on the garment
- Embossed/debossed patterns must match PRECISELY - same motif, same density, same depth
- Every distinctive design element (patches, panels, overlays) must be reproduced IDENTICALLY

🏷️ BRAND LOGO (see IMAGE ROLE MAP for which image is the logo):
- Reproduce this EXACT logo in the ad — match typography, colors, proportions
- Place the logo NATURALLY on the product or prominently in the ad layout
- Position it where a real brand would: on the garment, on a patch, or in the ad header
- Logo must be SHARP, LEGIBLE, and properly integrated

👕 GARMENT DETAILS FROM PRODUCT IMAGES:
- EXACT pocket count and positions (count every pocket!)
- EXACT button count and placement
- EXACT color (sample HEX from product reference)
- EXACT fabric texture and material appearance
- EXACT collar/cuff/seam details
- EXACT zipper/hardware placement

🎨 FOR CONCEPT/STYLE IMAGE (LAST image — see IMAGE ROLE MAP):
⚠️ This image is ONLY for style, layout, composition, and mood reference.
🚫 DO NOT COPY the product shown in this concept image!
✅ REPLACE whatever product is in the concept image with the EXACT product from the PRODUCT reference images.
✅ Use it ONLY for: camera angle, lighting style, background mood, text placement, composition.

Generate a NEW professional advertisement that:
1. Shows the EXACT product from the PRODUCT reference images
2. Has the brand logo placed naturally and prominently
3. Uses the style, layout, and composition from the CONCEPT image
4. REPLACES the concept image's product with the user's actual product

🚫 DO NOT INCLUDE: collar labels, neck tags, size labels, care labels, washing instruction tags, or any inner garment tags. Only show the OUTER garment design elements visible in the product reference images.

PHOTOGRAPHY & AD REQUIREMENTS:
${this.sanitizePromptForImageGeneration(prompt)}

HIGH QUALITY OUTPUT: Professional advertisement photography, studio lighting, sharp details. Crisp detail rendering on all patches, embossing, and logo.`;
	}

	/**
	 * Sanitize prompt to avoid PII policy violations
	 * This is essential for generating product images with models
	 */
	private sanitizePromptForImageGeneration(prompt: string): string {
		if (!prompt) return '';
		const lowerPrompt = prompt.toLowerCase();

		// If the prompt contains specific human markers (injected by PromptBuilder
		// for duo/solo shots), SKIP aggressive sanitization to preserve human descriptions.
		// These prompts intentionally describe real humans, not mannequins.
		const isPhotorealisticHumanShot =
			lowerPrompt.includes('photorealistic') ||
			lowerPrompt.includes('real human skin') ||
			lowerPrompt.includes('editorial fashion photography') ||
			lowerPrompt.includes('single child model') ||
			lowerPrompt.includes('single adult male model') ||
			lowerPrompt.includes('father and son');

		if (isPhotorealisticHumanShot) {
			// Only strip specific demographics for PII compliance, keep everything else
			let sanitized = prompt;

			// Remove demographic descriptors only
			const demographicPatterns = [
				/\b(asian|african|european|american|caucasian|hispanic)\s+(man|woman|person|model)\b/gi,
			];
			for (const pattern of demographicPatterns) {
				sanitized = sanitized.replace(pattern, 'model');
			}

			this.logger.log('Photorealistic human shot detected — skipping mannequin sanitization');
			return sanitized;
		}

		// Standard sanitization for non-human shots (flatlay, closeup, etc.)
		let sanitized = prompt;

		// Remove specific person descriptions that trigger PII
		const piiPatterns = [
			// Person descriptors
			/\b(young|old|middle-aged|elderly|teenage)\s+(man|woman|person|model|guy|girl|boy|lady|gentleman)\b/gi,
			/\b(confident|smiling|happy|serious|professional|attractive)\s+(young|old|middle-aged)?\s*(man|woman|person|model)\b/gi,
			/\b(man|woman|person|guy|girl|boy|lady)\s+(with|wearing|in)\b/gi,

			// Family relationships
			/\bfather\s+and\s+son\b/gi,
			/\bmother\s+and\s+daughter\b/gi,
			/\bparent\s+and\s+child\b/gi,
			/\bfamily\s+members?\b/gi,

			// Specific demographics
			/\b(asian|african|european|american|caucasian|hispanic)\s+(man|woman|person|model)\b/gi,

			// Age-specific
			/\b(\d+)\s*-?\s*year\s*-?\s*old\b/gi,
		];

		// Apply patterns
		for (const pattern of piiPatterns) {
			sanitized = sanitized.replace(pattern, 'professional model');
		}

		// General replacements for non-human shots
		sanitized = sanitized
			.replace(/\bperson\b/gi, 'mannequin')
			.replace(/\bpeople\b/gi, 'mannequins')
			.replace(/\bmodel wearing\b/gi, 'product shown on')
			.replace(/\bworn by\b/gi, 'displayed on')
			.replace(/\bTwo models\b/gi, 'Two mannequins')
			.replace(/\bmodels\b/gi, 'mannequins');

		// Add product-focused language if not present
		if (!sanitized.toLowerCase().includes('product') &&
			!sanitized.toLowerCase().includes('clothing') &&
			!sanitized.toLowerCase().includes('garment')) {
			sanitized = `Product photography: ${sanitized}`;
		}

		return sanitized;
	}

	/**
	 * 🆕 Analyze product images using Gemini
	 * Returns structured JSON with product details
	 */
	async analyzeProduct(input: { images: string[]; productName?: string }): Promise<AnalyzedProductJSON> {
		if (!input.images || input.images.length === 0) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		this.logger.log(`🔍 Analyzing product with ${input.images.length} images`);

		const client = this.getClient();

		// Build prompt
		let promptText = PRODUCT_ANALYSIS_PROMPT;
		if (input.productName) {
			promptText += `\n\nProduct name: ${input.productName}`;
		}

		// Build image parts
		const imageParts = await this.buildImageParts(input.images);

		try {
			// Generate content with text + images
			const response = await client.models.generateContent({
				model: this.ANALYSIS_MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: promptText },
							...imageParts
						]
					}
				]
			});

			// Extract text response
			const candidate = response.candidates?.[0];
			if (!candidate || !candidate.content?.parts) {
				throw new InternalServerErrorException('No response from Gemini');
			}

			let textResponse = '';
			for (const part of candidate.content.parts) {
				if ((part as any).text) {
					textResponse += (part as any).text;
				}
			}

			// Parse JSON from response
			const parsed = this.parseJson(textResponse);
			if (!parsed) {
				this.logger.error('Failed to parse product analysis JSON', { textResponse });
				throw new InternalServerErrorException('Failed to parse product analysis');
			}

			// Add analyzed_at timestamp
			const result: AnalyzedProductJSON = {
				...parsed,
				analyzed_at: new Date().toISOString(),
			};

			this.logger.log(`✅ Product analysis complete`);
			return result;

		} catch (error: any) {
			this.logger.error(`❌ Product analysis failed: ${error.message}`);
			throw new InternalServerErrorException(`Gemini analysis error: ${error.message}`);
		}
	}

	/**
	 * Build image parts for Gemini API from URLs or file paths
	 */
	private async buildImageParts(images: string[]): Promise<any[]> {
		const parts: any[] = [];

		for (const image of images) {
			try {
				let base64Data: string;
				let mimeType = 'image/jpeg';

				// Check if it's a URL or file path
				if (image.startsWith('http://') || image.startsWith('https://')) {
					// 🔧 Check if this is our own backend URL - try local first, fallback to HTTP fetch
					// This fixes Docker container networking issues where container can't reach its own external IP
					const uploadBaseUrl = process.env.UPLOAD_BASE_URL || '';
					if (uploadBaseUrl && image.startsWith(uploadBaseUrl)) {
						// Extract the path after the base URL and read locally
						const relativePath = image.replace(uploadBaseUrl, '').replace(/^\/+/, '');
						const localPath = path.join(process.cwd(), relativePath);

						if (fs.existsSync(localPath)) {
							this.logger.log(`📂 Reading local file: ${localPath}`);
							const buffer = fs.readFileSync(localPath);
							base64Data = buffer.toString('base64');
							// Detect mime type from extension
							if (localPath.endsWith('.png')) mimeType = 'image/png';
							else if (localPath.endsWith('.webp')) mimeType = 'image/webp';
							else if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) mimeType = 'image/jpeg';
						} else {
							// Local file not found — fallback to HTTP fetch (files may be on S3)
							this.logger.log(`📂 Local file not found, fetching via HTTP: ${image}`);
							const response = await fetch(image);
							if (!response.ok) {
								this.logger.warn(`Failed to fetch image: ${image} (${response.status})`);
								continue;
							}
							const buffer = Buffer.from(await response.arrayBuffer());
							base64Data = buffer.toString('base64');
							mimeType = response.headers.get('content-type') || 'image/jpeg';
						}
					} else {
						// Fetch from external URL
						const response = await fetch(image);
						if (!response.ok) {
							this.logger.warn(`Failed to fetch image: ${image}`);
							continue;
						}
						const buffer = Buffer.from(await response.arrayBuffer());
						base64Data = buffer.toString('base64');
						mimeType = response.headers.get('content-type') || 'image/jpeg';
					}
				} else if (image.startsWith('data:')) {
					// Base64 data URL
					const matches = image.match(/^data:([^;]+);base64,(.+)$/);
					if (matches) {
						mimeType = matches[1];
						base64Data = matches[2];
					} else {
						this.logger.warn(`Invalid data URL: ${image}`);
						continue;
					}
				} else {
					// Local file path
					if (!fs.existsSync(image)) {
						this.logger.warn(`File not found: ${image}`);
						continue;
					}
					const buffer = fs.readFileSync(image);
					base64Data = buffer.toString('base64');

					// Detect mime type from extension
					if (image.endsWith('.png')) mimeType = 'image/png';
					else if (image.endsWith('.webp')) mimeType = 'image/webp';
					else if (image.endsWith('.jpg') || image.endsWith('.jpeg')) mimeType = 'image/jpeg';
				}

				parts.push({
					inlineData: {
						mimeType,
						data: base64Data
					}
				});

				this.logger.log(`✅ Image loaded: ${image.substring(0, 100)}...`);

			} catch (error: any) {
				this.logger.error(`Failed to load image ${image}: ${error.message}`);
			}
		}

		if (parts.length === 0) {
			throw new BadRequestException('No valid images could be loaded');
		}

		return parts;
	}

	/**
	 * Parse JSON from text response (handles markdown code blocks)
	 */
	private parseJson(text: string): any {
		if (!text) return null;

		try {
			// Try direct parse first
			return JSON.parse(text);
		} catch {
			// Try to extract JSON from markdown code blocks
			const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
			if (jsonMatch) {
				try {
					return JSON.parse(jsonMatch[1]);
				} catch {
					return null;
				}
			}

			// Try to find JSON object in text
			const objectMatch = text.match(/\{[\s\S]*\}/);
			if (objectMatch) {
				try {
					return JSON.parse(objectMatch[0]);
				} catch {
					return null;
				}
			}

			return null;
		}
	}

	/**
	 * 🆕 Analyze DA Reference Image using Gemini (Fallback for Claude)
	 * Returns structured DA JSON
	 */
	async analyzeDAReference(imageUrl: string): Promise<AnalyzedDAJSON> {
		this.logger.log(`🔍 Analyzing DA Reference with Gemini (${this.ANALYSIS_MODEL})`);

		const client = this.getClient();
		const parts = await this.buildImageParts([imageUrl]);

		try {
			const response = await client.models.generateContent({
				model: this.ANALYSIS_MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: DA_ANALYSIS_PROMPT },
							...parts
						]
					}
				]
			});

			const candidate = response.candidates?.[0];
			if (!candidate || !candidate.content?.parts) {
				throw new InternalServerErrorException('No response from Gemini');
			}

			let textResponse = '';
			for (const part of candidate.content.parts) {
				if ((part as any).text) {
					textResponse += (part as any).text;
				}
			}

			const parsed = this.parseJson(textResponse);
			if (!parsed) {
				this.logger.error('Failed to parse DA analysis JSON', { textResponse });
				throw new InternalServerErrorException('Failed to parse DA analysis');
			}

			// Validate structure (minimal check)
			if (!parsed.background || !parsed.lighting || !parsed.mood) {
				this.logger.warn('Parsed JSON missing required DA fields', parsed);
			}

			return {
				...parsed,
				analyzed_at: new Date().toISOString(),
			};
		} catch (error: any) {
			this.logger.error(`❌ DA Analysis failed: ${error.message}`);
			throw new InternalServerErrorException(`Gemini DA analysis error: ${error.message}`);
		}
	}

	/**
	 * Get or create Gemini client
	 * @param userApiKey - Optional user-specific API key (takes precedence over env var)
	 */
	private getClient(userApiKey?: string): GoogleGenAI {
		// If user has their own API key, create a fresh client (not cached)
		if (userApiKey && userApiKey.trim() && !userApiKey.includes('****')) {
			this.logger.log(`🔑 Using user-provided Gemini API key`);
			return new GoogleGenAI({ apiKey: userApiKey });
		}

		// Use cached default client
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('gemini.apiKey') || process.env.GEMINI_API_KEY;

		if (!apiKey) {
			this.logger.error('❌ GEMINI_API_KEY is missing in environment variables');
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.logger.log(`🔑 Using system Gemini API key`);
		this.logger.log(`   - Model: ${this.MODEL}`);
		this.logger.log(`   - API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);

		this.client = new GoogleGenAI({ apiKey });
		return this.client;
	}

	/**
	 * Get current API key status (masked for security)
	 */
	getApiKeyStatus(): { hasSystemKey: boolean; systemKeyMasked: string | null } {
		const apiKey = this.configService.get<string>('gemini.apiKey') || process.env.GEMINI_API_KEY;
		return {
			hasSystemKey: !!apiKey,
			systemKeyMasked: apiKey ? `${apiKey.substring(0, 10)}****${apiKey.substring(apiKey.length - 4)}` : null,
		};
	}

	/** Current Gemini model (image generation) */
	getModel(): string {
		return this.MODEL;
	}
}
