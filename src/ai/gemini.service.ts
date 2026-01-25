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
	
	// ⏱️ Timeout: 2 daqiqa (120 sekund)
	private readonly TIMEOUT_MS = 120 * 1000; // 2 minutes in milliseconds

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Promise with timeout wrapper
	 * Agar belgilangan vaqt ichida javob kelmasa, timeout error qaytaradi
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
	 * Generate images using Gemini 3 Pro Image Preview model
	 * Returns array of base64 images
	 * ⏱️ 2 daqiqa timeout bilan
	 */
	async generateImages(prompt: string, aspectRatio?: string, resolution?: string): Promise<{ images: GeminiImageResult[] }> {
		const client = this.getClient();
		const startTime = Date.now();
		
		// Build enhanced prompt
		const ratioText = aspectRatio || '1:1';
		const resolutionText = resolution ? `${resolution} resolution` : 'high resolution';
		
		// Sanitize prompt to avoid PII policy violations
		const sanitizedPrompt = this.sanitizePrompt(prompt);
		const enhancedPrompt = `Professional product photography: ${sanitizedPrompt}. Aspect ratio: ${ratioText}. ${resolutionText}. High quality, sharp details, perfect lighting, studio background.`;
		
		this.logger.log(`🎨 Starting Gemini image generation`);
		this.logger.log(`📋 Model: ${this.MODEL}`);
		this.logger.log(`📐 Aspect ratio: ${ratioText}`);
		this.logger.log(`⏱️ Timeout: ${this.TIMEOUT_MS / 1000} seconds`);
		this.logger.log(`📝 Prompt (first 200 chars): ${enhancedPrompt.substring(0, 200)}...`);
		
		try {
			// 🚀 CRITICAL: Use correct request format with responseModalities
			// ⏱️ 2 daqiqa timeout bilan
			const generatePromise = client.models.generateContent({
				model: this.MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: enhancedPrompt }
						]
					}
				],
				config: {
					responseModalities: ['TEXT', 'IMAGE'] // CRITICAL: Force image generation
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
			
			// 🔍 Debug response structure
			this.logger.log(`📊 Candidates: ${response.candidates?.length || 0}`);
			
			if (!response.candidates || response.candidates.length === 0) {
				this.logger.error(`❌ No candidates in response`);
				throw new GeminiGenerationError('Gemini returned no candidates');
			}
			
			const parts = response.candidates[0].content?.parts || [];
			this.logger.log(`📊 Parts: ${parts.length}`);
			
			if (parts.length === 0) {
				this.logger.error(`❌ No parts in response`);
				throw new GeminiGenerationError('Gemini returned no parts');
			}
			
			// 🔍 Parse response parts
			const images: GeminiImageResult[] = [];
			let textResponse = '';
			
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i] as any;
				const partKeys = Object.keys(part);
				this.logger.log(`🔍 Part ${i} keys: [${partKeys.join(', ')}]`);
				
				// Check for text part
				if (part.text) {
					textResponse = part.text;
					this.logger.log(`📝 Part ${i} text (first 200 chars): ${part.text.substring(0, 200)}`);
					
					// Check if model says it cannot generate images
					const lowerText = part.text.toLowerCase();
					if (lowerText.includes('cannot') || lowerText.includes('unable') || lowerText.includes('not support')) {
						this.logger.error(`❌ Model refused to generate image: ${part.text}`);
						throw new GeminiGenerationError(`Model refused: ${part.text.substring(0, 200)}`);
					}
				}
				
				// Check for image part (inlineData)
				if (part.inlineData) {
					const { mimeType, data } = part.inlineData;
					this.logger.log(`✅ Part ${i} Image found: mimeType=${mimeType}, dataLength=${data?.length || 0}`);
					
					if (data) {
						images.push({
							mimeType: mimeType || 'image/png',
							data: data // base64 string
						});
					}
				}
			}
			
			// 🚀 CRITICAL: Check if we got any images
			if (images.length === 0) {
				this.logger.error(`❌ Gemini returned NO images!`);
				this.logger.error(`📝 Text response: ${textResponse}`);
				
				throw new GeminiGenerationError(
					`Gemini did not generate any images. Response: ${textResponse.substring(0, 200)}`
				);
			}
			
			this.logger.log(`✅ Successfully generated ${images.length} image(s) in ${elapsedTime}s`);
			return { images };
			
		} catch (error: any) {
			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
			
			// ⏱️ Handle timeout error
			if (error instanceof GeminiTimeoutError) {
				this.logger.error(`⏱️ TIMEOUT: Image generation timed out after ${elapsedTime}s`);
				throw new InternalServerErrorException(
					`Image generation timed out after 2 minutes. Please try again.`
				);
			}
			
			// Handle generation error
			if (error instanceof GeminiGenerationError) {
				this.logger.error(`❌ Generation error after ${elapsedTime}s: ${error.message}`);
				throw new InternalServerErrorException(error.message);
			}
			
			// Handle other errors
			const errorMessage = error?.message || String(error);
			this.logger.error(`❌ Gemini API error after ${elapsedTime}s: ${errorMessage}`);
			
			if (error instanceof InternalServerErrorException) {
				throw error;
			}
			
			throw new InternalServerErrorException(`Gemini error: ${errorMessage.substring(0, 200)}`);
		}
	}

	/**
	 * Generate single image - wrapper for backward compatibility
	 * ⏱️ 2 daqiqa timeout bilan, 1 marta retry
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
					await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
				}
				
				const result = await this.generateImages(prompt, aspectRatio, resolution);
				
				if (result.images.length > 0) {
					return result.images[0]; // Return first image
				}
				
				throw new GeminiGenerationError('No images generated');
				
			} catch (error: any) {
				const isLastAttempt = attempt === maxRetries - 1;
				const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
				
				// ⏱️ Don't retry on timeout - it already waited 2 minutes
				if (error instanceof InternalServerErrorException && 
					error.message.includes('timed out')) {
					this.logger.error(`⏱️ Timeout error - not retrying`);
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
	 * Generate batch of images
	 */
	async generateBatch(prompts: string[], aspectRatio?: string, resolution?: string): Promise<GeminiImageResult[]> {
		const results: GeminiImageResult[] = [];
		
		for (const prompt of prompts) {
			const result = await this.generateImage(prompt, undefined, aspectRatio, resolution);
			results.push(result);
		}
		
		return results;
	}

	/**
	 * Sanitize prompt to avoid PII policy violations
	 */
	private sanitizePrompt(prompt: string): string {
		return prompt
			.replace(/\b(young|old|middle-aged)\s+(man|woman|person|model)\b/gi, 'professional model')
			.replace(/\b(confident|smiling|happy)\s+(young|old|middle-aged)?\s*(man|woman|person|model)\b/gi, 'professional model')
			.replace(/\bfather\s+and\s+son\b/gi, 'two professional models')
			.replace(/\bperson\b/gi, 'professional model')
			.replace(/\bpeople\b/gi, 'professional models');
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

		this.logger.log(`✅ Gemini client initialized (model: ${this.MODEL})`);
		this.client = new GoogleGenAI({ apiKey });
		return this.client;
	}
}
