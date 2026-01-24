import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type Part, type EnhancedGenerateContentResponse } from '@google/generative-ai';
import { AIMessage } from '../libs/enums';

type GeminiImageResult = {
	mimeType: string;
	data?: string;
	text?: string;
};

@Injectable()
export class GeminiService {
	private client: GoogleGenerativeAI | null = null;
	private readonly logger = new Logger(GeminiService.name);

	private readonly defaultModel = 'gemini-2.0-flash-exp';

	constructor(private readonly configService: ConfigService) {}

	async generateImage(prompt: string, modelName?: string): Promise<GeminiImageResult> {
		try {
			const model = this.getModel(modelName);

			const result = await model.generateContent({
				contents: [
					{
						role: 'user',
						parts: [
							{
								text: prompt,
							},
						],
					},
				],
				generationConfig: {
					responseMimeType: 'image/png',
				},
			});

			const response = result.response;
			const inlineData = this.extractInlineData(response);

			if (inlineData?.data) {
				return {
					mimeType: inlineData.mimeType,
					data: inlineData.data,
				};
			}

			return {
				mimeType: 'text/plain',
				text: response.text(),
			};
		} catch (error: any) {
			this.logger.error(
				'Gemini generateImage failed',
				error?.response?.error ? JSON.stringify(error.response.error) : error?.message || String(error),
			);

			throw new InternalServerErrorException(AIMessage.GEMINI_API_ERROR);
		}
	}

	async generateBatch(prompts: string[], modelName?: string): Promise<GeminiImageResult[]> {
		const results: GeminiImageResult[] = [];

		for (const prompt of prompts) {
			const result = await this.generateImage(prompt, modelName);
			results.push(result);
		}

		return results;
	}

	private getModel(modelName?: string) {
		const client = this.getClient();

		return client.getGenerativeModel({
			model: modelName || this.defaultModel,
		});
	}

	private getClient(): GoogleGenerativeAI {
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('geminiApiKey');

		if (!apiKey) {
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.client = new GoogleGenerativeAI(apiKey);
		return this.client;
	}

	private extractInlineData(response: EnhancedGenerateContentResponse): { mimeType: string; data: string } | null {
		const parts: Part[] = response.candidates?.[0]?.content?.parts || [];

		for (const part of parts) {
			const inlineData = (part as { inlineData?: { mimeType: string; data: string } }).inlineData;

			if (inlineData?.data) {
				return inlineData;
			}
		}

		return null;
	}
}
