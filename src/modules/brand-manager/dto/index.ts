// src/modules/brand-manager/dto/index.ts
// Brand manager DTOs barrel export
// DTOs for brand and playbook management

// Example DTO structure - extend as needed
export interface CreateBrandDto {
    name: string;
    description?: string;
}

export interface UpdateBrandDto {
    name?: string;
    description?: string;
}

export interface CreatePlaybookDto {
    brandId: string;
    name: string;
    guidelines?: Record<string, unknown>;
}
