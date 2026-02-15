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
import { AdCollection } from './ad-collection.entity';
import { AdProduct } from './ad-product.entity';

/**
 * AdCategory Entity - Phase 2 Ad Recreation
 *
 * Groups products within a collection (e.g., "Dresses", "Shoes").
 * Hierarchy: AdBrand → AdCollection → AdCategory → AdProduct
 */
@Entity('ad_categories')
export class AdCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ─── User Relation ───────────────────────────────────────
    @Column({ type: 'uuid' })
    user_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // ─── Collection Relation ─────────────────────────────────
    @Column({ type: 'uuid' })
    collection_id: string;

    @ManyToOne(() => AdCollection, (collection) => collection.categories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'collection_id' })
    collection: AdCollection;

    // ─── Basic Info ──────────────────────────────────────────
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    image_url: string;

    // ─── Ordering ────────────────────────────────────────────
    @Column({ type: 'int', default: 0 })
    sort_order: number;

    // ─── Relations ───────────────────────────────────────────
    @OneToMany(() => AdProduct, (product) => product.category)
    products: AdProduct[];

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
