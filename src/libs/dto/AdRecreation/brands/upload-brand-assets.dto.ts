import { BrandAssets } from '../../../types/AdRecreation';

/**
 * Upload Brand Assets DTO
 * Used for POST /ad-brands/:id/assets endpoint
 *
 * File validation is handled in the controller via multipart/form-data.
 * Rule: Both logo_light and logo_dark are MANDATORY.
 */
export class UploadBrandAssetsDto {
    // Files are validated in the controller interceptor.
    // This DTO documents the expected structure.
}

/**
 * Response after asset upload
 */
export class BrandAssetsResponseDto {
    success: boolean;
    message: string;
    assets: BrandAssets;
}
