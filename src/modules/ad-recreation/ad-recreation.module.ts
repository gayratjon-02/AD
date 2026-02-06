import { Module } from '@nestjs/common';
import { AdBrandsModule } from './brands/ad-brands.module';

/**
 * Ad Recreation Module
 * 
 * Phase 2: Central module that imports all Ad Recreation submodules.
 * 
 * Submodules:
 * - brands/   → Brand Foundation APIs
 * - concepts/ → (Coming Soon) Concept Analysis APIs
 * - generations/ → (Coming Soon) Ad Generation APIs
 */
@Module({
    imports: [
        AdBrandsModule,
        // Future submodules:
        // AdConceptsModule,
        // AdGenerationsModule,
    ],
    exports: [
        AdBrandsModule,
    ],
})
export class AdRecreationModule { }
