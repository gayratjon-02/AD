import { Injectable } from '@nestjs/common';
import { MARKETING_ANGLES, MarketingAngle } from './constants/marketing-angles';
import { AD_FORMATS, AdFormat } from './constants/ad-formats';

/**
 * Configurations Service - Phase 2: Ad Recreation
 *
 * Serves static configuration data for frontend dropdowns.
 */
@Injectable()
export class ConfigurationsService {
    getMarketingAngles(): MarketingAngle[] {
        return MARKETING_ANGLES;
    }

    getAdFormats(): AdFormat[] {
        return AD_FORMATS;
    }
}
