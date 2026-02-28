import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandsService } from './brands.service';
import { BrandsController } from './brands.controller';
import { Brand } from '../database/entities/Product-Visuals/brand.entity';
import { FilesModule } from '../files/files.module';

@Module({
	imports: [TypeOrmModule.forFeature([Brand]), FilesModule],
	controllers: [BrandsController],
	providers: [BrandsService],
	exports: [BrandsService],
})
export class BrandsModule {}
