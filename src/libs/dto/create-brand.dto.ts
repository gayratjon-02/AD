import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ValidationMessage } from '../enums';

export class CreateBrandDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	name: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	brand_brief?: string;
}
