import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

// ═══════════════════════════════════════════════════════════
// JSONB INTERFACES (Type Safety for Layout Analysis)
// ═══════════════════════════════════════════════════════════

/**
 * Zone - Individual zone/section in ad layout
 */
export interface LayoutZone {
    id: string;
    type: 'headline' | 'subheadline' | 'body' | 'cta' | 'image' | 'logo' | 'background';
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    content?: string;
    style?: {
        font_size?: string;
        font_weight?: string;
        color?: string;
        background_color?: string;
        alignment?: 'left' | 'center' | 'right';
    };
    z_index?: number;
}

/**
 * Ad Concept Analysis - Full layout structure
 */
export interface AdConceptAnalysis {
    format: {
        width: number;
        height: number;
        aspect_ratio: string; // e.g., "9:16", "1:1"
    };
    zones: LayoutZone[];
    color_palette?: string[];
    overall_style?: {
        visual_hierarchy?: string;
        dominant_colors?: string[];
        mood?: string;
    };
    text_content?: {
        headline?: string;
        subheadline?: string;
        body?: string;
        cta?: string;
    };
    analyzed_at?: string;
}

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
