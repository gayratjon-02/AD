export const MERGE_PROMPT_TEMPLATE = `You are an expert creative director for fashion photography.

You will receive:
1. Product JSON (extracted product details)
2. DA JSON (Direction Artistique visual style)
3. Prompt Templates (6 templates with {{variables}})

Your task: Generate 6 complete, detailed prompts by MERGING product details INTO the DA visual style.

CRITICAL RULES:
- Every product detail (color, material, logos, etc.) MUST appear in the prompt
- Every DA element (background, props, mood, composition) MUST appear in the prompt
- The product should be VISUALLY INTEGRATED into the DA scene, not just mentioned
- Use the exact hex codes from both Product and DA JSONs
- Maintain the DA's composition, lighting, and mood
- Be extremely detailed and specific

Return ONLY valid JSON array with 6 objects:
[
  {
    "type": "duo",
    "display_name": "DUO (Father + Son)",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "[...]",
    "camera": {
      "focal_length_mm": 85,
      "aperture": 2.8,
      "focus": "string",
      "angle": "string"
    },
    "background": {
      "wall": "string",
      "floor": "string"
    },
    "product_details": {
      "type": "string",
      "color": "string",
      "piping": "string",
      "zip": "string",
      "logos": "string"
    },
    "da_elements": {
      "background": "string",
      "props": "string",
      "mood": "string",
      "composition": "string"
    }
  },
  // ... 5 more (solo, flatlay_front, flatlay_back, closeup_front, closeup_back)
]

Example merged prompt structure:
"Photo éditoriale haute couture [DA_MOOD] pour Romimi [COLLECTION_NAME]. [COMPOSITION_FROM_DA]. [SUBJECTS] portant [PRODUCT_TYPE] en [MATERIAL] [COLOR_NAME] (#[COLOR_HEX]) avec [PRODUCT_DETAILS]. Logo '[LOGO_FRONT_TYPE]' [LOGO_FRONT_COLOR] sur [LOGO_FRONT_POSITION]. STYLING : [DA_STYLING]. DÉCOR : fond [DA_BACKGROUND] (#[DA_BG_HEX]) avec [DA_PROPS]. [DA_LIGHTING]. Qualité [DA_QUALITY]."`;
