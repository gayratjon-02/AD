import { IsUUID, IsOptional } from 'class-validator';

export class MergePromptsDto {
	@IsUUID()
	@IsOptional()
	product_id?: string;

	@IsUUID()
	@IsOptional()
	collection_id?: string;
}
