import {
	Controller,
	Get,
	Post,
	Param,
	Query,
	Body,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	ParseUUIDPipe,
	BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ModelReferencesService } from './model-references.service';
import { FilesService } from '../files/files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../database/entities/Product-Visuals/user.entity';

@Controller('model-references')
@UseGuards(JwtAuthGuard)
export class ModelReferencesController {
	constructor(
		private readonly modelReferencesService: ModelReferencesService,
		private readonly filesService: FilesService,
	) {}

	@Post('upload')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			fileFilter: (_req, file, cb) => {
				if (file.mimetype.startsWith('image/')) {
					cb(null, true);
				} else {
					cb(new BadRequestException('Only image files are allowed'), false);
				}
			},
			limits: { fileSize: 10 * 1024 * 1024 },
		}),
	)
	async upload(
		@CurrentUser() user: User,
		@UploadedFile() file: Express.Multer.File,
		@Body('brand_id') brandId: string,
		@Body('name') name: string,
		@Body('type') type: 'adult' | 'kid',
	) {
		if (!file) {
			throw new BadRequestException('File is required');
		}
		if (!brandId) {
			throw new BadRequestException('brand_id is required');
		}
		if (!name) {
			throw new BadRequestException('name is required');
		}
		if (!type || !['adult', 'kid'].includes(type)) {
			throw new BadRequestException('type must be "adult" or "kid"');
		}

		const stored = await this.filesService.storeImage(file, 'model-references');

		const modelRef = await this.modelReferencesService.create(
			user.id,
			brandId,
			name,
			type,
			stored.url,
		);

		return {
			success: true,
			message: 'Model reference created',
			data: modelRef,
		};
	}

	@Get()
	async findAll(
		@CurrentUser() user: User,
		@Query('brand_id') brandId: string,
	) {
		if (!brandId) {
			throw new BadRequestException('brand_id query parameter is required');
		}

		const models = await this.modelReferencesService.findAllByBrand(brandId, user.id);

		return {
			success: true,
			data: models,
		};
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
		@CurrentUser() user: User,
	) {
		const modelRef = await this.modelReferencesService.findOne(id, user.id);
		return {
			success: true,
			data: modelRef,
		};
	}

	@Post('delete/:id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
		@CurrentUser() user: User,
	) {
		return this.modelReferencesService.remove(id, user.id);
	}
}
