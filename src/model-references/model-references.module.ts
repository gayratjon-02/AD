import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelReferencesService } from './model-references.service';
import { ModelReferencesController } from './model-references.controller';
import { ModelReference } from '../database/entities/Product-Visuals/model-reference.entity';
import { FilesModule } from '../files/files.module';
import { AiModule } from '../ai/ai.module';

@Module({
	imports: [TypeOrmModule.forFeature([ModelReference]), FilesModule, AiModule],
	controllers: [ModelReferencesController],
	providers: [ModelReferencesService],
	exports: [ModelReferencesService],
})
export class ModelReferencesModule {}
