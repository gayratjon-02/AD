import { Module } from '@nestjs/common';
import { AdBrandsModule } from './brands/ad-brands.module';
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
 * - ad-concepts/     → Concept Analysis APIs
 * - configurations/  → Static Config Data APIs
 * - generations/     → Ad Generation APIs
 */
@Module({
    imports: [
        AdBrandsModule,
        AdConceptsModule,
        ConfigurationsModule,
        GenerationsModule,
    ],
    exports: [
        AdBrandsModule,
        AdConceptsModule,
        ConfigurationsModule,
        GenerationsModule,
    ],
})
export class AdRecreationModule { }
