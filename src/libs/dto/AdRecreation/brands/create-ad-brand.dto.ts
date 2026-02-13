import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength, IsIn } from 'class-validator';

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
    @MaxLength(255)
    industry: string;

    @IsUrl()
    @IsOptional()
    @MaxLength(500)
    website?: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    @IsIn(['GBP', 'USD', 'EUR'], { message: 'Currency must be GBP, USD, or EUR' })
    currency?: string;
}
