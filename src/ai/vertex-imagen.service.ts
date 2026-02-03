import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { GeminiImageResult, VALID_IMAGE_SIZES } from '../libs/config';

/** Same shape as Gemini for drop-in replacement */
export type VertexImagenResult = GeminiImageResult;

export class VertexImagenTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VertexImagenTimeoutError';
	}
}

export class VertexImagenGenerationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VertexImagenGenerationError';
	}
}

/** Imagen 3 (imagen-3.0-generate-002) supported aspect ratios per API. 4:5 and 5:4 are NOT supported → map to nearest. */
const IMAGEN_ASPECT_RATIOS: Record<string, string> = {
	'1:1': '1:1',
	'3:4': '3:4',
	'4:3': '4:3',
	'16:9': '16:9',
	'9:16': '9:16',
	'4:5': '3:4',   // API rejects 4:5 → use 3:4 (closest portrait)
	'5:4': '4:3',   // API rejects 5:4 → use 4:3 (closest landscape)
	'2:3': '3:4',
	'3:2': '4:3',
	'21:9': '16:9',
};

@Injectable()
export class VertexImagenService {
	private readonly logger = new Logger(VertexImagenService.name);
	private readonly TIMEOUT_MS = 180 * 1000; // 3 min

	constructor(private readonly configService: ConfigService) {}

	private getProjectId(): string {
		const id = this.configService.get<string>('vertex.projectId') || process.env.VERTEX_PROJECT_ID;
		if (!id) {
			this.logger.error('VERTEX_PROJECT_ID is missing');
			throw new InternalServerErrorException('Vertex AI: VERTEX_PROJECT_ID is not set');
		}
		return id;
	}

	private getLocation(): string {
		return this.configService.get<string>('vertex.location') || process.env.VERTEX_LOCATION || 'us-central1';
	}

	private getModel(): string {
		return this.configService.get<string>('vertex.imagenModel') || process.env.VERTEX_IMAGEN_MODEL || 'imagen-3.0-generate-002';
	}

	private mapAspectRatio(dtoRatio?: string): string {
		if (!dtoRatio || typeof dtoRatio !== 'string') return '1:1';
		const n = dtoRatio.trim();
		return IMAGEN_ASPECT_RATIOS[n] ?? '1:1';
	}

	private mapSampleImageSize(resolution?: string): string {
		if (!resolution || typeof resolution !== 'string') return '1K';
		const upper = resolution.trim().toUpperCase();
		// Imagen supports 1K, 2K (4K -> 2K)
		if (upper === '4K') return '2K';
		return VALID_IMAGE_SIZES.includes(upper as any) ? upper : '1K';
	}

	private async getAccessToken(): Promise<string> {
		try {
			const auth = new GoogleAuth({
				scopes: ['https://www.googleapis.com/auth/cloud-platform'],
			});
			const client = await auth.getClient();
			const tokenResponse = await client.getAccessToken();
			const token = tokenResponse.token;
			if (!token) {
				this.logger.error('Vertex AI: getAccessToken returned no token. Check GOOGLE_APPLICATION_CREDENTIALS path or run: gcloud auth application-default login');
				throw new InternalServerErrorException('Vertex AI: No access token. Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path, or run: gcloud auth application-default login');
			}
			return token;
		} catch (e: any) {
			if (e instanceof InternalServerErrorException) throw e;
			this.logger.error(`Vertex AI auth failed: ${e?.message || e}`);
			const hint = process.env.GOOGLE_APPLICATION_CREDENTIALS
				? `File at GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS} may be missing or invalid.`
				: 'Set GOOGLE_APPLICATION_CREDENTIALS to service account JSON path, or run: gcloud auth application-default login';
			throw new InternalServerErrorException(`Vertex AI: ${hint} Error: ${e?.message || String(e)}`);
		}
	}

