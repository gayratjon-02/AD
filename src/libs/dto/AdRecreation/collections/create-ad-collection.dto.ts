import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt, MaxLength, Min, Max } from 'class-validator';

/**
 * Create Ad Collection DTO
 * Used for POST /collections endpoint
 */
export class CreateAdCollectionDto {
    @IsUUID()
    @IsNotEmpty()
    brand_id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    season?: string;

    @IsInt()
    @IsOptional()
    @Min(2000)
    @Max(2100)
    year?: number;
}
