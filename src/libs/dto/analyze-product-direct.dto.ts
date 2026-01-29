import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for direct product image analysis endpoint
 * POST /api/products/analyze
 *
 * Images are uploaded via FormData:
 * - front_images[] (required, multiple allowed)
 * - back_images[] (optional, multiple allowed)
 * - reference_images[] (optional, max 10)
 */
export class AnalyzeProductDirectDto {
	@IsOptional()
	@IsString()
	product_name?: string;
}

/**
 * Response interface for product analysis
 */
export interface AnalyzeProductDirectResponse {
	product_type: string;
	primary_color: string;
	material: string;
	fit: string;
	garment_details: string[];
	logos: {
		front: string;
		back: string;
	};
	visual_priorities: string[];
}