	private withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
		return new Promise((resolve, reject) => {
			const t = setTimeout(() => reject(new VertexImagenTimeoutError(`${name} timed out after ${ms / 1000}s`)), ms);
			promise.then((r) => { clearTimeout(t); resolve(r); }).catch((e) => { clearTimeout(t); reject(e); });
		});
	}

	/**
	 * Generate one image via Vertex AI Imagen 3 predict API.
	 * Returns same shape as GeminiService.generateImage for drop-in use.
	 * @param _modelName Optional model override (e.g. user's gemini_model saved as Imagen model).
	 */
	async generateImage(
		prompt: string,
		_modelName?: string,
		aspectRatio?: string,
		resolution?: string,
		_userApiKey?: string
	): Promise<VertexImagenResult> {
		const projectId = this.getProjectId();
		const location = this.getLocation();
		const model = (_modelName && _modelName.trim()) ? _modelName.trim() : this.getModel();
		const ratio = this.mapAspectRatio(aspectRatio);
		const sampleImageSize = this.mapSampleImageSize(resolution);

		if (!prompt || !prompt.trim()) {
			this.logger.error('generateImage called with empty prompt');
			throw new VertexImagenGenerationError('Prompt is required');
		}

		const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

		const body = {
			instances: [{ prompt: prompt.trim() }],
			parameters: {
				sampleCount: 1,
				aspectRatio: ratio,
				sampleImageSize,
				personGeneration: 'allow_adult',
				safetySetting: 'block_medium_and_above',
				includeRaiReason: true,
			},
		};

		this.logger.log(`🎨 [Vertex Imagen 3] Generating image | project=${projectId} location=${location} model=${model} aspect=${ratio} size=${sampleImageSize}`);

		const token = await this.getAccessToken();

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			if (!res.ok) {
				const errText = await res.text();
				this.logger.error(`Vertex Imagen API error ${res.status}: ${errText}`);
				// Try to parse JSON error for clearer message
				let errMessage = errText.substring(0, 400);
				try {
					const errJson = JSON.parse(errText);
					const msg = errJson?.error?.message || errJson?.message || errText;
					errMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
				} catch {
					// keep errMessage as errText substring
				}
				throw new VertexImagenGenerationError(`Vertex AI error ${res.status}: ${errMessage}`);
			}

			const data = (await res.json()) as {
				predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string; raiFilteredReason?: string; [k: string]: unknown }>;
				raiFilteredReason?: string;
			};
			const predictions = data?.predictions;
			if (!predictions?.length || !predictions[0].bytesBase64Encoded) {
				const first = predictions?.[0] as Record<string, unknown> | undefined;
				const rai = (first?.raiFilteredReason as string) || (data.raiFilteredReason as string);
				if (rai) {
					this.logger.warn(`Vertex Imagen RAI filter: ${rai}`);
					throw new VertexImagenGenerationError(`Image filtered by safety: ${rai}`);
				}
				const logged = JSON.stringify(data).slice(0, 800);
				this.logger.warn(`Vertex AI returned no image. Response (truncated): ${logged}`);
				throw new VertexImagenGenerationError('Vertex AI returned no image (check logs for RAI/safety reason)');
			}

			const first = predictions[0];
			this.logger.log('✅ [Vertex Imagen 3] Image generated successfully');
			return {
				mimeType: first.mimeType || 'image/png',
				data: first.bytesBase64Encoded,
			};
		} catch (e: any) {
			clearTimeout(timeoutId);
			if (e.name === 'AbortError') {
				throw new InternalServerErrorException('Vertex Imagen request timed out. Try again.');
			}
			if (e instanceof VertexImagenGenerationError || e instanceof VertexImagenTimeoutError) {
				throw new InternalServerErrorException(e.message);
			}
			throw new InternalServerErrorException(`Vertex Imagen error: ${e?.message || String(e)}`);
		}
	}

	/**
	 * Generate multiple images (same interface as Gemini for compatibility).
	 */
	async generateImages(
		prompt: string,
		aspectRatio?: string,
		resolution?: string,
		_userApiKey?: string
	): Promise<{ images: VertexImagenResult[] }> {
		const one = await this.generateImage(prompt, undefined, aspectRatio, resolution, _userApiKey);
		return { images: [one] };
	}

	getModelName(): string {
		return this.getModel();
	}

	isConfigured(): boolean {
		try {
			this.getProjectId();
			return true;
		} catch {
			return false;
		}
	}
}
