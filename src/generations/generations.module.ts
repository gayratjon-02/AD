import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GenerationsService } from './generations.service';
import { GenerationGateway } from './generation.gateway';
import { GenerationsController } from './generations.controller';
import { GenerationEventsController } from './generation-events.controller';
import { GenerationProcessor } from './generation.processor';
import { Generation } from '../database/entities/Product-Visuals/generation.entity';
import { Product } from '../database/entities/Product-Visuals/product.entity';
import { Collection } from '../database/entities/Product-Visuals/collection.entity';
import { DAPreset } from '../database/entities/Product-Visuals/da-preset.entity';
import { AiModule } from '../ai/ai.module';
import { GenerationQueueModule } from './generation.queue';
import { FilesModule } from '../files/files.module';
import { ModelReferencesModule } from '../model-references/model-references.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Generation, Product, Collection, DAPreset]),
		JwtModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				secret: configService.get<string>('JWT_SECRET'),
				signOptions: { expiresIn: '24h' },
			}),
			inject: [ConfigService],
		}),
		AiModule,
		GenerationQueueModule,
		FilesModule,
		ModelReferencesModule,
	],
	controllers: [GenerationsController, GenerationEventsController],
	providers: [GenerationsService, GenerationProcessor, GenerationGateway],
	exports: [GenerationsService, GenerationGateway],
})
export class GenerationsModule { }
