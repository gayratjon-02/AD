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
import {
    BrandPlaybook,
    AdsPlaybook,
    CopyPlaybook,
    BrandAssets,
} from '../../../libs/types/AdRecreation';

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
}

