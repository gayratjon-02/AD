import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { GenerationsService } from './generations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateGenerationDto, GenerateDto, UpdateGenerationDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Generation } from '../database/entities/generation.entity';

@Controller('generations')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
	constructor(private readonly generationsService: GenerationsService) {}

	@Post('createGeneration')
	async createGeneration(@CurrentUser() user: User, @Body() dto: CreateGenerationDto): Promise<Generation> {
		return this.generationsService.create(user.id, dto);
	}

	@Get('getAllGenerations')
	async getAllGenerations(
		@CurrentUser() user: User,
		@Query('product_id') productId?: string,
		@Query('collection_id') collectionId?: string,
		@Query('generation_type') generationType?: string,
		@Query('status') status?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	): Promise<{ items: Generation[]; total: number; page: number; limit: number }> {
		return this.generationsService.findAll(user.id, {
			product_id: productId,
			collection_id: collectionId,
			generation_type: generationType,
			status,
			page: page ? parseInt(page, 10) : undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		});
	}

	@Get('getGeneration/:id')
	async getGeneration(@Param('id') id: string, @CurrentUser() user: User): Promise<Generation> {
		return this.generationsService.findOne(id, user.id);
	}

	@Get('getPrompts/:id')
	async getPrompts(@Param('id') id: string, @CurrentUser() user: User): Promise<{ prompts: string[] }> {
		return this.generationsService.previewPrompts(id, user.id);
	}

	@Post('updatePrompts/:id')
	async updatePrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() dto: UpdateGenerationDto,
	): Promise<Generation> {
		return this.generationsService.updatePrompts(id, user.id, dto);
	}

	@Post('generate/:id')
	async generate(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: GenerateDto): Promise<Generation> {
		return this.generationsService.generate(id, user.id, dto);
	}

	@Get('download/:id')
	async download(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		const { archive, filename } = await this.generationsService.createDownloadArchive(id, user.id);

		res.set({
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
		});

		return new StreamableFile(archive);
	}
}
