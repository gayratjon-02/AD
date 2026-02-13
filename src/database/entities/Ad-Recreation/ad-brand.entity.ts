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

import {
    BrandPlaybook,
    AdsPlaybook,
    CopyPlaybook,
    BrandAssets,
} from '../../../libs/types/AdRecreation';

/**
 * AdBrand Entity - Phase 2 Ad Recreation
 *
 * Stores brand identity, assets, and playbooks.
 * Matches the "Brand Assets" table in the PDF specification.
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

    @Column({ type: 'varchar', length: 100 })
    industry: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    website: string;

    @Column({ type: 'varchar', length: 10, default: 'GBP' })
    currency: string;

    // ─── Assets (Logo URLs: { logo_light, logo_dark }) ───────
    @Column({ type: 'jsonb', nullable: true })
    assets: BrandAssets;

    // ─── Playbooks (JSONB) ───────────────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    brand_playbook: BrandPlaybook;

    @Column({ type: 'jsonb', nullable: true })
    ads_playbook: AdsPlaybook;

    @Column({ type: 'jsonb', nullable: true })
    copy_playbook: CopyPlaybook;

    // ─── Optional Extra PDF ──────────────────────────────────
    @Column({ type: 'varchar', length: 500, nullable: true })
    style_guide_url: string;

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
