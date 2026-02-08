import { Module } from '@nestjs/common';
import { AdBrandsModule } from './brands/ad-brands.module';
import { AdConceptsModule } from './ad-concepts/ad-concepts.module';
import { ConfigurationsModule } from './configurations/configurations.module';

/**
 * Ad Recreation Module
 *
 * Phase 2: Central module that imports all Ad Recreation submodules.
 *
 * Submodules:
 * - brands/          → Brand Foundation APIs
 * - ad-concepts/     → Concept Analysis APIs
 * - configurations/  → Static Config Data APIs
 * - generations/     → (Coming Soon) Ad Generation APIs
 */
@Module({
    imports: [
        AdBrandsModule,
        AdConceptsModule,
        ConfigurationsModule,
    ],
    exports: [
        AdBrandsModule,
        AdConceptsModule,
        ConfigurationsModule,
    ],
})
export class AdRecreationModule { }
