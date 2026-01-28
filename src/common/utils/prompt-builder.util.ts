// Shot types that require real photorealistic human models
const HUMAN_MODEL_SHOT_TYPES = ['duo', 'solo'];

// Photorealistic enforcement prefix for human model shots
const PHOTOREALISTIC_PREFIX = 'Photorealistic editorial fashion photography, real human skin texture, highly detailed face, natural body proportions.';

// Duo-specific relationship enforcement
const DUO_RELATIONSHIP_PREFIX = 'A FATHER (adult man, approx 30-35 years old) and his SON (child, approx 6-8 years old) standing together, both wearing the product.';

// Negative prompt additions for human model shots
const HUMAN_SHOT_NEGATIVE = 'mannequin, headless, ghost mannequin, plastic skin, floating clothes, 3d render, artificial face, doll, figurine, wax figure, CGI person';

export class PromptBuilder {
	static build(template: string, variables: Record<string, any>): string {
		let prompt = template;

		// Replace standard variables {{key}}
		Object.keys(variables).forEach(key => {
			const value = variables[key];
			// Handle primitives directly
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
				const regex = new RegExp(`{{${key}}}`, 'g');
				prompt = prompt.replace(regex, String(value));
			}
			// Handle object/arrays by JSON stringifying (rare use case in prompts but good for debugging)
			else if (typeof value === 'object') {
				const regex = new RegExp(`{{${key}}}`, 'g');
				// For lists, join with commas if it's an array of strings
				if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
					prompt = prompt.replace(regex, value.join(', '));
				} else {
					prompt = prompt.replace(regex, JSON.stringify(value));
				}
			}
		});

		// Clean up any empty replacement markers
		// prompt = prompt.replace(/{{[^}]+}}/g, '');

		return prompt.trim();
	}

	static clean(prompt: string): string {
		// remove multiple spaces
		return prompt.replace(/\s+/g, ' ').trim();
	}

	/**
	 * Enhance a prompt based on shot type.
	 * For duo/solo: injects photorealistic human model requirements.
	 * For flatlay/closeup: ensures product-only focus.
	 */
	static enhanceForShotType(prompt: string, shotType: string): string {
		const type = shotType.toLowerCase();

		if (type === 'duo') {
			// Enforce father & son relationship + photorealistic humans
			let enhanced = prompt;

			// Add photorealistic prefix if not already present
			if (!enhanced.toLowerCase().includes('photorealistic')) {
				enhanced = `${PHOTOREALISTIC_PREFIX} ${enhanced}`;
			}

			// Inject duo relationship if not already present
			if (!enhanced.toLowerCase().includes('father') && !enhanced.toLowerCase().includes('son')) {
				enhanced = `${DUO_RELATIONSHIP_PREFIX} ${enhanced}`;
			}

			// Append negative prompt guidance
			enhanced += ` AVOID: ${HUMAN_SHOT_NEGATIVE}.`;

			return PromptBuilder.clean(enhanced);
		}

		if (type === 'solo') {
			let enhanced = prompt;

			// Add photorealistic prefix if not already present
			if (!enhanced.toLowerCase().includes('photorealistic')) {
				enhanced = `${PHOTOREALISTIC_PREFIX} ${enhanced}`;
			}

			// Append negative prompt guidance
			enhanced += ` AVOID: ${HUMAN_SHOT_NEGATIVE}.`;

			return PromptBuilder.clean(enhanced);
		}

		// For flatlay/closeup — no enhancement needed
		return prompt;
	}

	/**
	 * Returns whether a shot type requires real human models (not mannequins).
	 */
	static isHumanModelShot(shotType: string): boolean {
		return HUMAN_MODEL_SHOT_TYPES.includes(shotType.toLowerCase());
	}

	/**
	 * Returns the negative prompt additions for human model shots.
	 */
	static getHumanShotNegativePrompt(): string {
		return HUMAN_SHOT_NEGATIVE;
	}
}
