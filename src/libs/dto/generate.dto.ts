import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { ValidationMessage } from '../enums';

/**
 * DTO for POST /api/generations/:id/generate (Generate Product Visuals).
 * Resolution and aspect_ratio are passed to merge/prompt builder and Gemini config.
 */
export class GenerateDto {
	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsString({ each: true, message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	prompts?: string[];

	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsString({ each: true, message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	visualTypes?: string[];

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	model?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsIn(['2K', '4K'], { message: 'Resolution must be one of: 2K, 4K' })
	@IsOptional()
	resolution?: '2K' | '4K';

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsIn(['1:1', '4:5', '9:16', '16:9'], { message: 'Aspect ratio must be one of: 1:1, 4:5, 9:16, 16:9' })
	@IsOptional()
	aspect_ratio?: string;
}
