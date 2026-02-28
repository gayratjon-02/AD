// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

import databaseConfig from './config/database.config';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import uploadConfig from './config/upload.config';
import geminiConfig from './config/gemini.config';
import vertexConfig from './config/vertex.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BrandsModule } from './brands/brands.module';
import { ModelReferencesModule } from './model-references/model-references.module';
import { CollectionsModule } from './collections/collections.module';
import { FilesModule } from './files/files.module';
import { ProductsModule } from './modules/product-visuals/products.module';
import { AiModule } from './ai/ai.module';
import { GenerationsModule } from './generations/generations.module';
import { DAModule } from './da/da.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdRecreationModule } from './modules/ad-recreation/ad-recreation.module';
import { S3Module } from './common/s3/s3.module';
import { PackshotsModule } from './packshots/packshots.module';

@Module({
	imports: [
		S3Module,
		ConfigModule.forRoot({
			isGlobal: true,
			load: [databaseConfig, appConfig, jwtConfig, uploadConfig, geminiConfig, vertexConfig],
		}),

		// BullMQ Configuration
		BullModule.forRoot({
			redis: {
				host: process.env.REDIS_HOST || 'localhost',
				port: parseInt(process.env.REDIS_PORT || '6379', 10),
				password: process.env.REDIS_PASSWORD,
				db: parseInt(process.env.REDIS_DB || '0', 10),
			},
		}),

		DatabaseModule,
		AuthModule,
		UsersModule,
		BrandsModule,
		ModelReferencesModule,
		CollectionsModule,
		FilesModule,
		ProductsModule,
		AiModule,
		GenerationsModule,
		PackshotsModule,
		AdRecreationModule, // Phase 2: Includes all Ad Recreation submodules (brands, concepts, etc.)
		DAModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		{
			provide: APP_GUARD,
			useClass: JwtAuthGuard,
		},
	],
})
export class AppModule { }
