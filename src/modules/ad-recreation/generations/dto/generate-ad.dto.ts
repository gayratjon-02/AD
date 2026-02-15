import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt, Min, Max } from 'class-validator';

/**
 * Generate Ad DTO
 *
 * Request body for POST /ad-recreation/generate
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

    /** Number of image variations to generate per combo (default: 4, max: 8) */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(8)
    variations_count?: number;
}

