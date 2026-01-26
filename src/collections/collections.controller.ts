import { Controller, Get, Post, Body, Param, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import 'multer';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateCollectionDto, UpdateCollectionDto, FixedElementsDto, UpdatePromptTemplatesDto, UpdateDAJsonDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Collection } from '../database/entities/collection.entity';
import { AnalyzedDAJSON, FixedElements } from '../common/interfaces/da-json.interface';

// Predefined DA (Direction Artistique) Templates - Decorators for visual generation
export interface DATemplate {
	code: string;
	name: string;
	description: string;
	fixed_elements: {
		background: string;
		lighting: string;
		decor: string[];
		model_styling: string;
		mood: string;
		color_palette: string[];
	};
}

/**
 * Predefined DA Templates - READ-ONLY for users
 * Users can SELECT these but CANNOT modify them
 * Only admins can add/edit DA templates (done in code)
 */
const DA_TEMPLATES: DATemplate[] = [
	{
		code: 'ss26',
		name: 'SS26',
		description: 'Summer studio, bright natural lighting',
		fixed_elements: {
			background: 'Clean white cyclorama with soft shadows',
			lighting: 'Natural daylight simulation, soft fill light, minimal shadows',
			decor: ['Potted tropical plants', 'Natural wood elements', 'White linen drapes'],
			model_styling: 'Light beige chinos, white canvas sneakers, minimal jewelry',
			mood: 'Fresh, optimistic, breezy summer vibes',
			color_palette: ['#FFFFFF', '#F5F5DC', '#87CEEB', '#90EE90'],
		},
	},
	{
		code: 'fw26',
		name: 'FW26',
		description: 'Winter elegance, warm tones',
		fixed_elements: {
			background: 'Dark charcoal textured wall with subtle spotlight',
			lighting: 'Dramatic side lighting, warm tungsten accents, deep shadows',
			decor: ['Vintage leather armchair', 'Stacked hardcover books', 'Brass desk lamp'],
			model_styling: 'Dark wool trousers, oxford leather shoes, vintage watch',
			mood: 'Sophisticated, cozy, intellectual warmth',
			color_palette: ['#2C2C2C', '#8B4513', '#DAA520', '#F5F5DC'],
		},
	},
	{
		code: 'blood',
		name: 'BLOOD',
		description: 'Dark dramatic aesthetic',
		fixed_elements: {
			background: 'Deep matte black studio wall with red accent lighting',
			lighting: 'High contrast dramatic lighting, sharp shadows, red rim lights',
			decor: ['Black geometric sculptures', 'Smoked glass elements', 'Metallic red accents'],
			model_styling: 'All black outfit, black leather boots, silver rings',
			mood: 'Bold, dramatic, powerful, edgy',
			color_palette: ['#0A0A0A', '#8B0000', '#1A1A1A', '#C41E3A'],
		},
	},
	{
		code: 'minimal',
		name: 'MINIMAL',
		description: 'Ultra-clean minimalist',
		fixed_elements: {
			background: 'Pure white infinity cove, no visible edges',
			lighting: 'Even, shadowless lighting from all sides',
			decor: [],
			model_styling: 'Black slim-fit trousers, white minimalist sneakers',
			mood: 'Clean, modern, product-focused',
			color_palette: ['#FFFFFF', '#000000', '#808080'],
		},
	},
	{
		code: 'urban',
		name: 'URBAN',
		description: 'Streetwear setting',
		fixed_elements: {
			background: 'Industrial concrete wall with exposed brick accents',
			lighting: 'Mixed natural and neon accent lighting',
			decor: ['Graffiti art element', 'Metal scaffolding', 'Street signage'],
			model_styling: 'Relaxed cargo pants, chunky sneakers, silver chain',
			mood: 'Edgy, authentic, street culture',
			color_palette: ['#808080', '#FF6B6B', '#4ECDC4', '#2C3E50'],
		},
	},
	{
		code: 'nature',
		name: 'NATURE',
		description: 'Organic earth tones',
		fixed_elements: {
			background: 'Sage green seamless paper with natural texture',
			lighting: 'Golden hour simulation, warm and soft',
			decor: ['Dried botanical arrangements', 'Raw wood stumps', 'Natural stone elements'],
			model_styling: 'Earth-tone linen pants, leather sandals, woven bracelet',
			mood: 'Organic, sustainable, earth-connected',
			color_palette: ['#A3B18A', '#588157', '#DAD7CD', '#3A5A40'],
		},
	},
	{
		code: 'luxury',
		name: 'LUXURY',
		description: 'High-end editorial',
		fixed_elements: {
			background: 'Rich velvet curtain backdrop in deep burgundy',
			lighting: 'Rembrandt lighting with soft gold reflectors',
			decor: ['Marble pedestal', 'Crystal decanter', 'Fresh white orchids'],
			model_styling: 'Tailored black trousers, Italian leather loafers, gold cufflinks',
			mood: 'Opulent, refined, aspirational',
			color_palette: ['#722F37', '#D4AF37', '#1C1C1C', '#F8F8FF'],
		},
	},
	{
		code: 'coastal',
		name: 'COASTAL',
		description: 'Mediterranean vibes',
		fixed_elements: {
			background: 'Light sandy beige backdrop with subtle wave texture',
			lighting: 'Soft golden morning light, ocean reflection simulation',
			decor: ['Wicker furniture', 'Seashells', 'White cotton throws', 'Driftwood pieces'],
			model_styling: 'Linen shorts, espadrilles, straw hat nearby',
			mood: 'Relaxed, vacation, coastal elegance',
			color_palette: ['#F5DEB3', '#87CEEB', '#FFFFFF', '#DEB887'],
		},
	},
];

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
	constructor(private readonly collectionsService: CollectionsService) {}

	// ==================== PUBLIC ENDPOINTS (Decorators/DA Templates) ====================
	
	/**
	 * Get all DA Templates (Decorators) - PUBLIC endpoint
	 * These are predefined studio environments for product visual generation
	 */
	@Public()
	@Get('decorators')
	getDecorators(): DATemplate[] {
		return DA_TEMPLATES;
	}

	/**
	 * Get a specific DA Template by code - PUBLIC endpoint
	 */
	@Public()
	@Get('decorators/:code')
	getDecorator(@Param('code') code: string): DATemplate | null {
		return DA_TEMPLATES.find(t => t.code === code) || null;
	}

	// ==================== AUTHENTICATED ENDPOINTS ====================

	@Get('getAllCollections')
	async getAllCollections(@CurrentUser() user: User): Promise<Collection[]> {
		return this.collectionsService.findAll(user.id);
	}

	@Post('createCollection')
	async createCollection(
		@CurrentUser() user: User,
		@Body() createCollectionDto: CreateCollectionDto,
	): Promise<Collection> {
		return this.collectionsService.create(user.id, createCollectionDto);
	}

	@Post('updateCollection/:id')
	async updateCollection(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateCollectionDto: UpdateCollectionDto,
	): Promise<Collection> {
		return this.collectionsService.update(id, user.id, updateCollectionDto);
	}

	@Post('updateFixedElements/:id')
	async updateFixedElementsCollection(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() fixedElementsDto: FixedElementsDto,
	): Promise<Collection> {
		return this.collectionsService.updateFixedElements(id, user.id, fixedElementsDto);
	}

	@Post('updatePromptTemplates/:id')
	async updatePromptTemplatesCollection(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updatePromptTemplatesDto: UpdatePromptTemplatesDto,
	): Promise<Collection> {
		return this.collectionsService.updatePromptTemplates(id, user.id, updatePromptTemplatesDto);
	}

	@Post('deleteCollection/:id')
	async deleteCollection(@Param('id') id: string, @CurrentUser() user: User): Promise<{ message: string }> {
		return this.collectionsService.remove(id, user.id);
	}

	/**
	 * STEP 2: Analyze DA Reference (STEP 2)
	 * POST /api/collections/:id/analyze-da
	 * Accepts optional 'image' file via FormData
	 */
	@Post(':id/analyze-da')
	@UseInterceptors(FileInterceptor('image'))
	async analyzeDA(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@UploadedFile() imageFile?: Express.Multer.File,
	): Promise<{ collection_id: string; analyzed_da_json: AnalyzedDAJSON; fixed_elements: FixedElements; status: string; analyzed_at: string }> {
		const analyzedDAJSON = await this.collectionsService.analyzeDA(id, user.id, imageFile);
		const collection = await this.collectionsService.findOne(id, user.id);
		return {
			collection_id: id,
			analyzed_da_json: analyzedDAJSON,
			fixed_elements: collection.fixed_elements as FixedElements,
			status: 'analyzed',
			analyzed_at: analyzedDAJSON.analyzed_at || new Date().toISOString(),
		};
	}

	/**
	 * STEP 4: Update DA JSON (User Edits)
	 * PUT /api/collections/:id/da-json
	 */
	@Post('updateDAJson/:id')
	async updateDAJSON(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateDAJsonDto: UpdateDAJsonDto,
	): Promise<{ analyzed_da_json: AnalyzedDAJSON; fixed_elements: FixedElements; updated_at: string }> {
		const result = await this.collectionsService.updateDAJSON(
			id,
			user.id,
			updateDAJsonDto.analyzed_da_json,
			updateDAJsonDto.fixed_elements
		);
		return {
			...result,
			updated_at: new Date().toISOString(),
		};
	}

	/**
	 * Get Collection with Full DA Data
	 * GET /api/collections/:id (enhanced response)
	 */
	@Get('getCollection/:id')
	async getCollectionWithDA(@Param('id') id: string, @CurrentUser() user: User): Promise<Collection> {
		return this.collectionsService.getWithDA(id, user.id);
	}
}
