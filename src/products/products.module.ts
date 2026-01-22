import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { FilesModule } from '../files/files.module';

@Module({
	imports: [TypeOrmModule.forFeature([Product, Collection]), FilesModule],
	controllers: [ProductsController],
	providers: [ProductsService],
	exports: [ProductsService],
})
export class ProductsModule {}
