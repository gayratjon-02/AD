import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { Collection } from '../database/entities/collection.entity';
import { Brand } from '../database/entities/brand.entity';
import { AiModule } from '../ai/ai.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Collection, Brand]),
		AiModule,
	],
	controllers: [CollectionsController],
	providers: [CollectionsService],
	exports: [CollectionsService],
})
export class CollectionsModule {}
