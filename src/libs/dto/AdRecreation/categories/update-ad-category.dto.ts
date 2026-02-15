import { IsString, IsOptional, IsInt, MaxLength, Min } from 'class-validator';

/**
 * Update Ad Category DTO
 * Used for PATCH /categories/:id endpoint
 */
export class UpdateAdCategoryDto {
    @IsString()
    @IsOptional()
    @MaxLength(255)
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @IsOptional()
    @Min(0)
    sort_order?: number;
}
