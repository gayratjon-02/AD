import { Module } from '@nestjs/common';
import { AdBrandsModule } from './brands/ad-brands.module';
import { AdConceptsModule } from './ad-concepts/ad-concepts.module';

/**
 * Ad Recreation Module
 *
 * Phase 2: Central module that imports all Ad Recreation submodules.
 *
 * Submodules:
 * - brands/      → Brand Foundation APIs
 * - ad-concepts/ → Concept Analysis APIs
 * - generations/ → (Coming Soon) Ad Generation APIs
 */
@Module({
    imports: [
        AdBrandsModule,
        AdConceptsModule,
        // Future submodules:
        // AdGenerationsModule,
    ],
    exports: [
        AdBrandsModule,
        AdConceptsModule,
    ],
})
export class AdRecreationModule { }
