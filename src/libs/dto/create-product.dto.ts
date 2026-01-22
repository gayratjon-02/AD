import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	IsArray,
} from 'class-validator';
import { ValidationMessage } from '../enums';

export class CreateProductDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	name: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	collection_id: string;

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
