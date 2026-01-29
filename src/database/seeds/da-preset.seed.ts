import { DataSource } from 'typeorm';
import { DAPreset } from '../entities/da-preset.entity';

/**
 * Default DA Presets - "Gold Standard" Art Direction configurations
 *
 * These presets are protected (is_default=true) and cannot be deleted by users.
 * They serve as the foundation for visual generation quality.
 */
export const DEFAULT_DA_PRESETS: Partial<DAPreset>[] = [
	{
		name: 'Nostalgic Playroom',
		code: 'nostalgic_playroom',
		description: 'A warm, nostalgic setting with vintage toys and wood panels. Perfect for father-son lifestyle photography with premium casual vibes.',
		is_default: true,

		// Background
		background_type: 'Dark walnut wood panel',
		background_hex: '#5D4037',

		// Floor
		floor_type: 'Light grey polished concrete',
		floor_hex: '#A9A9A9',

		// Props
		props_left: [
			'Vintage book stack',
			'Yellow mushroom lamp',
			'Die-cast vintage cars',
		],
		props_right: [
			'Vintage book stack',
			'Retro robot toy',
			'Rainbow stacking rings',
		],

		// Styling
		styling_pants: 'Black chino (#1A1A1A)',
		styling_footwear: 'BAREFOOT',

		// Lighting
		lighting_type: 'Soft diffused studio',
		lighting_temperature: '4500K warm neutral',

		// Mood & Quality
		mood: 'Nostalgic warmth, premium casual, father-son connection',
		quality: '8K editorial Vogue-level',

		// Additional config for future extensibility
		additional_config: {
			camera: {
				angle: 'Eye-level',
				lens: '85mm f/1.8',
				depth_of_field: 'Shallow, subject in focus',
			},
			negative_prompt: 'harsh shadows, cold tones, modern furniture, plastic toys, clutter',
		},
	},
	{
		name: 'Minimalist White Studio',
		code: 'minimalist_white_studio',
		description: 'Clean, high-end e-commerce aesthetic with focus on product details. Inspired by SSENSE and Mr Porter.',
		is_default: true,

		// Background
		background_type: 'Seamless white cyclorama',
		background_hex: '#FFFFFF',

		// Floor
		floor_type: 'White infinity cove',
		floor_hex: '#F5F5F5',

		// Props
		props_left: [],
		props_right: [],

		// Styling
		styling_pants: 'Black slim-fit trousers (#1A1A1A)',
		styling_footwear: 'White minimalist sneakers',

		// Lighting
		lighting_type: 'Three-point softbox setup',
		lighting_temperature: '5600K daylight',

		// Mood & Quality
		mood: 'Clean, modern, product-focused luxury',
		quality: '8K editorial, razor-sharp details',

		additional_config: {
			camera: {
				angle: 'Eye-level to slightly below',
				lens: '80mm f/2.8',
				depth_of_field: 'Deep, all in focus',
			},
			negative_prompt: 'shadows, colored backgrounds, props, clutter, visible equipment',
		},
	},
	{
		name: 'Urban Golden Hour',
		code: 'urban_golden_hour',
		description: 'Dynamic streetwear aesthetic with authentic urban environment and golden hour lighting.',
		is_default: true,

		// Background
		background_type: 'Blurred city street with bokeh',
		background_hex: '#8B7355',

		// Floor
		floor_type: 'Warm sandstone paving',
		floor_hex: '#D2B48C',

		// Props
		props_left: [
			'Blurred pedestrians',
			'Modern architecture',
		],
		props_right: [
			'Street signage',
			'Shop windows',
		],

		// Styling
		styling_pants: 'Relaxed cargo pants (#4A4A4A)',
		styling_footwear: 'Chunky white sneakers',

		// Lighting
		lighting_type: 'Golden hour natural sunlight',
		lighting_temperature: '3500K warm golden',

		// Mood & Quality
		mood: 'Energetic, authentic, urban lifestyle',
		quality: '8K cinematic, shallow depth of field',

		additional_config: {
			camera: {
				angle: 'Slightly low angle for powerful perspective',
				lens: '85mm f/1.4',
				depth_of_field: 'Very shallow, creamy bokeh',
			},
			negative_prompt: 'flat lighting, grey sky, static pose, empty streets',
		},
	},
	{
		name: 'Cozy Scandinavian Home',
		code: 'cozy_scandinavian_home',
		description: 'Warm lifestyle aesthetic with natural window light and relaxed atmosphere.',
		is_default: true,

		// Background
		background_type: 'White wall with warm undertones',
		background_hex: '#F5F2ED',

		// Floor
		floor_type: 'Light oak hardwood',
		floor_hex: '#D4A574',

		// Props
		props_left: [
			'Cream boucle sofa',
			'Art books stack',
			'Ceramic vase',
		],
		props_right: [
			'Dried pampas grass',
			'Wool throw blanket',
			'Terracotta cushions',
		],

		// Styling
		styling_pants: 'Linen trousers (#E8DDD0)',
		styling_footwear: 'BAREFOOT',

		// Lighting
		lighting_type: 'Soft natural window light',
		lighting_temperature: '4800K warm neutral',

		// Mood & Quality
		mood: 'Cozy, relaxed, authentic lifestyle',
		quality: '8K with subtle film grain, Kodak Portra tones',

		additional_config: {
			camera: {
				angle: 'Eye-level, intimate perspective',
				lens: '50mm f/2.0',
				depth_of_field: 'Medium, environmental context',
			},
			negative_prompt: 'harsh flash, cold tones, sterile environment, staged look',
		},
	},
];

/**
 * Seed DA Presets into the database
 * Only creates presets that don't already exist (by code)
 */
export async function seedDAPresets(dataSource: DataSource): Promise<void> {
	const repository = dataSource.getRepository(DAPreset);
	const logger = console;

	logger.log('🎨 Seeding DA Presets...');

	for (const presetData of DEFAULT_DA_PRESETS) {
		// Check if preset already exists by code
		const existing = await repository.findOne({
			where: { code: presetData.code },
		});

		if (existing) {
			logger.log(`   ⏭️  Skipping "${presetData.name}" - already exists`);
			continue;
		}

		// Create new preset
		const preset = repository.create(presetData);
		await repository.save(preset);
		logger.log(`   ✅ Created "${presetData.name}" (${presetData.code})`);
	}

	logger.log('🎨 DA Presets seeding complete!');
}

/**
 * Run seed as standalone script
 * Usage: npx ts-node src/database/seeds/da-preset.seed.ts
 */
export async function runSeed(): Promise<void> {
	// Dynamic import to avoid circular dependencies
	const { DataSource } = await import('typeorm');
	const { config } = await import('dotenv');

	// Load environment variables
	config();

	// Create a temporary data source for seeding
	const dataSource = new DataSource({
		type: 'postgres',
		url: process.env.DATABASE_URL,
		entities: [DAPreset],
		synchronize: false,
		logging: false,
	});

	try {
		await dataSource.initialize();
		console.log('📦 Database connected for seeding');

		await seedDAPresets(dataSource);

		await dataSource.destroy();
		console.log('📦 Database connection closed');
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		process.exit(1);
	}
}

// Run if executed directly
if (require.main === module) {
	runSeed();
}
