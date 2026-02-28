import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Collection } from './collection.entity';
import { DAPreset } from './da-preset.entity';
import { GenerationType, GenerationStatus } from '../../../libs/enums';

@Entity('generations')
export class Generation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product, (product) => product.generations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'uuid', nullable: true })
  collection_id: string;

  @ManyToOne(() => Collection, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'collection_id' })
  collection: Collection;

  // ═══════════════════════════════════════════════════════════
  // DA PRESET RELATION (Phase 3)
  // ═══════════════════════════════════════════════════════════

  @Column({ type: 'uuid', nullable: true })
  da_preset_id: string;

  @ManyToOne(() => DAPreset, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'da_preset_id' })
  da_preset: DAPreset;

  // ═══════════════════════════════════════════════════════════
  // MODEL TYPE (adult/kid)
  // ═══════════════════════════════════════════════════════════

  @Column({ type: 'varchar', length: 20, default: 'adult' })
  model_type: 'adult' | 'kid';

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({
    type: 'enum',
    enum: GenerationType,
    nullable: true,
  })
  generation_type: GenerationType;

  // STEP 3: Merged Prompts (Product + DA combined)
  @Column({ type: 'jsonb', nullable: true })
  merged_prompts: Record<string, any>;

  @Column({ type: 'varchar', length: 10, default: '4:5' })
  aspect_ratio: string;

  @Column({ type: 'varchar', length: 10, default: '4K' })
  resolution: string;

  /** Per-shot enabled/disabled flags + settings (saved during merge) */
  @Column({ type: 'jsonb', nullable: true })
  shot_options: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  visuals: any[];

  // ═══════════════════════════════════════════════════════════
  // GENERATED IMAGES (Final output - 6 image URLs)
  // ═══════════════════════════════════════════════════════════

  /**
   * Final generated image URLs
   * @example { "duo": "https://...", "solo": "https://...", ... }
   */
  @Column({ type: 'jsonb', nullable: true })
  generated_images: Record<string, string>;

  @Column({
    type: 'enum',
    enum: GenerationStatus,
    default: GenerationStatus.PENDING,
  })
  status: GenerationStatus;

  // Current workflow step
  @Column({ type: 'varchar', length: 50, nullable: true })
  current_step: string; // 'product_analysis', 'da_analysis', 'merging', 'image_generation'

  // Progress tracking
  @Column({ type: 'integer', default: 0 })
  progress_percent: number;

  @Column({ type: 'integer', default: 0 })
  completed_visuals_count: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  competitor_ad_url: string;

  @Column({ type: 'jsonb', nullable: true })
  competitor_analysis: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date;
}
