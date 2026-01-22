import {
	Injectable,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../database/entities/brand.entity';
import { CreateBrandDto, UpdateBrandDto } from '../libs/dto';
import { NotFoundMessage, PermissionMessage } from '../libs/enums';

@Injectable()
export class BrandsService {
	constructor(
		@InjectRepository(Brand)
		private brandsRepository: Repository<Brand>,
	) {}

	async create(userId: string, createBrandDto: CreateBrandDto): Promise<Brand> {
		const brand = this.brandsRepository.create({
			...createBrandDto,
			user_id: userId,
		});

		return this.brandsRepository.save(brand);
	}

	async findAll(userId: string): Promise<Brand[]> {
		return this.brandsRepository.find({
			where: { user_id: userId },
			order: { created_at: 'DESC' },
		});
	}

	async findOne(id: string, userId: string): Promise<Brand> {
		const brand = await this.brandsRepository.findOne({
			where: { id },
		});

		if (!brand) {
			throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
		}

		// Check ownership
		if (brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return brand;
	}

	async update(
		id: string,
		userId: string,
		updateBrandDto: UpdateBrandDto,
	): Promise<Brand> {
		const brand = await this.findOne(id, userId);

		Object.assign(brand, updateBrandDto);
		return this.brandsRepository.save(brand);
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const brand = await this.findOne(id, userId);

		await this.brandsRepository.remove(brand);

		return { message: 'Brand deleted successfully' };
	}
}
