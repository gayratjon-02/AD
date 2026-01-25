import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AIMessage } from '../libs/enums';
import { GEMINI_MODEL, GeminiImageResult } from '../libs/config';

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
	
	// QATIYAN: Faqat gemini-3-pro-image-preview modelidan foydalanish
	private readonly MODEL = GEMINI_MODEL;
	
	// ⏱️ Timeout: 3 daqiqa (180 sekund) - image generation can take longer
	private readonly TIMEOUT_MS = 180 * 1000; // 3 minutes in milliseconds

	constructor(private readonly configService: ConfigService) {}

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
	 * 🚀 PRODUCTION-READY: Generate images using Gemini 3 Pro Image Preview model
	 * Uses the correct @google/genai SDK format with responseModalities
	 */
	async generateImages(prompt: string, aspectRatio?: string, resolution?: string): Promise<{ images: GeminiImageResult[] }> {
		const client = this.getClient();
		const startTime = Date.now();
		
		// Build enhanced prompt - FOCUS ON PRODUCT, NOT PEOPLE
		const ratioText = aspectRatio || '1:1';
		const resolutionText = resolution || '1K'; // "1K", "2K", "4K"
		
		// 🚀 CRITICAL: Sanitize prompt to avoid PII policy violations
		const sanitizedPrompt = this.sanitizePromptForImageGeneration(prompt);
		
		// Enhanced prompt for product photography - NO SPECIFIC PEOPLE DESCRIPTIONS
		const enhancedPrompt = `Professional e-commerce product photography: ${sanitizedPrompt}. 
High quality studio lighting, sharp details, clean background. 
Aspect ratio: ${ratioText}. Resolution: ${resolutionText}.`;
		
		this.logger.log(`🎨 ========== GEMINI IMAGE GENERATION START ==========`);
		this.logger.log(`📋 Model: ${this.MODEL}`);
		this.logger.log(`📐 Aspect ratio: ${ratioText}`);
		this.logger.log(`📏 Resolution: ${resolutionText}`);
		this.logger.log(`⏱️ Timeout: ${this.TIMEOUT_MS / 1000} seconds`);
		this.logger.log(`📝 Original prompt (first 200 chars): ${prompt.substring(0, 200)}...`);
		this.logger.log(`📝 Sanitized prompt (first 200 chars): ${sanitizedPrompt.substring(0, 200)}...`);
		this.logger.log(`📝 Enhanced prompt (first 300 chars): ${enhancedPrompt.substring(0, 300)}...`);
		
		try {
			// 🚀 CRITICAL: Use EXACT format from Google's official documentation
			// Reference: https://ai.google.dev/gemini-api/docs/image-generation
			const generatePromise = client.models.generateContent({
				model: this.MODEL,
				contents: enhancedPrompt, // Can be string directly
				config: {
					responseModalities: ['TEXT', 'IMAGE'], // CRITICAL: Force image generation
					imageConfig: {
						aspectRatio: ratioText,
						imageSize: resolutionText,
					}
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
	 */
	async generateImage(
		prompt: string, 
		_modelName?: string, // ignored, we always use gemini-3-pro-image-preview
		aspectRatio?: string,
		resolution?: string
	): Promise<GeminiImageResult> {
		const maxRetries = 2;
		const startTime = Date.now();
		
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				if (attempt > 0) {
					this.logger.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries}...`);
					await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry
				}
				
				const result = await this.generateImages(prompt, aspectRatio, resolution);
				
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
				
				// Don't retry on timeout - it already waited long enough
				if (error instanceof InternalServerErrorException && 
					error.message.includes('timed out')) {
					this.logger.error(`⏱️ Timeout error - not retrying`);
					throw error;
				}
				
				// Don't retry on policy violations - they won't succeed
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
	 * 🚀 CRITICAL: Sanitize prompt to avoid PII policy violations
	 * This is essential for generating product images with models
	 */
	private sanitizePromptForImageGeneration(prompt: string): string {
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
		
		// General replacements
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
	 * Get or create Gemini client
	 */
	private getClient(): GoogleGenAI {
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('gemini.apiKey') || process.env.GEMINI_API_KEY;

		if (!apiKey) {
			this.logger.error('❌ GEMINI_API_KEY is missing in environment variables');
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.logger.log(`✅ Gemini client initialized`);
		this.logger.log(`   - Model: ${this.MODEL}`);
		this.logger.log(`   - API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
		
		this.client = new GoogleGenAI({ apiKey });
		return this.client;
	}
}
