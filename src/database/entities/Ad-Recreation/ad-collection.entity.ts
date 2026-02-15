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
import { AdBrand } from './ad-brand.entity';
import { AdCategory } from './ad-category.entity';
import { AdCollectionStatus } from '../../../libs/enums/AdRecreationEnums';

/**
 * AdCollection Entity - Phase 2 Ad Recreation
 *
 * Groups products by collection (e.g., "Summer Collection 2026").
 * Hierarchy: AdBrand → AdCollection → AdCategory → AdProduct
 */
@Entity('ad_collections')
export class AdCollection {
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

    // ─── Basic Info ──────────────────────────────────────────
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    cover_image_url: string;

    // ─── Season & Year ───────────────────────────────────────
    @Column({ type: 'varchar', length: 50, nullable: true })
    season: string;

    @Column({ type: 'int', nullable: true })
    year: number;

    // ─── Status ──────────────────────────────────────────────
    @Column({
        type: 'enum',
        enum: AdCollectionStatus,
        default: AdCollectionStatus.ACTIVE,
    })
    status: AdCollectionStatus;

    // ─── Relations ───────────────────────────────────────────
    @OneToMany(() => AdCategory, (category) => category.collection)
    categories: AdCategory[];

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
