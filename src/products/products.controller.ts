import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFiles,
	Query,
	BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import 'multer';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProductDto, UpdateProductDto, UploadProductDto, AnalyzeImagesDto, UpdateProductJsonDto } from '../libs/dto';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { User } from '../database/entities/user.entity';
import { Product } from '../database/entities/product.entity';
import { FilesService } from '../files/files.service';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
	constructor(
		private readonly productsService: ProductsService,
		private readonly filesService: FilesService,
	) {}

	/**
	 * Create Product (client workflow step 3)
	 * POST /api/products
	 * FormData: name, collection_id, front_image (required), back_image (optional), reference_images[] (optional, up to 12).
	 * No analysis at create — use POST /api/products/:id/analyze after.
	 */
	@Post()
	@UseInterceptors(
		FileFieldsInterceptor(
			[
				{ name: 'front_image', maxCount: 1 },
				{ name: 'back_image', maxCount: 1 },
				{ name: 'reference_images', maxCount: 12 },
			],
			{
				limits: { fileSize: 30 * 1024 * 1024 }, // 30MB per file
			},
		),
	)
	async create(
		@CurrentUser() user: User,
		@Body() uploadProductDto: UploadProductDto,
		@UploadedFiles()
		files: {
			front_image?: Express.Multer.File[];
			back_image?: Express.Multer.File[];
			reference_images?: Express.Multer.File[];
		},
	): Promise<Product> {
		const frontImage = files?.front_image?.[0];
		const backImage = files?.back_image?.[0];
		const referenceImages = files?.reference_images || [];

		if (!frontImage) {
			throw new BadRequestException('Front image is required. Upload front packshot (product front view).');
		}

		const storedFront = await this.filesService.storeImage(frontImage);
		const storedBack = backImage ? await this.filesService.storeImage(backImage) : null;
		const storedRefs = referenceImages.length
			? await Promise.all(referenceImages.map((file) => this.filesService.storeImage(file)))
			: [];

		const createProductDto: CreateProductDto = {
			name: uploadProductDto.name,
			collection_id: uploadProductDto.collection_id,
			front_image_url: storedFront.url,
			back_image_url: storedBack?.url ?? null,
			reference_images: storedRefs.length ? storedRefs.map((r) => r.url) : null,
		};

		return this.productsService.create(user.id, createProductDto);
	}

	@Get('getAllProducts')
	async getAllProducts(
		@CurrentUser() user: User,
		@Query('collection_id') collectionId?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
		return this.productsService.findAll(user.id, {
			collection_id: collectionId,
			page: page ? parseInt(page, 10) : undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		});
	}

	@Post('updateProduct/:id')
	async updateProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductDto: UpdateProductDto,
	): Promise<Product> {
		return this.productsService.update(id, user.id, updateProductDto);
	}

	@Post('deleteProduct/:id')
	async deleteProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ message: string }> {
		return this.productsService.remove(id, user.id);
	}

	@Post('analyze-images')
	async analyzeImages(
		@CurrentUser() user: User,
		@Body() analyzeImagesDto: AnalyzeImagesDto,
	): Promise<{ prompt: string; extracted_variables: Record<string, any> }> {
		return this.productsService.analyzeImages(
			analyzeImagesDto.images,
			analyzeImagesDto.productName,
			analyzeImagesDto.brandBrief,
		);
	}

	/**
	 * STEP 1: Analyze Product (STEP 1)
	 * POST /api/products/:id/analyze
	 */
	@Post(':id/analyze')
	async analyzeProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ product_id: string; analyzed_product_json: AnalyzedProductJSON; status: string; analyzed_at: string }> {
		const analyzedProductJSON = await this.productsService.analyzeProduct(id, user.id);
		return {
			product_id: id,
			analyzed_product_json: analyzedProductJSON,
			status: 'analyzed',
			analyzed_at: analyzedProductJSON.analyzed_at || new Date().toISOString(),
		};
	}

	/**
	 * STEP 2: Update Product JSON (User Edits)
	 * PUT /api/products/:id/product-json
	 */
	@Post('updateProductJson/:id')
	async updateProductJSON(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductJsonDto: UpdateProductJsonDto,
	): Promise<{ analyzed_product_json: AnalyzedProductJSON; final_product_json: AnalyzedProductJSON; updated_at: string }> {
		const product = await this.productsService.findOne(id, user.id);
		const finalProductJSON = await this.productsService.updateProductJSON(id, user.id, updateProductJsonDto.manual_overrides);
		return {
			analyzed_product_json: product.analyzed_product_json as AnalyzedProductJSON,
			final_product_json: finalProductJSON,
			updated_at: new Date().toISOString(),
		};
	}

	/**
	 * Get Product with JSONs
	 * GET /api/products/:id (enhanced response)
	 */
	@Get('getProduct/:id')
	async getProductWithJSONs(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<Product> {
		return this.productsService.findOne(id, user.id);
	}
}
