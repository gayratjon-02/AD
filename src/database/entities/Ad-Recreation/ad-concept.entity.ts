import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../Product-Visuals/user.entity';

// Import types from centralized location
import { AdConceptAnalysis } from '../../../libs/types/AdRecreation';

// ═══════════════════════════════════════════════════════════
// ENTITY: AdConcept (Phase 2 - P0 MVP)
// ═══════════════════════════════════════════════════════════

/**
 * AdConcept Entity
 * 
 * Stores the analysis of an uploaded competitor ad (Inspiration).
 * Claude Vision extracts the layout/zone structure.
 */
@Entity('ad_concepts')
export class AdConcept {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ─── User Relation ───────────────────────────────────────
    @Column({ type: 'uuid' })
    user_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // ─── Original Image ──────────────────────────────────────
    @Column({ type: 'varchar', length: 1000 })
    original_image_url: string;

    // ─── Analysis Result (JSONB) ─────────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    analysis_json: AdConceptAnalysis;

    // ─── Optional Metadata ───────────────────────────────────
    @Column({ type: 'varchar', length: 255, nullable: true })
    name: string; // User-provided name for the concept

    @Column({ type: 'text', nullable: true })
    notes: string; // User notes

    // ─── Timestamps ──────────────────────────────────────────
    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;
}

