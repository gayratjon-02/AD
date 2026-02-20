import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt, Min, Max, ValidateNested, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Mapped Assets DTO — Hero Image Selection
 *
 * Allows the user to explicitly map a product image
 * to the inspiration ad's hero zone before generating.
 */
export class MappedAssetsDto {
    @IsString()
    @IsNotEmpty()
    hero_zone_id: string; // The zone ID from concept.json (e.g., "athlete_product")

    @IsString()
    @IsNotEmpty()
    selected_image_url: string; // The specific product image URL the user chose
}

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

    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    marketing_angle_ids: string[];

    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    format_ids: string[];

    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    /** Number of image variations to generate per combo (default: 4, max: 8) */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(8)
    variations_count?: number;

    /** Hero image mapping — user selects which product image fills the hero zone */
    @IsOptional()
    @ValidateNested()
    @Type(() => MappedAssetsDto)
    mapped_assets?: MappedAssetsDto;
}
