import {
	Injectable,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { CreateProductDto, UpdateProductDto } from '../libs/dto';
import { NotFoundMessage, PermissionMessage } from '../libs/enums';

@Injectable()
export class ProductsService {
	constructor(
		@InjectRepository(Product)
		private productsRepository: Repository<Product>,
		@InjectRepository(Collection)
		private collectionsRepository: Repository<Collection>,
	) {}

	async create(userId: string, createProductDto: CreateProductDto): Promise<Product> {
		const collection = await this.collectionsRepository.findOne({
			where: { id: createProductDto.collection_id },
			relations: ['brand'],
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		if (!collection.brand || collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		const product = this.productsRepository.create({
			name: createProductDto.name,
			collection_id: createProductDto.collection_id,
			user_id: userId,
			front_image_url: createProductDto.front_image_url || null,
			back_image_url: createProductDto.back_image_url || null,
			reference_images: createProductDto.reference_images || null,
		});

		return this.productsRepository.save(product);
	}

	async findAll(
		userId: string,
		filters: { collection_id?: string; page?: number; limit?: number },
	): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
		const page = filters.page && filters.page > 0 ? filters.page : 1;
		const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
		const skip = (page - 1) * limit;

		const query = this.productsRepository
			.createQueryBuilder('product')
			.leftJoinAndSelect('product.collection', 'collection')
			.leftJoinAndSelect('collection.brand', 'brand')
			.where('brand.user_id = :userId', { userId })
			.orderBy('product.created_at', 'DESC')
			.skip(skip)
			.take(limit);

		if (filters.collection_id) {
			query.andWhere('product.collection_id = :collectionId', {
				collectionId: filters.collection_id,
			});
		}

		const [items, total] = await query.getManyAndCount();

		return { items, total, page, limit };
	}

	async findOne(id: string, userId: string): Promise<Product> {
		const product = await this.productsRepository.findOne({
			where: { id },
			relations: ['collection', 'collection.brand'],
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		if (!product.collection?.brand || product.collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return product;
	}

	async update(
		id: string,
		userId: string,
		updateProductDto: UpdateProductDto,
	): Promise<Product> {
		const product = await this.findOne(id, userId);

		if (
			updateProductDto.collection_id &&
			updateProductDto.collection_id !== product.collection_id
		) {
			const collection = await this.collectionsRepository.findOne({
				where: { id: updateProductDto.collection_id },
				relations: ['brand'],
			});

			if (!collection) {
				throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
			}

			if (!collection.brand || collection.brand.user_id !== userId) {
				throw new ForbiddenException(PermissionMessage.NOT_OWNER);
			}

			product.collection_id = updateProductDto.collection_id;
		}

		if (updateProductDto.name !== undefined) {
			product.name = updateProductDto.name;
		}

		if (updateProductDto.front_image_url !== undefined) {
			product.front_image_url = updateProductDto.front_image_url;
		}

		if (updateProductDto.back_image_url !== undefined) {
			product.back_image_url = updateProductDto.back_image_url;
		}

		if (updateProductDto.reference_images !== undefined) {
			product.reference_images = updateProductDto.reference_images;
		}

		return this.productsRepository.save(product);
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const product = await this.findOne(id, userId);
		await this.productsRepository.remove(product);
		return { message: 'Product deleted successfully' };
	}
}
