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

import {
    BrandPlaybook,
    AdsPlaybook,
    CopyPlaybook,
    BrandAssets,
} from '../../../libs/types/AdRecreation';
import { AdCollection } from './ad-collection.entity';
import { AdProduct } from './ad-product.entity';

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

    // ─── Custom Angles (JSONB) ───────────────────────────────
    @Column({ type: 'jsonb', nullable: true })
    custom_angles: any[];

    // ─── Model Reference Images (Model Consistency) ──────────
    @Column({ type: 'varchar', length: 500, nullable: true })
    model_adult_url: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    model_kid_url: string;

    // ─── Optional Extra PDF ──────────────────────────────────
    @Column({ type: 'varchar', length: 500, nullable: true })
    style_guide_url: string;

    // ─── Product Relation (Fallback/Default) ─────────────────
    @Column({ type: 'uuid', nullable: true })
    product_id: string;

    @ManyToOne(() => AdProduct, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'product_id' })
    product: AdProduct;

    // ─── Collections ────────────────────────────────────────
    @OneToMany(() => AdCollection, (collection) => collection.brand)
    collections: AdCollection[];

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
