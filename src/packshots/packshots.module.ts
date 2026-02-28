import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackshotsService } from './packshots.service';
import { PackshotsController } from './packshots.controller';
import { PackshotProcessor } from './packshot.processor';
import { PackshotQueueModule } from './packshot.queue';
import { PackshotGeneration } from '../database/entities/Product-Visuals/packshot-generation.entity';
import { Product } from '../database/entities/Product-Visuals/product.entity';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';
import { GenerationsModule } from '../generations/generations.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([PackshotGeneration, Product]),
		AiModule,
		PackshotQueueModule,
		FilesModule,
		GenerationsModule, // for GenerationGateway
	],
	controllers: [PackshotsController],
	providers: [PackshotsService, PackshotProcessor],
	exports: [PackshotsService],
})
export class PackshotsModule {}
