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
    name: string; // Auto-generated or user-provided name

    @Column({ type: 'text', nullable: true })
    notes: string; // User notes

    // ─── P0: Tags for Concept Library filtering ──────────────
    @Column({ type: 'jsonb', default: () => "'[]'" })
    tags: string[]; // e.g. ["notes_app", "storytelling", "split_screen"]

    // ─── P0: Use count for tracking popularity ───────────────
    @Column({ type: 'int', default: 0 })
    use_count: number; // Incremented each time concept is used in a generation

    // ─── Timestamps ──────────────────────────────────────────
    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}

