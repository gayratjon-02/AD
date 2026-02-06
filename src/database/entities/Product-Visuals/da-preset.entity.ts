import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';

/**
 * Background configuration for DA Preset
 */
export interface DABackground {
	type: string;
	hex: string;
}

/**
 * Floor configuration for DA Preset
 */
export interface DAFloor {
	type: string;
	hex: string;
}

/**
 * Props configuration for DA Preset
 * Supports left and right side prop arrays
 */
export interface DAProps {
	left_side: string[];
	right_side: string[];
}

/**
 * Styling configuration for DA Preset
 */
export interface DAStyling {
	pants: string;
	footwear: string;
}

/**
 * Lighting configuration for DA Preset
 */
export interface DALighting {
	type: string;
	temperature: string;
}

/**
 * Complete DA Preset configuration JSON structure
 * This is the "Gold Standard" format for Art Direction
 */
export interface DAPresetConfig {
	da_name: string;
	background: DABackground;
	floor: DAFloor;
	props: DAProps;
	styling: DAStyling;
	lighting: DALighting;
	mood: string;
	quality: string;
}

/**
 * DAPreset Entity
 *
 * Stores Art Direction (DA) Presets for visual generation.
 * These presets define the complete visual environment including:
 * - Background and floor styling
 * - Props placement (left/right)
 * - Model styling (pants, footwear)
 * - Lighting setup
 * - Mood and quality settings
 *
 * System presets (is_default=true) are protected from deletion.
 */
@Entity('da_presets')
export class DAPreset {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	/**
	 * Display name of the preset (e.g., "Nostalgic Playroom")
	 */
	@Column({ type: 'varchar', length: 255 })
	name: string;

	/**
	 * Unique code for the preset (e.g., "nostalgic_playroom")
	 */
	@Column({ type: 'varchar', length: 100, unique: true })
	code: string;

	/**
	 * Description of the preset style
	 */
	@Column({ type: 'text', nullable: true })
	description: string;

	/**
	 * Flag to protect system presets from deletion
	 * true = System preset (cannot be deleted by users)
	 * false = User-created preset (can be deleted)
	 */
	@Column({ type: 'boolean', default: false })
	is_default: boolean;

	/**
	 * URL of the uploaded reference image
	 */
	@Column({ type: 'varchar', length: 500, nullable: true })
	image_url: string;

	/**
	 * Raw JSON analysis from Claude
	 * Used for transparency and re-hydration
	 */
	@Column({ type: 'jsonb', nullable: true })
	analyzed_da_json: Record<string, any>;

	// ═══════════════════════════════════════════════════════════
	// BACKGROUND CONFIGURATION
	// ═══════════════════════════════════════════════════════════

	/**
	 * Background type description (e.g., "Dark walnut wood panel")
	 */
	@Column({ type: 'varchar', length: 255 })
	background_type: string;

	/**
	 * Background color hex code (e.g., "#5D4037")
	 */
	@Column({ type: 'varchar', length: 7 })
	background_hex: string;

	// ═══════════════════════════════════════════════════════════
	// FLOOR CONFIGURATION
	// ═══════════════════════════════════════════════════════════

	/**
	 * Floor type description (e.g., "Light grey polished concrete")
	 */
	@Column({ type: 'varchar', length: 255 })
	floor_type: string;

	/**
	 * Floor color hex code (e.g., "#A9A9A9")
	 */
	@Column({ type: 'varchar', length: 7 })
	floor_hex: string;

	// ═══════════════════════════════════════════════════════════
	// PROPS CONFIGURATION
	// ═══════════════════════════════════════════════════════════

	/**
	 * Props on the left side of the scene
	 * Array of prop descriptions
	 */
	@Column({ type: 'jsonb', default: [] })
	props_left: string[];

	/**
	 * Props on the right side of the scene
	 * Array of prop descriptions
	 */
	@Column({ type: 'jsonb', default: [] })
	props_right: string[];

	// ═══════════════════════════════════════════════════════════
	// STYLING CONFIGURATION
	// ═══════════════════════════════════════════════════════════

	/**
	 * Pants styling for model (e.g., "Black chino (#1A1A1A)")
	 */
	@Column({ type: 'varchar', length: 255 })
	styling_pants: string;

	/**
	 * Footwear styling for model (e.g., "BAREFOOT", "White sneakers")
	 * BAREFOOT is a special value indicating no footwear
	 */
	@Column({ type: 'varchar', length: 255 })
	styling_footwear: string;

	// ═══════════════════════════════════════════════════════════
	// LIGHTING CONFIGURATION
	// ═══════════════════════════════════════════════════════════

	/**
	 * Lighting type (e.g., "Soft diffused studio")
	 */
	@Column({ type: 'varchar', length: 255 })
	lighting_type: string;

	/**
	 * Lighting color temperature (e.g., "4500K warm neutral")
	 */
	@Column({ type: 'varchar', length: 100 })
	lighting_temperature: string;

	// ═══════════════════════════════════════════════════════════
	// MOOD & QUALITY
	// ═══════════════════════════════════════════════════════════

	/**
	 * Mood description for the scene
	 * (e.g., "Nostalgic warmth, premium casual, father-son connection")
	 */
	@Column({ type: 'text' })
	mood: string;

	/**
	 * Quality specification for generation
	 * (e.g., "8K editorial Vogue-level")
	 */
	@Column({ type: 'varchar', length: 255 })
	quality: string;

	// ═══════════════════════════════════════════════════════════
	// ADDITIONAL CONFIGURATION (JSONB for extensibility)
	// ═══════════════════════════════════════════════════════════

	/**
	 * Additional configuration options (extensible)
	 * Can store camera settings, negative prompts, etc.
	 */
	@Column({ type: 'jsonb', nullable: true })
	additional_config: Record<string, any>;

	// ═══════════════════════════════════════════════════════════
	// TIMESTAMPS
	// ═══════════════════════════════════════════════════════════

	@CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
	created_at: Date;

	@UpdateDateColumn({
		type: 'timestamp',
		default: () => 'CURRENT_TIMESTAMP',
		onUpdate: 'CURRENT_TIMESTAMP',
	})
	updated_at: Date;

	// ═══════════════════════════════════════════════════════════
	// HELPER METHODS
	// ═══════════════════════════════════════════════════════════

	/**
	 * Convert entity to the "Gold Standard" JSON format
	 * Used for API responses and prompt generation
	 */
	toPresetConfig(): DAPresetConfig {
		return {
			da_name: this.name,
			background: {
				type: this.background_type,
				hex: this.background_hex,
			},
			floor: {
				type: this.floor_type,
				hex: this.floor_hex,
			},
			props: {
				left_side: this.props_left || [],
				right_side: this.props_right || [],
			},
			styling: {
				pants: this.styling_pants,
				footwear: this.styling_footwear,
			},
			lighting: {
				type: this.lighting_type,
				temperature: this.lighting_temperature,
			},
			mood: this.mood,
			quality: this.quality,
		};
	}
}
