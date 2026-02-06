import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { User } from '../Product-Visuals/user.entity';

// ═══════════════════════════════════════════════════════════
// JSONB INTERFACES (Type Safety for Playbooks)
// ═══════════════════════════════════════════════════════════

/**
 * Brand Playbook - Analyzed from PDF upload
 * Contains visual identity guidelines
 */
export interface BrandPlaybook {
    colors?: {
        primary: string;
        secondary: string;
        accent?: string;
        palette?: string[];
    };
    fonts?: {
        heading: string;
        body: string;
        accent?: string;
    };
    tone?: {
        voice: string; // e.g., "professional", "playful", "luxury"
        keywords?: string[];
    };
    logo_usage?: {
        min_size?: string;
        clear_space?: string;
        forbidden_contexts?: string[];
    };
}

/**
 * Ads Playbook - Layout rules for ad generation
 */
export interface AdsPlaybook {
    layout_rules?: {
        preferred_formats?: string[]; // e.g., ["9:16", "1:1"]
        grid_system?: string;
        safe_zones?: Record<string, any>;
    };
    visual_style?: {
        image_treatment?: string;
        overlay_opacity?: number;
        corner_radius?: number;
    };
}

/**
 * Copy Playbook - Textual hooks and angles
 */
export interface CopyPlaybook {
    hooks?: string[];
    angles?: {
        name: string;
        description: string;
        example_headlines?: string[];
    }[];
    cta_variations?: string[];
    forbidden_words?: string[];
}

/**
 * Brand Assets - Logo URLs
 */
export interface BrandAssets {
    logo_light_mode?: string;
    logo_dark_mode?: string;
    favicon?: string;
    brand_mark?: string;
    additional_assets?: string[];
}

// ═══════════════════════════════════════════════════════════
// ENTITY: AdBrand (Phase 2 - P0 MVP)
// ═══════════════════════════════════════════════════════════

/**
 * AdBrand Entity
 * 
 * Stores brand identity and playbooks for Ad Recreation Module.
 * Separate from Phase 1 `brands` table to avoid conflicts.
 */
@Entity('ad_brands')
export class AdBrand {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ─── User Relation ───────────────────────────────────────
    @Column({ type: 'uuid' })
    user_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // ─── Basic Info ──────────────────────────────────────────
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    industry: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    website: string;

    // ─── Playbooks (JSONB) ───────────────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    brand_playbook: BrandPlaybook;

    @Column({ type: 'jsonb', nullable: true })
    ads_playbook: AdsPlaybook;

    @Column({ type: 'jsonb', nullable: true })
    copy_playbook: CopyPlaybook;

    // ─── Assets (Logo URLs) ──────────────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    assets: BrandAssets;

    // ─── Timestamps ──────────────────────────────────────────
    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @UpdateDateColumn({
        type: 'timestamp',
        default: () => 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
    })
    updated_at: Date;

    // ─── Relations ───────────────────────────────────────────
    // Defined via import in ad-generation.entity.ts
}
