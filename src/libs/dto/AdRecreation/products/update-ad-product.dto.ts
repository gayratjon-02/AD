import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * Update Ad Product DTO
 * Used for PATCH /products/:id endpoint
 */
export class UpdateAdProductDto {
    @IsString()
    @IsOptional()
    @MaxLength(255)
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;
}
