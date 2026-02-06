import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { BrandAssets } from '../../../types/AdRecreation';

/**
 * Upload Brand Assets DTO
 * Used for POST /ad-brands/:id/assets endpoint
 * Files are handled via multipart/form-data interceptor
 */
export class UploadBrandAssetsDto {
    @IsString()
    @IsOptional()
    @IsUrl()
    logo_light_mode?: string;

    @IsString()
    @IsOptional()
    @IsUrl()
    logo_dark_mode?: string;

    @IsString()
    @IsOptional()
    @IsUrl()
    favicon?: string;

    @IsString()
    @IsOptional()
    @IsUrl()
    brand_mark?: string;
}

/**
 * Response after asset upload
 */
export class BrandAssetsResponseDto {
    success: boolean;
    message: string;
    assets: BrandAssets;
}
