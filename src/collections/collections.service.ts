import {
	Injectable,
	NotFoundException,
	ForbiddenException,
	BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from '../database/entities/collection.entity';
import { Brand } from '../database/entities/brand.entity';
import {
	CreateCollectionDto,
	UpdateCollectionDto,
	FixedElementsDto,
	UpdatePromptTemplatesDto,
} from '../libs/dto';
import { NotFoundMessage, PermissionMessage, FileMessage } from '../libs/enums';
import { ClaudeService } from '../ai/claude.service';
import { AnalyzedDAJSON, FixedElements } from '../common/interfaces/da-json.interface';

@Injectable()
export class CollectionsService {
	constructor(
		@InjectRepository(Collection)
		private collectionsRepository: Repository<Collection>,
		@InjectRepository(Brand)
		private brandsRepository: Repository<Brand>,
		private readonly claudeService: ClaudeService,
	) {}

	async create(
		userId: string,
		createCollectionDto: CreateCollectionDto,
	): Promise<Collection> {
		const brand = await this.brandsRepository.findOne({
			where: { id: createCollectionDto.brand_id },
		});

		if (!brand) {
			throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
		}

		if (brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		const collection = this.collectionsRepository.create({
			name: createCollectionDto.name,
			brand_id: createCollectionDto.brand_id,
			fixed_elements: createCollectionDto.fixed_elements || null,
			prompt_templates: createCollectionDto.prompt_templates || null,
		});

		return this.collectionsRepository.save(collection);
	}

	async findAll(userId: string): Promise<Collection[]> {
		return this.collectionsRepository.find({
			relations: ['brand'],
			where: { brand: { user_id: userId } },
			order: { created_at: 'DESC' },
		});
	}

	async findOne(id: string, userId: string): Promise<Collection> {
		const collection = await this.collectionsRepository.findOne({
			where: { id },
			relations: ['brand'],
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		if (!collection.brand || collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return collection;
	}

	async update(
		id: string,
		userId: string,
		updateCollectionDto: UpdateCollectionDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);

		if (
			updateCollectionDto.brand_id &&
			updateCollectionDto.brand_id !== collection.brand_id
		) {
			const brand = await this.brandsRepository.findOne({
				where: { id: updateCollectionDto.brand_id },
			});

			if (!brand) {
				throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
			}

			if (brand.user_id !== userId) {
				throw new ForbiddenException(PermissionMessage.NOT_OWNER);
			}

			collection.brand_id = updateCollectionDto.brand_id;
		}

		if (updateCollectionDto.name !== undefined) {
			collection.name = updateCollectionDto.name;
		}

		if (updateCollectionDto.fixed_elements !== undefined) {
			collection.fixed_elements = updateCollectionDto.fixed_elements;
		}

		if (updateCollectionDto.prompt_templates !== undefined) {
			collection.prompt_templates = updateCollectionDto.prompt_templates;
		}

		return this.collectionsRepository.save(collection);
	}

	async updateFixedElements(
		id: string,
		userId: string,
		fixedElementsDto: FixedElementsDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);
		collection.fixed_elements = fixedElementsDto;
		return this.collectionsRepository.save(collection);
	}

	async updatePromptTemplates(
		id: string,
		userId: string,
		updatePromptTemplatesDto: UpdatePromptTemplatesDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);
		collection.prompt_templates = updatePromptTemplatesDto.prompt_templates;
		return this.collectionsRepository.save(collection);
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const collection = await this.findOne(id, userId);
		await this.collectionsRepository.remove(collection);
		return { message: 'Collection deleted successfully' };
	}

	/**
	 * STEP 2: Analyze DA reference image with Claude
	 */
	async analyzeDA(collectionId: string, userId: string, imageFile?: File): Promise<AnalyzedDAJSON> {
		const collection = await this.findOne(collectionId, userId);

		// If image file provided, update da_reference_image_url first
		// (This would typically be handled by file upload service)
		// For now, we assume da_reference_image_url is already set

		if (!collection.da_reference_image_url) {
			throw new BadRequestException('DA reference image URL is required');
		}

		// Analyze with Claude
		const analyzedDAJSON = await this.claudeService.analyzeDAReference(
			collection.da_reference_image_url
		);

		// Auto-generate fixed_elements from analyzed DA
		const fixedElements = this.generateFixedElementsFromDA(analyzedDAJSON);

		// Save to collection
		collection.analyzed_da_json = analyzedDAJSON;
		collection.fixed_elements = fixedElements;
		await this.collectionsRepository.save(collection);

		return analyzedDAJSON;
	}

	/**
	 * Update DA JSON (user edits)
	 */
	async updateDAJSON(
		collectionId: string,
		userId: string,
		updates: Partial<AnalyzedDAJSON> | null,
		fixedElements?: Partial<FixedElements>
	): Promise<{ analyzed_da_json: AnalyzedDAJSON; fixed_elements: FixedElements }> {
		const collection = await this.findOne(collectionId, userId);

		if (!collection.analyzed_da_json) {
			throw new BadRequestException('DA must be analyzed first');
		}

		// Merge updates
		if (updates) {
			collection.analyzed_da_json = {
				...collection.analyzed_da_json,
				...updates,
				// Deep merge nested objects
				background: updates.background
					? { ...collection.analyzed_da_json.background, ...updates.background }
					: collection.analyzed_da_json.background,
				props: updates.props
					? { ...collection.analyzed_da_json.props, ...updates.props }
					: collection.analyzed_da_json.props,
				lighting: updates.lighting
					? { ...collection.analyzed_da_json.lighting, ...updates.lighting }
					: collection.analyzed_da_json.lighting,
				composition: updates.composition
					? { ...collection.analyzed_da_json.composition, ...updates.composition }
					: collection.analyzed_da_json.composition,
				styling: updates.styling
					? { ...collection.analyzed_da_json.styling, ...updates.styling }
					: collection.analyzed_da_json.styling,
				camera: updates.camera
					? { ...collection.analyzed_da_json.camera, ...updates.camera }
					: collection.analyzed_da_json.camera,
			} as AnalyzedDAJSON;
		}

		// Update fixed_elements
		if (fixedElements) {
			collection.fixed_elements = {
				...(collection.fixed_elements || {}),
				...fixedElements,
			} as FixedElements;
		}

		await this.collectionsRepository.save(collection);

		return {
			analyzed_da_json: collection.analyzed_da_json as AnalyzedDAJSON,
			fixed_elements: collection.fixed_elements as FixedElements,
		};
	}

	/**
	 * Get collection with full DA data
	 */
	async getWithDA(collectionId: string, userId: string): Promise<Collection> {
		return this.findOne(collectionId, userId);
	}

	/**
	 * Get all collections for brand
	 */
	async findByBrand(brandId: string, userId: string): Promise<Collection[]> {
		const brand = await this.brandsRepository.findOne({
			where: { id: brandId },
		});

		if (!brand) {
			throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
		}

		if (brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return this.collectionsRepository.find({
			where: { brand_id: brandId },
			order: { created_at: 'DESC' },
		});
	}

	/**
	 * Generate fixed_elements from analyzed DA JSON
	 */
	private generateFixedElementsFromDA(daJSON: AnalyzedDAJSON): FixedElements {
		return {
			background: {
				wall_hex: daJSON.background.color_hex,
				wall_description: daJSON.background.description,
				floor_hex: daJSON.background.color_hex, // Default to same as wall, can be overridden
				floor_description: daJSON.background.description,
			},
			props: {
				left: daJSON.props.items.slice(0, Math.ceil(daJSON.props.items.length / 2)),
				right: daJSON.props.items.slice(Math.ceil(daJSON.props.items.length / 2)),
				center: [],
			},
			styling: {
				bottom: daJSON.styling.bottom,
				feet: daJSON.styling.feet,
			},
			lighting: daJSON.lighting.type,
			mood: daJSON.mood,
			composition_defaults: {
				duo: daJSON.composition.layout,
				solo: daJSON.composition.layout,
			},
		};
	}
}
