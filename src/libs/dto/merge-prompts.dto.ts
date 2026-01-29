import { IsUUID, IsOptional, IsString } from 'class-validator';

export class MergePromptsDto {
	@IsUUID()
	@IsOptional()
	product_id?: string;

	@IsUUID()
	@IsOptional()
	collection_id?: string;

	@IsOptional()
	@IsString()
	model_type?: 'adult' | 'kid'; // Defaults to 'adult' if missing
}
