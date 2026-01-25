import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AIMessage } from '../libs/enums';
import { GEMINI_MODEL, GeminiImageResult } from '../libs/config';

@Injectable()
export class GeminiService {
	private client: GoogleGenAI | null = null;
	private readonly logger = new Logger(GeminiService.name);
	
	// QATIYAN: Faqat gemini-3-pro-image-preview modelidan foydalanish
	private readonly MODEL = GEMINI_MODEL;

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Generate images using Gemini 3 Pro Image Preview model
	 * Returns array of base64 images
	 */
	async generateImages(prompt: string, aspectRatio?: string, resolution?: string): Promise<{ images: GeminiImageResult[] }> {
		const client = this.getClient();
		
		// Build enhanced prompt
		const ratioText = aspectRatio || '1:1';
		const resolutionText = resolution ? `${resolution} resolution` : 'high resolution';
		
		// Sanitize prompt to avoid PII policy violations
		const sanitizedPrompt = this.sanitizePrompt(prompt);
		const enhancedPrompt = `Professional product photography: ${sanitizedPrompt}. Aspect ratio: ${ratioText}. ${resolutionText}. High quality, sharp details, perfect lighting, studio background.`;
		
		this.logger.log(`🎨 Starting Gemini image generation`);
		this.logger.log(`📋 Model: ${this.MODEL}`);
		this.logger.log(`📐 Aspect ratio: ${ratioText}`);
		this.logger.log(`📝 Prompt (first 200 chars): ${enhancedPrompt.substring(0, 200)}...`);
		
		try {
			// 🚀 CRITICAL: Use correct request format with responseModalities
			const response = await client.models.generateContent({
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
			
			// 🔍 Debug response structure
			this.logger.log(`📊 Candidates: ${response.candidates?.length || 0}`);
			
			if (!response.candidates || response.candidates.length === 0) {
				this.logger.error(`❌ No candidates in response`);
				throw new InternalServerErrorException('Gemini returned no candidates');
			}
			
			const parts = response.candidates[0].content?.parts || [];
			this.logger.log(`📊 Parts: ${parts.length}`);
			
			if (parts.length === 0) {
				this.logger.error(`❌ No parts in response`);
				throw new InternalServerErrorException('Gemini returned no parts');
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
				this.logger.error(`📊 Full response:`, JSON.stringify(response.candidates[0], null, 2));
				
				throw new InternalServerErrorException(
					`Gemini (${this.MODEL}) did not generate any images. Response: ${textResponse.substring(0, 200)}`
				);
			}
			
			this.logger.log(`✅ Successfully generated ${images.length} image(s)`);
			return { images };
			
		} catch (error: any) {
			const errorMessage = error?.message || String(error);
			this.logger.error(`❌ Gemini API error: ${errorMessage}`);
			
			if (error instanceof InternalServerErrorException) {
				throw error;
			}
			
			throw new InternalServerErrorException(AIMessage.GEMINI_API_ERROR);
		}
	}

	/**
	 * Generate single image - wrapper for backward compatibility
	 */
	async generateImage(
		prompt: string, 
		_modelName?: string, // ignored, we always use gemini-3-pro-image-preview
		aspectRatio?: string,
		resolution?: string
	): Promise<GeminiImageResult> {
		const maxRetries = 2;
		
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
				
				throw new InternalServerErrorException('No images generated');
				
			} catch (error: any) {
				const isLastAttempt = attempt === maxRetries - 1;
				
				if (isLastAttempt) {
					this.logger.error(`❌ All ${maxRetries} attempts failed`);
					throw error;
				}
				
				this.logger.warn(`⚠️ Attempt ${attempt + 1} failed: ${error.message}`);
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
