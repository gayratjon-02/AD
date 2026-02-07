import { AdConceptAnalysis } from '../../../types/AdRecreation';
import { AdConcept } from '../../../../database/entities/Ad-Recreation/ad-concept.entity';

/**
 * Analyze Concept DTO
 * Used for POST /ad-concepts/analyze endpoint.
 *
 * File validation is handled in the controller via FileInterceptor.
 * This DTO documents the expected structure.
 */
export class AnalyzeConceptDto {
    // File is validated in the controller interceptor (multipart/form-data).
}

/**
 * Response after concept analysis
 */
export class AnalyzeConceptResponseDto {
    success: boolean;
    message: string;
    concept: AdConcept;
}
