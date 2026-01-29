// src/database/database.module.ts
import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { Brand } from './entities/brand.entity';
import { Collection } from './entities/collection.entity';
import { Product } from './entities/product.entity';
import { Generation } from './entities/generation.entity';
import { AdRecreation } from './entities/ad-recreation.entity';
import { DAPreset } from './entities/da-preset.entity';

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
                    entities: [User, Brand, Collection, Product, Generation, AdRecreation, DAPreset],
                    autoLoadEntities: false,
                    maxQueryExecutionTime: 30000, // Increased from 10s to 30s
                    // Merge extra settings from config
                    extra: {
                        ...dbConfig?.extra,
                    },
                };
            },
        }),

        TypeOrmModule.forFeature([User, Brand, Collection, Product, Generation, AdRecreation, DAPreset]),
    ],
    exports: [TypeOrmModule],
})
export class DatabaseModule { }
