import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateBrandDto, UpdateBrandDto } from '../libs/dto';
import { User } from '../database/entities/Product-Visuals/user.entity';
import { Brand } from '../database/entities/Product-Visuals/brand.entity';

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
	constructor(private readonly brandsService: BrandsService) {}

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
}
