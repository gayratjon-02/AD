import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';

/**
 * Create Ad Product DTO
 * Used for POST /products endpoint
 */
export class CreateAdProductDto {
    @IsUUID()
    @IsNotEmpty()
    category_id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;
}
