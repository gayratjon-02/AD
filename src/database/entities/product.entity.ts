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
import { Collection } from './collection.entity';
import { Generation } from './generation.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  collection_id: string;

  @ManyToOne(() => Collection, (collection) => collection.products)
  @JoinColumn({ name: 'collection_id' })
  collection: Collection;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  brand_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  front_image_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  back_image_url: string;

  @Column({ type: 'jsonb', nullable: true })
  reference_images: string[];

  // STEP 1: Analyzed Product JSON (from Claude)
  @Column({ type: 'jsonb', nullable: true })
  analyzed_product_json: Record<string, any>;

  // Legacy field (kept for backward compatibility)
  @Column({ type: 'jsonb', nullable: true })
  extracted_variables: Record<string, any>;

  // STEP 2: User Edits (optional)
  @Column({ type: 'jsonb', nullable: true })
  manual_product_overrides: Record<string, any>;

  // Legacy field (kept for backward compatibility)
  @Column({ type: 'jsonb', nullable: true })
  manual_overrides: Record<string, any>;

  // Final Product JSON (analyzed + overrides merged)
  @Column({ type: 'jsonb', nullable: true })
  final_product_json: Record<string, any>;

  // Stores generated image filenames: { duo: 'abc123.jpg', solo: 'def456.jpg', ... }
  @Column({ type: 'jsonb', nullable: true })
  generated_images: Record<string, string>;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @OneToMany(() => Generation, (generation) => generation.product)
  generations: Generation[];
}
