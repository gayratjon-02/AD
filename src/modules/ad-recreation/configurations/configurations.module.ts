import { Module } from '@nestjs/common';
import { ConfigurationsController } from './configurations.controller';
import { ConfigurationsService } from './configurations.service';

/**
 * Configurations Module - Phase 2: Ad Recreation
 *
 * Serves static configuration data (marketing angles, ad formats)
 * for frontend dropdown population.
 */
@Module({
    controllers: [ConfigurationsController],
    providers: [ConfigurationsService],
    exports: [ConfigurationsService],
})
export class ConfigurationsModule {}
