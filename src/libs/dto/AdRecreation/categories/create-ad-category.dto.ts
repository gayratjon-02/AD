import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt, MaxLength, Min } from 'class-validator';

/**
 * Create Ad Category DTO
 * Used for POST /categories endpoint
 */
export class CreateAdCategoryDto {
    @IsUUID()
    @IsNotEmpty()
    collection_id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @IsOptional()
    @Min(0)
    sort_order?: number;
}
