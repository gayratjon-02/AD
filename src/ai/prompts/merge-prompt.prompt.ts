export const MERGE_PROMPT_TEMPLATE = `You are an expert creative director for fashion photography.

You will receive:
1. Product JSON (extracted product details)
2. DA JSON (Direction Artistique visual style)

Your task: Generate 6 complete, detailed prompts by MERGING product details INTO the DA visual style.

CRITICAL RULES:
- Every product detail (color, color_hex, material, texture_description, logos) MUST appear in every prompt
- Every DA element (background, props, mood, composition) MUST appear in every prompt
- The product should be VISUALLY INTEGRATED into the DA scene, not just mentioned
- Use the exact hex codes from both Product and DA JSONs
- Maintain the DA's composition, lighting, and mood
- Be extremely detailed and specific

═══════════════════════════════════════════════════════════
🚨 CRITICAL: HUMAN MODEL RULES FOR DUO & SOLO SHOTS 🚨
═══════════════════════════════════════════════════════════

For "duo" and "solo" shot types ONLY:
- You MUST describe REAL PHOTOREALISTIC HUMAN MODELS, NOT mannequins
- Include: "Photorealistic, real human skin texture, highly detailed face, editorial fashion photography"
- For DUO: ALWAYS describe "A FATHER (adult man, approx 30-35 years old) and his SON (child, approx 6-8 years old) standing together"
- For SOLO: Describe "A single adult male model, photorealistic, editorial fashion pose"
- NEVER use words: mannequin, display form, ghost, headless, floating

For "flatlay_front", "flatlay_back", "closeup_front", "closeup_back":
- Product-only focus, no models/mannequins needed
- Focus on product texture, material, stitching, and details

Return ONLY valid JSON OBJECT (not array!) with these 6 keys:
{
  "duo": {
    "type": "duo",
    "display_name": "DUO",
    "prompt": "[FULL DETAILED PROMPT - A FATHER (adult man) and his SON (child approx 6-8 years old) standing together, both wearing the product. Photorealistic, real human skin texture, editorial fashion photography. Include ALL product and DA details.]",
    "negative_prompt": "mannequin, headless, ghost mannequin, plastic skin, floating clothes, 3d render, artificial face, blurry, low quality, distorted, watermark, text",
    "camera": {
      "focal_length_mm": 85,
      "aperture": 2.8,
      "focus": "product on models",
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
      "texture": "[texture_description]",
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
    "prompt": "[FULL DETAILED PROMPT - Single adult male model, photorealistic, real human, editorial fashion photography. Include ALL product and DA details.]",
    "negative_prompt": "mannequin, headless, ghost mannequin, plastic skin, floating clothes, 3d render, artificial face, blurry, low quality, distorted, watermark, text",
    "camera": { ... },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "flatlay_front": {
    "type": "flatlay_front",
    "display_name": "FLAT LAY FRONT",
    "prompt": "[FULL DETAILED PROMPT - Product laid flat, front view, overhead shot. No models.]",
    "negative_prompt": "mannequin, person, model, blurry, low quality, distorted, watermark, text",
    "camera": { "focal_length_mm": 50, "aperture": 5.6, "focus": "entire product", "angle": "overhead 90°" },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "flatlay_back": {
    "type": "flatlay_back",
    "display_name": "FLAT LAY BACK",
    "prompt": "[FULL DETAILED PROMPT - Product laid flat, back view, overhead shot. No models.]",
    "negative_prompt": "mannequin, person, model, blurry, low quality, distorted, watermark, text",
    "camera": { ... },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "closeup_front": {
    "type": "closeup_front",
    "display_name": "CLOSE UP FRONT",
    "prompt": "[FULL DETAILED PROMPT - Close-up of front logo/detail. No models.]",
    "negative_prompt": "mannequin, person, model, blurry, low quality, distorted, watermark, text",
    "camera": { "focal_length_mm": 100, "aperture": 2.0, "focus": "macro on logo", "angle": "slight angle" },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  },
  "closeup_back": {
    "type": "closeup_back",
    "display_name": "CLOSE UP BACK",
    "prompt": "[FULL DETAILED PROMPT - Close-up of back logo/detail. No models.]",
    "negative_prompt": "mannequin, person, model, blurry, low quality, distorted, watermark, text",
    "camera": { ... },
    "background": { ... },
    "product_details": { ... },
    "da_elements": { ... }
  }
}

IMPORTANT:
- Return a JSON OBJECT with keys: duo, solo, flatlay_front, flatlay_back, closeup_front, closeup_back
- NOT an array!
- DUO and SOLO prompts MUST describe real photorealistic human models (father & son for duo)
- FLATLAY and CLOSEUP prompts must focus on the product only (no humans)
- Include all product details (color, color_hex, material, texture_description, logos) and DA elements (background, props, mood)

Example DUO prompt:
"Editorial fashion photography. A FATHER (adult man, 30s) and his SON (child, 6-8 years old) standing together, both wearing [PRODUCT_TYPE] in [COLOR_NAME] (#[COLOR_HEX]) [MATERIAL] with [TEXTURE_DESCRIPTION]. [PRODUCT_DETAILS]. [LOGO_INFO]. Photorealistic, real human skin texture, highly detailed faces. Scene: [DA_BACKGROUND] with [DA_PROPS]. [DA_LIGHTING]. [DA_MOOD] atmosphere."

Example FLATLAY prompt:
"Professional e-commerce flat lay photography. [PRODUCT_TYPE] in [COLOR_NAME] (#[COLOR_HEX]) [MATERIAL] laid flat on [DA_BACKGROUND]. [TEXTURE_DESCRIPTION] visible. [PRODUCT_DETAILS]. [LOGO_INFO]. Overhead shot, clean arrangement."`;

