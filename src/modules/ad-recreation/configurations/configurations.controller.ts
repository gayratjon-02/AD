import { Controller, Get } from '@nestjs/common';
import { ConfigurationsService } from './configurations.service';
import { Public } from '../../../common/decorators/public.decorator';
import { MarketingAngle } from './constants/marketing-angles';
import { AdFormat } from './constants/ad-formats';

/**
 * Configurations Controller - Phase 2: Ad Recreation
 *
 * Public endpoints (no JWT required) for frontend dropdown data.
 *
 * Endpoints:
 * - GET /configs/angles  → List all marketing angles
 * - GET /configs/formats → List all ad formats
 */
@Controller('configs')
@Public()
export class ConfigurationsController {
    constructor(private readonly configurationsService: ConfigurationsService) {}

    // ═══════════════════════════════════════════════════════════
    // GET /configs/angles - Marketing Angles
    // ═══════════════════════════════════════════════════════════

    @Get('angles')
    getAngles(): { success: boolean; angles: MarketingAngle[] } {
        const angles = this.configurationsService.getMarketingAngles();

        return {
            success: true,
            angles,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /configs/formats - Ad Formats
    // ═══════════════════════════════════════════════════════════

    @Get('formats')
    getFormats(): { success: boolean; formats: AdFormat[] } {
        const formats = this.configurationsService.getAdFormats();

        return {
            success: true,
            formats,
        };
    }
}
