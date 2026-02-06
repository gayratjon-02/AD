import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from '../../database/entities/Product-Visuals/product.entity';
import { Collection } from '../../database/entities/Product-Visuals/collection.entity';
import { Generation } from '../../database/entities/Product-Visuals/generation.entity';
import { FilesModule } from '../../files/files.module';
import { AiModule } from '../../ai/ai.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Product, Collection, Generation]),
		FilesModule,
		AiModule,
	],
	controllers: [ProductsController],
	providers: [ProductsService],
	exports: [ProductsService],
})
export class ProductsModule { }
