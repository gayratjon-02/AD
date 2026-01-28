import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ValidationMessage } from '../enums';

/**
 * FormData body for POST /api/products (Create Product).
 * Client workflow: front + back + reference images + name; then Analyze → Product JSON.
 */
export class UploadProductDto {
	/** Product name, e.g. "Polo Bleu Ardoise", "Zip Tracksuit Forest Green" */
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	@MaxLength(255, { message: ValidationMessage.FIELD_INVALID })
	name: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	collection_id: string;
}
