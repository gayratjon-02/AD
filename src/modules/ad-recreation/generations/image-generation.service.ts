import {
    Injectable,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AdGenerationMessage } from '../../../libs/messages';

/**
 * Image Generation Service
 *
 * Uses Google Gemini Imagen API (API Key auth, no Service Accounts)
 * to generate ad images from text prompts.
 */
@Injectable()
export class ImageGenerationService {
    private readonly logger = new Logger(ImageGenerationService.name);
    private readonly apiKey: string;
    private readonly model: string;

    constructor(private readonly configService: ConfigService) {
        const key = this.configService.get<string>('GEMINI_API_KEY');
        if (!key) {
            this.logger.warn('GEMINI_API_KEY is not configured');
        }
        this.apiKey = key || '';
        this.model = this.configService.get<string>('VERTEX_IMAGEN_MODEL') || 'imagen-3.0-generate-002';
    }

    // ═══════════════════════════════════════════════════════════
    // GENERATE IMAGE FROM PROMPT
    // ═══════════════════════════════════════════════════════════

    async generateImageFromPrompt(
        prompt: string,
        aspectRatio: string,
    ): Promise<Buffer> {
        if (!this.apiKey) {
            throw new InternalServerErrorException(AdGenerationMessage.GEMINI_API_KEY_MISSING);
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predict?key=${this.apiKey}`;

        this.logger.log(`Calling Imagen API (model: ${this.model}, ratio: ${aspectRatio}, prompt: ${prompt.substring(0, 80)}...)`);

        try {
            const response = await axios.post(
                url,
                {
                    instances: [{ prompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio,
                    },
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000,
                },
            );

            const predictions = response.data?.predictions;
            if (!predictions || predictions.length === 0) {
                throw new Error('No predictions returned from Imagen API');
            }

            const base64Data = predictions[0].bytesBase64Encoded;
            if (!base64Data) {
                throw new Error('No image data in Imagen API response');
            }

            const imageBuffer = Buffer.from(base64Data, 'base64');
            this.logger.log(`Image generated: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

            return imageBuffer;
        } catch (error) {
            if (error instanceof InternalServerErrorException) throw error;

            const errMsg = error instanceof Error ? error.message : String(error);
            const axiosData = axios.isAxiosError(error) ? JSON.stringify(error.response?.data || {}) : '';

            this.logger.error(`Imagen API call failed: ${errMsg} ${axiosData}`);
            throw new InternalServerErrorException(AdGenerationMessage.RENDER_FAILED);
        }
    }
}
