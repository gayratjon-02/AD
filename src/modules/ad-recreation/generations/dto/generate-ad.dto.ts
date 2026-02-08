import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

/**
 * Generate Ad DTO
 *
 * Request body for POST /ad-generations/generate
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

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    product_input: string;
}
