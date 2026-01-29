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

/**
 * Product Entity
 * 
 * Client Workflow:
 * 1. CREATE: Upload front/back/reference images + name
 * 2. ANALYZE: Claude analyzes images → analyzed_product_json
 * 3. EDIT (optional): User edits → manual_product_overrides
 * 4. MERGE: analyzed + overrides → final_product_json
 * 5. GENERATE: Use final_product_json in generation
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ═══════════════════════════════════════════════════════════════════
  // RELATIONS
  // ═══════════════════════════════════════════════════════════════════

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  collection_id: string;

  @ManyToOne(() => Collection, (collection) => collection.products, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'collection_id' })
  collection: Collection;

  // ═══════════════════════════════════════════════════════════════════
  // BASIC INFO
  // ═══════════════════════════════════════════════════════════════════

  /** Product name, e.g. "Polo Bleu Ardoise", "Zip Tracksuit Forest Green" */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Product category, e.g. "Track Pants", "Hoodie" */
  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  // ═══════════════════════════════════════════════════════════════════
  // SOURCE IMAGES (uploaded by user)
  // These are used as REFERENCE for Gemini image generation
  // ═══════════════════════════════════════════════════════════════════

  /** Front view of the product (packshot) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  front_image_url: string;

  /** Back view of the product (packshot) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  back_image_url: string;

  /** Additional reference images: logos, details, textures (up to 12) */
  @Column({ type: 'jsonb', nullable: true })
  reference_images: string[];

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: ANALYZED PRODUCT JSON (from Claude)
  // Structure: { product_type, color_name, color_hex, material, details, 
  //              logo_front, logo_back, texture_description, ... }
  // ═══════════════════════════════════════════════════════════════════

  /**
   * AI-extracted product details from images (Claude analysis)
   * @example
   * {
   *   "product_type": "zip tracksuit set",
   *   "color_name": "forest green",
   *   "color_hex": "#228B22",
   *   "material": "polyester blend",
   *   "details": { "piping": "white", "zip": "gold", ... },
   *   "logo_front": { "type": "Romimi script", "color": "white", "position": "chest left" },
   *   "logo_back": { "type": "RR monogram", "color": "white", "position": "center back" },
   *   "texture_description": "smooth athletic fabric",
   *   "confidence_score": 0.92,
   *   "analyzed_at": "2026-01-27T12:00:00Z"
   * }
   */
  @Column({ type: 'jsonb', nullable: true })
  analyzed_product_json: Record<string, any>;

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: USER EDITS (optional manual corrections)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * User corrections to AI-extracted details
   * Only contains fields that user manually changed
   * @example { "color_name": "Navy Blue", "color_hex": "#000080" }
   */
  @Column({ type: 'jsonb', nullable: true })
  manual_product_overrides: Record<string, any>;

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: FINAL PRODUCT JSON (analyzed + overrides merged)
  // This is used in MERGE step with DA JSON
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Final merged product JSON (analyzed_product_json + manual_product_overrides)
   * This is what gets merged with DA JSON to create generation prompts
   */
  @Column({ type: 'jsonb', nullable: true })
  final_product_json: Record<string, any>;

  // ═══════════════════════════════════════════════════════════════════
  // LEGACY FIELDS (deprecated - kept for backward compatibility)
  // TODO: Remove after full migration to new workflow
  // ═══════════════════════════════════════════════════════════════════

  /** @deprecated Use analyzed_product_json instead */
  @Column({ type: 'jsonb', nullable: true })
  extracted_variables: Record<string, any>;

  /** @deprecated Use manual_product_overrides instead */
  @Column({ type: 'jsonb', nullable: true })
  manual_overrides: Record<string, any>;

  /** @deprecated Brand is now accessed via collection.brand */
  @Column({ type: 'uuid', nullable: true })
  brand_id: string;

  // ═══════════════════════════════════════════════════════════════════
  // GENERATED IMAGES (output from Gemini)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generated image filenames by visual type
   * @example { "duo": "abc123.jpg", "solo": "def456.jpg", "flatlay_front": "..." }
   */
  @Column({ type: 'jsonb', nullable: true })
  generated_images: Record<string, string>;

  // ═══════════════════════════════════════════════════════════════════
  // TIMESTAMPS
  // ═══════════════════════════════════════════════════════════════════

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  // ═══════════════════════════════════════════════════════════════════
  // RELATIONS (inverse)
  // ═══════════════════════════════════════════════════════════════════

  @OneToMany(() => Generation, (generation) => generation.product)
  generations: Generation[];
}
