/**
 * AdRecreation Status Enum
 * 
 * Status for legacy ad recreation process.
 */

export enum AdRecreationStatus {
    PENDING = 'pending',
    UPLOADED = 'uploaded',
    ANALYZING = 'analyzing',
    ANALYZED = 'analyzed',
    GENERATING = 'generating',
    COMPLETED = 'completed',
    FAILED = 'failed',
}
