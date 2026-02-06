// src/modules/brand-manager/dto/index.ts
// Brand manager DTOs barrel export
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
