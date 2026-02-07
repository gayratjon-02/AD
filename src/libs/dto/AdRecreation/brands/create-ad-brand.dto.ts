import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength } from 'class-validator';

/**
 * Create Ad Brand DTO
 * Used for POST /ad-brands endpoint
 */
export class CreateAdBrandDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    industry: string;

    @IsUrl()
    @IsOptional()
    @MaxLength(500)
    website?: string;
}
