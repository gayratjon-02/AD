import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../Product-Visuals/user.entity';
import { AdBrand } from './ad-brand.entity';
import { AdConcept } from './ad-concept.entity';

// Import types and enums from centralized locations
import { GeneratedAdImage } from '../../../libs/types/AdRecreation';
import { AdGenerationStatus } from '../../../libs/enums/AdRecreationEnums';

// ═══════════════════════════════════════════════════════════
// ENTITY: AdGeneration (Phase 2 - P0 MVP)
// ═══════════════════════════════════════════════════════════

/**
 * AdGeneration Entity
 * 
 * Tracks the async generation process and results.
 * Links Brand + Concept + Angles to produce final ads.
 */
@Entity('ad_generations')
export class AdGeneration {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ─── User Relation ───────────────────────────────────────
    @Column({ type: 'uuid' })
    user_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // ─── Brand Relation ──────────────────────────────────────
    @Column({ type: 'uuid' })
    brand_id: string;

    @ManyToOne(() => AdBrand, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'brand_id' })
    brand: AdBrand;

    // ─── Concept Relation ────────────────────────────────────
    @Column({ type: 'uuid' })
    concept_id: string;

    @ManyToOne(() => AdConcept, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'concept_id' })
    concept: AdConcept;

    // ─── Status & Progress ───────────────────────────────────
    @Column({
        type: 'enum',
        enum: AdGenerationStatus,
        default: AdGenerationStatus.PENDING,
    })
    status: AdGenerationStatus;

    @Column({ type: 'int', default: 0 })
    progress: number; // 0-100

    // ─── Generation Config (JSONB) ───────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    selected_angles: string[]; // e.g., ["back_pain", "cost_saving"]

    @Column({ type: 'jsonb', nullable: true })
    selected_formats: string[]; // e.g., ["9:16", "1:1"]

    // ─── Results (JSONB) ─────────────────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    result_images: GeneratedAdImage[];

    // ─── Error Handling ──────────────────────────────────────
    @Column({ type: 'text', nullable: true })
    failure_reason: string;

    // ─── Timestamps ──────────────────────────────────────────
    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @UpdateDateColumn({
        type: 'timestamp',
        default: () => 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
    })
    updated_at: Date;

    @Column({ type: 'timestamp', nullable: true })
    completed_at: Date;
}

