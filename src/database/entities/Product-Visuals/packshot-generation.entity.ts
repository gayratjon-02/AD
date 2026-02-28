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
import { GenerationStatus } from '../../../libs/enums';

@Entity('packshot_generations')
export class PackshotGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product, (product) => product.packshot_generations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'uuid' })
  user_id: string;

  // true = hanger display, false = ghost mannequin
  @Column({ type: 'boolean', default: true })
  hanger_mode: boolean;

  @Column({
    type: 'enum',
    enum: GenerationStatus,
    default: GenerationStatus.PENDING,
  })
  status: GenerationStatus;

  // 4 generated image URLs
  @Column({ type: 'varchar', length: 500, nullable: true })
  front_packshot_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  back_packshot_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  detail_1_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  detail_2_url: string;

  // Auto-detected or user-specified focus areas for detail shots
  @Column({ type: 'varchar', length: 255, nullable: true })
  detail_1_focus: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  detail_2_focus: string;

  // Stores all 4 generated prompts
  @Column({ type: 'jsonb', nullable: true })
  prompts: Record<string, any>;

  // Progress tracking
  @Column({ type: 'integer', default: 0 })
  progress_percent: number;

  @Column({ type: 'integer', default: 0 })
  completed_shots_count: number;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}
