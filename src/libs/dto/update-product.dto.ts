import { IsOptional, IsString, IsUUID, IsArray } from 'class-validator';
import { ValidationMessage } from '../enums';

export class UpdateProductDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	name?: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	collection_id?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	front_image_url?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	back_image_url?: string;

	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	reference_images?: string[];
}
