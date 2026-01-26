export const MERGE_PROMPT_TEMPLATE = `You are an expert creative director for fashion photography.

You will receive:
1. Product JSON (extracted product details)
2. DA JSON (Direction Artistique visual style)

Your task: Generate 6 complete, detailed prompts by MERGING product details INTO the DA visual style.

CRITICAL RULES:
- Every product detail (color, material, logos, etc.) MUST appear in the prompt
- Every DA element (background, props, mood, composition) MUST appear in the prompt
- The product should be VISUALLY INTEGRATED into the DA scene, not just mentioned
- Use the exact hex codes from both Product and DA JSONs
- Maintain the DA's composition, lighting, and mood
- Be extremely detailed and specific
- Focus prompts on THE PRODUCT, not on describing people

Return ONLY valid JSON OBJECT (not array!) with these 6 keys:
{
  "duo": {
    "type": "duo",
    "display_name": "DUO",
    "prompt": "[FULL DETAILED PROMPT - Two professional mannequins displaying the product]",
    "negative_prompt": "blurry, low quality, distorted, watermark, text",
    "camera": {
      "focal_length_mm": 85,
      "aperture": 2.8,
      "focus": "product details",
      "angle": "eye level"
    },
    "background": {
      "wall": "[DA background]",
      "floor": "[DA floor]"
    },
    "product_details": {
      "type": "[product type]",
      "color": "[color name and hex]",
      "material": "[material]",
      "logos": "[logo descriptions]"
    },
    "da_elements": {
      "background": "[DA background description]",
      "props": "[DA props]",
      "mood": "[DA mood]",
      "composition": "[DA composition]"
    }
  },
  "solo": {
    "type": "solo",
    "display_name": "SOLO",
    "prompt": "[FULL DETAILED PROMPT - Single mannequin displaying the product]",
    "negative_prompt": "blurry, low quality, distorted, watermark, text",
    "camera": { ... },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "flatlay_front": {
    "type": "flatlay_front",
    "display_name": "FLAT LAY FRONT",
    "prompt": "[FULL DETAILED PROMPT - Product laid flat, front view, overhead shot]",
    "negative_prompt": "blurry, low quality, distorted, watermark, text",
    "camera": { "focal_length_mm": 50, "aperture": 5.6, "focus": "entire product", "angle": "overhead 90°" },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "flatlay_back": {
    "type": "flatlay_back",
    "display_name": "FLAT LAY BACK",
    "prompt": "[FULL DETAILED PROMPT - Product laid flat, back view, overhead shot]",
    "negative_prompt": "blurry, low quality, distorted, watermark, text",
    "camera": { ... },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "closeup_front": {
    "type": "closeup_front",
    "display_name": "CLOSE UP FRONT",
    "prompt": "[FULL DETAILED PROMPT - Close-up of front logo/detail]",
    "negative_prompt": "blurry, low quality, distorted, watermark, text",
    "camera": { "focal_length_mm": 100, "aperture": 2.0, "focus": "macro on logo", "angle": "slight angle" },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "closeup_back": {
    "type": "closeup_back",
    "display_name": "CLOSE UP BACK",
    "prompt": "[FULL DETAILED PROMPT - Close-up of back logo/detail]",
    "negative_prompt": "blurry, low quality, distorted, watermark, text",
    "camera": { ... },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  }
}

IMPORTANT: 
- Return a JSON OBJECT with keys: duo, solo, flatlay_front, flatlay_back, closeup_front, closeup_back
- NOT an array!
- Each prompt must be detailed and focus on the PRODUCT, not on people wearing it
- Include all product details (color, material, logos) and DA elements (background, props, mood)

Example merged prompt style:
"Professional e-commerce product photography. [PRODUCT_TYPE] in [MATERIAL] [COLOR_NAME] (#[COLOR_HEX]) displayed on mannequin. [PRODUCT_DETAILS]. [LOGO_INFO]. Scene: [DA_BACKGROUND] (#[DA_BG_HEX]) with [DA_PROPS]. [DA_LIGHTING]. [DA_MOOD] atmosphere. High-resolution studio quality."`;
