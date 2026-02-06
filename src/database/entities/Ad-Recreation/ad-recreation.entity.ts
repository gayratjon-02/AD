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
import { Brand } from '../Product-Visuals/brand.entity';

export enum AdRecreationStatus {
	PENDING = 'pending',
	UPLOADED = 'uploaded',
	ANALYZING = 'analyzing',
	ANALYZED = 'analyzed',
	GENERATING = 'generating',
	COMPLETED = 'completed',
	FAILED = 'failed',
}

@Entity('ad_recreations')
export class AdRecreation {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ type: 'uuid' })
	user_id: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ type: 'uuid', nullable: true })
	brand_id: string;

	@ManyToOne(() => Brand, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'brand_id' })
	brand: Brand;

	@Column({ type: 'varchar', length: 500 })
	competitor_ad_url: string;

	@Column({ type: 'jsonb', nullable: true })
	brand_reference_images: string[]; // Array of URLs

	@Column({ type: 'text', nullable: true })
	brand_brief: string;

	// Analysis
	@Column({ type: 'jsonb', nullable: true })
	competitor_analysis: Record<string, any>; // Claude analysis of competitor ad

	// Generated Variations
	@Column({ type: 'jsonb', nullable: true })
	generated_variations: any[]; // Array of variation objects with image URLs

	// Settings
	@Column({ type: 'int', default: 3 })
	variations_count: number; // 3, 4, or 6

	@Column({
		type: 'varchar',
		length: 50,
		default: 'pending',
	})
	status: string;

	@Column({ type: 'text', nullable: true })
	error_message: string;

	@CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
	created_at: Date;

	@Column({ type: 'timestamp', nullable: true })
	completed_at: Date;

	@UpdateDateColumn({
		type: 'timestamp',
		default: () => 'CURRENT_TIMESTAMP',
		onUpdate: 'CURRENT_TIMESTAMP',
	})
	updated_at: Date;
}