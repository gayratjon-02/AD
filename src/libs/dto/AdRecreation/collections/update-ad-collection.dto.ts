import { IsString, IsOptional, IsInt, IsEnum, MaxLength, Min, Max } from 'class-validator';
import { AdCollectionStatus } from '../../../enums/AdRecreationEnums';

/**
 * Update Ad Collection DTO
 * Used for PATCH /collections/:id endpoint
 */
export class UpdateAdCollectionDto {
    @IsString()
    @IsOptional()
    @MaxLength(255)
    name?: string;

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

    @IsEnum(AdCollectionStatus)
    @IsOptional()
    status?: AdCollectionStatus;
}
