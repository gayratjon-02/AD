import {
	Injectable,
	Logger,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelReference } from '../database/entities/Product-Visuals/model-reference.entity';
import { ClaudeService } from '../ai/claude.service';

@Injectable()
export class ModelReferencesService {
	private readonly logger = new Logger(ModelReferencesService.name);

	constructor(
		@InjectRepository(ModelReference)
		private modelReferencesRepository: Repository<ModelReference>,
		private readonly claudeService: ClaudeService,
	) {}

	async create(
		userId: string,
		brandId: string,
		name: string,
		type: 'adult' | 'kid',
		imageUrl: string,
	): Promise<ModelReference> {
		const modelRef = this.modelReferencesRepository.create({
			user_id: userId,
			brand_id: brandId,
			name,
			type,
			image_url: imageUrl,
		});

		const saved = await this.modelReferencesRepository.save(modelRef);

		// Analyze model reference photo with Claude (async, non-blocking)
		this.analyzeModelInBackground(saved.id, imageUrl).catch((err) => {
			this.logger.warn(`Failed to analyze model reference ${saved.id}: ${err.message}`);
		});

		return saved;
	}

	private async analyzeModelInBackground(modelRefId: string, imageUrl: string): Promise<void> {
		try {
			this.logger.log(`🧑 Starting Claude analysis for model reference ${modelRefId}`);
			const description = await this.claudeService.analyzeModelReference(imageUrl);

			await this.modelReferencesRepository.update(modelRefId, { description });
			this.logger.log(`🧑 Model reference ${modelRefId} description saved (${description.length} chars)`);
		} catch (error: any) {
			this.logger.error(`🧑 Model reference analysis failed: ${error.message}`);
		}
	}

	async findAllByBrand(brandId: string, userId: string): Promise<ModelReference[]> {
		return this.modelReferencesRepository.find({
			where: { brand_id: brandId, user_id: userId },
			order: { created_at: 'DESC' },
		});
	}

	async findOne(id: string, userId: string): Promise<ModelReference> {
		const modelRef = await this.modelReferencesRepository.findOne({
			where: { id },
		});

		if (!modelRef) {
			throw new NotFoundException('Model reference not found');
		}

		if (modelRef.user_id !== userId) {
			throw new ForbiddenException('You do not own this model reference');
		}

		return modelRef;
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const modelRef = await this.findOne(id, userId);
		await this.modelReferencesRepository.remove(modelRef);
		return { message: 'Model reference deleted successfully' };
	}
}
