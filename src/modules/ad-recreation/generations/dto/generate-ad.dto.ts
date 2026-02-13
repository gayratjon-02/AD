import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Generate Ad DTO
 *
 * Request body for POST /ad-generations/generate
 * Product data is auto-fetched from the brand on the backend.
 */
export class GenerateAdDto {
    @IsUUID()
    @IsNotEmpty()
    brand_id: string;

    @IsUUID()
    @IsNotEmpty()
    concept_id: string;

    @IsString()
    @IsNotEmpty()
    marketing_angle_id: string;

    @IsString()
    @IsNotEmpty()
    format_id: string;

    @IsUUID()
    @IsOptional()
    product_id?: string;
}
