import { Module } from '@nestjs/common';
import { AdBrandsModule } from './brands/ad-brands.module';
import { AdCollectionsModule } from './collections/ad-collections.module';
import { AdCategoriesModule } from './categories/ad-categories.module';
import { AdProductsModule } from './products/ad-products.module';
import { AdConceptsModule } from './ad-concepts/ad-concepts.module';
import { ConfigurationsModule } from './configurations/configurations.module';
import { GenerationsModule } from './generations/generations.module';

/**
 * Ad Recreation Module
 *
 * Phase 2: Central module that imports all Ad Recreation submodules.
 *
 * Submodules:
 * - brands/          → Brand Foundation APIs
 * - collections/     → Collection Management APIs
 * - categories/      → Category Management APIs
 * - products/        → Product Management APIs
 * - ad-concepts/     → Concept Analysis APIs
 * - configurations/  → Static Config Data APIs
 * - generations/     → Ad Generation APIs
 */
@Module({
    imports: [
        AdBrandsModule,
        AdCollectionsModule,
        AdCategoriesModule,
        AdProductsModule,
        AdConceptsModule,
        ConfigurationsModule,
        GenerationsModule,
    ],
    exports: [
        AdBrandsModule,
        AdCollectionsModule,
        AdCategoriesModule,
        AdProductsModule,
        AdConceptsModule,
        ConfigurationsModule,
        GenerationsModule,
    ],
})
export class AdRecreationModule { }
