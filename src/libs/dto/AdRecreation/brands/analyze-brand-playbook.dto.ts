import { BrandPlaybook } from '../../../types/AdRecreation';

/**
 * Analyze Brand Playbook Response DTO
 * Returned after Claude analyzes the uploaded PDF
 */
export class AnalyzeBrandPlaybookResponseDto {
    success: boolean;
    message: string;
    brand_playbook: BrandPlaybook;
}
