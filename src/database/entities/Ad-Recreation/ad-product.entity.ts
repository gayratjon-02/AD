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
import { AdCategory } from './ad-category.entity';
import { AdGeneration } from './ad-generation.entity';

/**
 * AdProduct Entity - Phase 2 Ad Recreation
 *
 * Individual product within a category (e.g., "Floral Maxi Dress").
 * Hierarchy: AdBrand → AdCollection → AdCategory → AdProduct → AdGeneration
 */
@Entity('ad_products')
export class AdProduct {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ─── User Relation ───────────────────────────────────────
    @Column({ type: 'uuid' })
    user_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // ─── Category Relation ───────────────────────────────────
    @Column({ type: 'uuid' })
    category_id: string;

    @ManyToOne(() => AdCategory, (category) => category.products, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'category_id' })
    category: AdCategory;

    // ─── Basic Info ──────────────────────────────────────────
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    // ─── Images ──────────────────────────────────────────────
    @Column({ type: 'varchar', length: 500, nullable: true })
    front_image_url: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    back_image_url: string;

    // ─── Relations ───────────────────────────────────────────
    @OneToMany(() => AdGeneration, (generation) => generation.product)
    generations: AdGeneration[];

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
