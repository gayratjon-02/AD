import {
	Injectable,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelReference } from '../database/entities/Product-Visuals/model-reference.entity';

@Injectable()
export class ModelReferencesService {
	constructor(
		@InjectRepository(ModelReference)
		private modelReferencesRepository: Repository<ModelReference>,
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

		return this.modelReferencesRepository.save(modelRef);
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
