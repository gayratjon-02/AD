import { Controller, Post, Get, Delete, Body, Param, Req } from '@nestjs/common';
import { PackshotsService } from './packshots.service';
import { CreatePackshotDto } from '../libs/dto/packshot';

@Controller('packshots')
export class PackshotsController {
	constructor(private readonly packshotsService: PackshotsService) {}

	@Post()
	async create(@Req() req: any, @Body() dto: CreatePackshotDto) {
		const userId = req.user.id;
		return this.packshotsService.create(userId, dto);
	}

	@Get()
	async findAll(@Req() req: any) {
		const userId = req.user.id;
		return this.packshotsService.findAll(userId);
	}

	@Get(':id')
	async findOne(@Req() req: any, @Param('id') id: string) {
		const userId = req.user.id;
		return this.packshotsService.findOne(userId, id);
	}

	@Delete(':id')
	async remove(@Req() req: any, @Param('id') id: string) {
		const userId = req.user.id;
		return this.packshotsService.remove(userId, id);
	}

	@Get('product/:productId')
	async findByProduct(@Req() req: any, @Param('productId') productId: string) {
		const userId = req.user.id;
		return this.packshotsService.findByProduct(userId, productId);
	}
}
