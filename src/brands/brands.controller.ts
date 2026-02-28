import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	ParseUUIDPipe,
	BadRequestException,
	Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BrandsService } from './brands.service';
import { FilesService } from '../files/files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateBrandDto, UpdateBrandDto } from '../libs/dto';
import { User } from '../database/entities/Product-Visuals/user.entity';
import { Brand } from '../database/entities/Product-Visuals/brand.entity';
import { SuccessMessage, FileMessage } from '../libs/enums';

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
	constructor(
		private readonly brandsService: BrandsService,
		private readonly filesService: FilesService,
	) {}

	@Get('getAllBrands')
	async getAllBrands(@CurrentUser() user: User): Promise<Brand[]> {
		return this.brandsService.findAll(user.id);
	}

	@Get('getBrand/:id')
	async getBrand(@Param('id') id: string, @CurrentUser() user: User): Promise<Brand> {
		return this.brandsService.findOne(id, user.id);
	}

	@Post('createBrand')
	async createBrand(@CurrentUser() user: User, @Body() createBrandDto: CreateBrandDto): Promise<Brand> {
		console.log('Creating brand with data:', createBrandDto);
		return this.brandsService.create(user.id, createBrandDto);
	}

	@Post('updateBrand/:id')
	async updateBrand(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateBrandDto: UpdateBrandDto,
	): Promise<Brand> {
		return this.brandsService.update(id, user.id, updateBrandDto);
	}

	@Post('deleteBrand/:id')
	async deleteBrand(@Param('id') id: string, @CurrentUser() user: User): Promise<{ message: string }> {
		return this.brandsService.remove(id, user.id);
	}

	// ═══════════════════════════════════════════════════════════
	// MODEL REFERENCE UPLOAD (Model Consistency — Milestone 3)
	// ═══════════════════════════════════════════════════════════

	@Post(':id/model-reference')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			fileFilter: (_req, file, cb) => {
				if (file.mimetype.startsWith('image/')) {
					cb(null, true);
				} else {
					cb(new BadRequestException(FileMessage.INVALID_FILE_TYPE), false);
				}
			},
			limits: { fileSize: 10 * 1024 * 1024 },
		}),
	)
	async uploadModelReference(
		@Param('id', ParseUUIDPipe) id: string,
		@CurrentUser() user: User,
		@UploadedFile() file: Express.Multer.File,
		@Query('type') type: 'adult' | 'kid',
	) {
		if (!file) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}
		if (!type || !['adult', 'kid'].includes(type)) {
			throw new BadRequestException('Query parameter "type" must be "adult" or "kid"');
		}

		const stored = await this.filesService.storeImage(file, 'brands/model-references');

		const brand = await this.brandsService.updateModelReference(id, user.id, type, stored.url);

		return {
			success: true,
			message: SuccessMessage.BRAND_UPDATED,
			data: {
				model_adult_url: brand.model_adult_url,
				model_kid_url: brand.model_kid_url,
			},
		};
	}
}
