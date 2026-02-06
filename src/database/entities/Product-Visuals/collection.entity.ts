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
import { Brand } from './brand.entity';
import { Product } from './product.entity';

@Entity('collections')
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  brand_id: string;

  @ManyToOne(() => Brand, (brand) => brand.collections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // DA Reference Image (uploaded by user)
  @Column({ type: 'varchar', length: 500, nullable: true })
  da_reference_image_url: string;

  // Analyzed DA JSON (from Claude analysis)
  @Column({ type: 'jsonb', nullable: true })
  analyzed_da_json: Record<string, any>;

  // Fixed Elements (can be preset or from analysis)
  @Column({ type: 'jsonb', nullable: true })
  fixed_elements: Record<string, any>;

  // Prompt Templates (6 templates with {{variables}})
  @Column({ type: 'jsonb', nullable: true })
  prompt_templates: Record<string, any>;

  // Metadata
  @Column({ type: 'boolean', default: false })
  is_preset: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @OneToMany(() => Product, (product) => product.collection)
  products: Product[];
}
