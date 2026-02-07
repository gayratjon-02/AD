import { IsEnum, IsOptional } from 'class-validator';
import { BrandPlaybook, AdsPlaybook, CopyPlaybook } from '../../../types/AdRecreation';

/**
 * Playbook type enum for validation
 */
export enum PlaybookType {
    BRAND = 'brand',
    ADS = 'ads',
    COPY = 'copy',
}

/**
 * Analyze Playbook DTO
 * Used for POST /ad-brands/:id/playbook endpoint
 *
 * Rule: If type is 'brand', the PDF file is MANDATORY.
 * For 'ads' and 'copy', the file is optional but recommended.
 */
export class AnalyzePlaybookDto {
    @IsEnum(PlaybookType)
    @IsOptional()
    type?: PlaybookType = PlaybookType.BRAND;
}

/**
 * Response after playbook analysis
 */
export class AnalyzePlaybookResponseDto {
    success: boolean;
    message: string;
    playbook_type: PlaybookType;
    data: BrandPlaybook | AdsPlaybook | CopyPlaybook;
}
