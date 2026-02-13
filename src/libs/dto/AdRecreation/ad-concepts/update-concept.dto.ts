import { IsOptional, IsString, IsArray, IsObject, MaxLength } from 'class-validator';

/**
 * Update Concept DTO
 * Used for PATCH /concepts/:id endpoint.
 *
 * All fields are optional — only provided fields will be updated.
 */
export class UpdateConceptDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsObject()
    analysis_json?: object;
}
