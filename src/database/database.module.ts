// src/database/database.module.ts
import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// ═══════════════════════════════════════════════════════════
// Phase 1: Product Visuals Entities
// ═══════════════════════════════════════════════════════════
import { User } from './entities/Product-Visuals/user.entity';
import { Brand } from './entities/Product-Visuals/brand.entity';
import { Collection } from './entities/Product-Visuals/collection.entity';
import { Product } from './entities/Product-Visuals/product.entity';
import { Generation } from './entities/Product-Visuals/generation.entity';
import { DAPreset } from './entities/Product-Visuals/da-preset.entity';
import { ModelReference } from './entities/Product-Visuals/model-reference.entity';

// ═══════════════════════════════════════════════════════════
// Phase 2: Ad Recreation Entities
// ═══════════════════════════════════════════════════════════
import { AdRecreation } from './entities/Ad-Recreation/ad-recreation.entity';
import { AdBrand } from './entities/Ad-Recreation/ad-brand.entity';
import { AdConcept } from './entities/Ad-Recreation/ad-concept.entity';
import { AdGeneration } from './entities/Ad-Recreation/ad-generation.entity';
import { AdCollection } from './entities/Ad-Recreation/ad-collection.entity';
import { AdCategory } from './entities/Ad-Recreation/ad-category.entity';
import { AdProduct } from './entities/Ad-Recreation/ad-product.entity';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const dbConfig = config.get<any>('database');
                const logger = new Logger('DatabaseModule');

                if (dbConfig?.url) {
                    const url = dbConfig.url as string;
                    const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
                    logger.log(`Connecting to database via URL: ${maskedUrl}`);
                    logger.log(`Database pool settings: max=${dbConfig.extra?.max || 'default'}, keepAlive=${dbConfig.extra?.keepAlive || false}`);
                } else {
                    logger.warn('No database URL found in config.');
                }

                return {
                    ...dbConfig,
                    entities: [
                        // Phase 1: Product Visuals
                        User, Brand, Collection, Product, Generation, DAPreset, ModelReference,
                        // Phase 2: Ad Recreation
                        AdRecreation, AdBrand, AdConcept, AdGeneration,
                        AdCollection, AdCategory, AdProduct,
                    ],
                    autoLoadEntities: false,
                    maxQueryExecutionTime: 30000,
                    extra: {
                        ...dbConfig?.extra,
                    },
                };
            },
        }),

        TypeOrmModule.forFeature([
            // Phase 1: Product Visuals
            User, Brand, Collection, Product, Generation, DAPreset, ModelReference,
            // Phase 2: Ad Recreation
            AdRecreation, AdBrand, AdConcept, AdGeneration,
        ]),
    ],
    exports: [TypeOrmModule],
})
export class DatabaseModule { }

