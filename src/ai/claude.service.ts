import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Messages } from '@anthropic-ai/sdk/resources';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { AIMessage, FileMessage } from '../libs/enums';

type AnalyzeProductInput = {
	images: string[];
	productName?: string;
	brandBrief?: string;
	notes?: string;
};

type GeneratePromptsInput = {
	productName?: string;
	brandBrief?: string;
	extractedVariables?: Record<string, any>;
	fixedElements?: Record<string, any>;
	promptTemplates?: Record<string, any>;
	count?: number;
};

type AnalyzeCompetitorAdInput = {
	image: string;
	brandBrief?: string;
	notes?: string;
};

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

type ClaudeContentBlock =
	| { type: 'text'; text: string }
	| {
			type: 'image';
			source: { type: 'base64'; media_type: ClaudeImageMediaType; data: string };
	  };

@Injectable()
export class ClaudeService {
	private readonly logger = new Logger(ClaudeService.name);

	private client: Anthropic | null = null;

	private readonly model = 'claude-sonnet-4-20250514';

	constructor(private readonly configService: ConfigService) {}

	async analyzeProduct(input: AnalyzeProductInput): Promise<Record<string, any>> {
		if (!input.images?.length) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: this.buildProductAnalysisPrompt(input) },
			...(await this.buildImageBlocks(input.images)),
		];

		
		const response = await this.createMessage({
			content,
			max_tokens: 1200,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		return parsed || { raw: text };
	}

	async generatePrompts(input: GeneratePromptsInput): Promise<string[]> {
		const count = input.count && input.count > 0 ? input.count : 6;

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: this.buildPromptGenerationPrompt(input, count) },
		];

		const response = await this.createMessage({
			content,
			max_tokens: 1000,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		if (Array.isArray(parsed)) {
			return parsed.slice(0, count).map((item) => String(item));
		}

		return text
			.split('\n')
			.map((line) => line.replace(/^\s*\d+[\).\-]\s*/, '').trim())
			.filter(Boolean)
			.slice(0, count);
	}

	/**
	 * Generate structured visuals with all required fields for product visual generation
	 * Returns array of 6 visual objects with: type, display_name, prompt, negative_prompt, camera, background, garment_details, styling, output
	 */
	async generateStructuredVisuals(input: GeneratePromptsInput & { images?: string[] }): Promise<Array<{
		type: string;
		display_name: string;
		prompt: string;
		negative_prompt: string;
		camera: string;
		background: string;
		garment_details: string;
		styling: string;
		output: string;
	}>> {
		const visualTypes = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
		const count = visualTypes.length;

		const prompt = this.buildStructuredVisualsPrompt(input, visualTypes);

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: prompt },
			...(input.images ? await this.buildImageBlocks(input.images) : []),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 4000, // Increased for structured output
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		// Try to extract visuals array from response
		let visuals: any[] = [];
		
		if (parsed && parsed.visuals && Array.isArray(parsed.visuals)) {
			visuals = parsed.visuals;
		} else if (Array.isArray(parsed)) {
			visuals = parsed;
		} else if (parsed && typeof parsed === 'object') {
			// If it's an object, try to find visuals array
			visuals = Object.values(parsed).find((v: any) => Array.isArray(v)) as any[] || [];
		}

		// Ensure we have exactly 6 visuals, mapped to the correct types
		const result: Array<{
			type: string;
			display_name: string;
			prompt: string;
			negative_prompt: string;
			camera: string;
			background: string;
			garment_details: string;
			styling: string;
			output: string;
		}> = [];

		for (let i = 0; i < visualTypes.length; i++) {
			const type = visualTypes[i];
			const visual = visuals[i] || {};
			
			result.push({
				type,
				display_name: visual.display_name || this.getDisplayName(type),
				prompt: visual.prompt || '',
				negative_prompt: visual.negative_prompt || 'blurry, low quality, distorted, watermark',
				camera: visual.camera || '',
				background: visual.background || '',
				garment_details: visual.garment_details || '',
				styling: visual.styling || '',
				output: visual.output || '',
			});
		}

		return result;
	}

	private getDisplayName(type: string): string {
		const names: Record<string, string> = {
			duo: 'DUO (Father + Son)',
			solo: 'SOLO (Man alone)',
			flatlay_front: 'FLAT LAY FRONT',
			flatlay_back: 'FLAT LAY BACK',
			closeup_front: 'CLOSE UP FRONT',
			closeup_back: 'CLOSE UP BACK',
		};
		return names[type] || type.toUpperCase();
	}

	private buildStructuredVisualsPrompt(input: GeneratePromptsInput, visualTypes: string[]): string {
		const lines = [
			'Generate exactly 6 structured visual prompts for product photography.',
			'Return JSON with this exact structure:',
			'{',
			'  "visuals": [',
			'    {',
			'      "type": "duo",',
			'      "display_name": "DUO (Father + Son)",',
			'      "prompt": "detailed prompt text",',
			'      "negative_prompt": "what to avoid",',
			'      "camera": "camera settings and angle",',
			'      "background": "background description",',
			'      "garment_details": "specific garment details",',
			'      "styling": "styling notes",',
			'      "output": "expected output description"',
			'    },',
			'    ... (5 more for: solo, flatlay_front, flatlay_back, closeup_front, closeup_back)',
			'  ]',
			'}',
			'',
			'Visual types required (in order):',
			visualTypes.map((t, i) => `${i + 1}. ${t}`).join('\n'),
			'',
			'Return ONLY valid JSON, no markdown, no code blocks.',
		];

		if (input.productName) {
			lines.push(`Product name: ${input.productName}`);
		}

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.extractedVariables) {
			lines.push(`Extracted variables: ${JSON.stringify(input.extractedVariables)}`);
		}

		if (input.fixedElements) {
			lines.push(`Fixed elements: ${JSON.stringify(input.fixedElements)}`);
		}

		if (input.promptTemplates) {
			lines.push(`Prompt templates: ${JSON.stringify(input.promptTemplates)}`);
		}

		return lines.join('\n');
	}

	async analyzeCompetitorAd(input: AnalyzeCompetitorAdInput): Promise<Record<string, any>> {
		if (!input.image) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: this.buildCompetitorAnalysisPrompt(input) },
			...(await this.buildImageBlocks([input.image])),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 1200,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		return parsed || { raw: text };
	}

	private getClient(): Anthropic {
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('CLAUDE_API_KEY');

		if (!apiKey) {
			this.logger.error('CLAUDE_API_KEY is not set in environment variables');
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.client = new Anthropic({ apiKey });
		return this.client;
	}

	private async createMessage(params: {
		content: ClaudeContentBlock[];
		max_tokens: number;
	}): Promise<Messages.Message> {
		try {
			const res = await this.getClient().messages.create({
				model: this.model,
				max_tokens: params.max_tokens,
				messages: [
					{
						role: 'user',
						content: params.content,
					},
				],
			});

			return res;
		} catch (error: any) {
			this.logger.error('Claude API error', {
				message: error?.message,
				name: error?.name,
				status: error?.status,
				data: error?.response?.data,
			});

			throw new InternalServerErrorException(AIMessage.CLAUDE_API_ERROR);
		}
	}

	private buildProductAnalysisPrompt(input: AnalyzeProductInput): string {
		const lines = [
			'You are a visual analyst for product ads.',
			'Analyze the product images and return a JSON object with keys:',
			'product_name, colors, materials, textures, patterns, fit, style, features, background_ideas, lighting, camera, mood, props, keywords.',
			'Use arrays for list fields. Use null when unknown. Return JSON only.',
		];

		if (input.productName) {
			lines.push(`Product name: ${input.productName}`);
		}

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.notes) {
			lines.push(`Notes: ${input.notes}`);
		}

		return lines.join('\n');
	}

	private buildPromptGenerationPrompt(input: GeneratePromptsInput, count: number): string {
		const lines = [
			`Generate exactly ${count} image generation prompts for product ads.`,
			'Each prompt should be a single sentence, vivid, and concrete.',
			'Return a JSON array of strings only.',
		];

		if (input.productName) {
			lines.push(`Product name: ${input.productName}`);
		}

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.extractedVariables) {
			lines.push(`Extracted variables: ${JSON.stringify(input.extractedVariables)}`);
		}

		if (input.fixedElements) {
			lines.push(`Fixed elements: ${JSON.stringify(input.fixedElements)}`);
		}

		if (input.promptTemplates) {
			lines.push(`Prompt templates: ${JSON.stringify(input.promptTemplates)}`);
		}

		return lines.join('\n');
	}

	private buildCompetitorAnalysisPrompt(input: AnalyzeCompetitorAdInput): string {
		const lines = [
			'Analyze the competitor ad and return JSON with keys:',
			'summary, layout, typography, colors, lighting, props, mood, target_audience, call_to_action, differentiation_ideas.',
			'Return JSON only.',
		];

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.notes) {
			lines.push(`Notes: ${input.notes}`);
		}

		return lines.join('\n');
	}

	private async buildImageBlocks(images: string[]): Promise<ClaudeContentBlock[]> {
		const blocks: ClaudeContentBlock[] = [];

		for (const image of images) {
			const source = await this.resolveImageSource(image);
			blocks.push({
				type: 'image',
				source: {
					type: 'base64',
					media_type: source.mediaType,
					data: source.data,
				},
			});
		}

		return blocks;
	}

	private async resolveImageSource(image: string): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		if (image.startsWith('data:')) {
			return this.parseDataUrl(image);
		}

		if (image.startsWith('http://') || image.startsWith('https://')) {
			return this.fetchImage(image);
		}

		return this.readLocalImage(image);
	}

	private async fetchImage(url: string): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		const response = await fetch(url);

		if (!response.ok) {
			this.logger.warn(`Failed to fetch image from URL: ${url}`, {
				status: response.status,
				statusText: response.statusText,
			});
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const contentType = response.headers.get('content-type');
		const mediaType = this.normalizeMediaType(contentType?.split(';')[0] || this.guessMimeType(url));

		return { data: buffer.toString('base64'), mediaType };
	}

	private async readLocalImage(imagePath: string): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		const candidates: string[] = [];

		if (path.isAbsolute(imagePath)) {
			candidates.push(imagePath);
		}

		candidates.push(path.join(process.cwd(), imagePath.replace(/^\/+/, '')));

		const existing = candidates.find((candidate) => existsSync(candidate));

		if (!existing) {
			this.logger.warn(`Local image not found: ${imagePath}`, {
				candidates,
			});
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const buffer = await readFile(existing);

		return {
			data: buffer.toString('base64'),
			mediaType: this.normalizeMediaType(this.guessMimeType(existing)),
		};
	}

	private parseDataUrl(dataUrl: string): { data: string; mediaType: ClaudeImageMediaType } {
		const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

		if (!match) {
			throw new BadRequestException(FileMessage.FILE_UPLOAD_FAILED);
		}

		return {
			mediaType: this.normalizeMediaType(match[1]),
			data: match[2],
		};
	}

	private guessMimeType(pathOrUrl: string): ClaudeImageMediaType {
		const ext = path.extname(pathOrUrl).toLowerCase();

		switch (ext) {
			case '.png':
				return 'image/png';
			case '.gif':
				return 'image/gif';
			case '.webp':
				return 'image/webp';
			case '.jpg':
			case '.jpeg':
			default:
				return 'image/jpeg';
		}
	}

	private normalizeMediaType(mediaType: string): ClaudeImageMediaType {
		switch (mediaType) {
			case 'image/png':
			case 'image/webp':
			case 'image/gif':
			case 'image/jpeg':
				return mediaType;
			default:
				return 'image/jpeg';
		}
	}

	private extractText(content: Array<{ type: string; text?: string }>): string {
		return content
			.filter((block) => block.type === 'text' && block.text)
			.map((block) => block.text as string)
			.join('')
			.trim();
	}

	private parseJson(text: string): any | null {
		const trimmed = text.trim();
		if (!trimmed) return null;

		const direct = this.tryParseJson(trimmed);
		if (direct) return direct;

		const objectCandidate = this.extractJsonSubstring(trimmed, '{', '}');
		if (objectCandidate) {
			const parsedObject = this.tryParseJson(objectCandidate);
			if (parsedObject) return parsedObject;
		}

		const arrayCandidate = this.extractJsonSubstring(trimmed, '[', ']');
		if (arrayCandidate) {
			const parsedArray = this.tryParseJson(arrayCandidate);
			if (parsedArray) return parsedArray;
		}

		return null;
	}

	private tryParseJson(value: string): any | null {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}

	private extractJsonSubstring(value: string, startChar: string, endChar: string): string | null {
		const start = value.indexOf(startChar);
		const end = value.lastIndexOf(endChar);

		if (start === -1 || end === -1 || end <= start) {
			return null;
		}

		return value.slice(start, end + 1);
	}
}
