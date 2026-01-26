export const MERGE_PROMPT_TEMPLATE = `You are an expert creative director for fashion photography.

You will receive:
1. Product JSON (extracted product details)
2. DA JSON (Direction Artistique visual style)
3. Collection name

Your task: Generate 6 complete, detailed prompts by MERGING product details INTO the DA visual style.

CRITICAL RULES:
- Every product detail (color, material, logos, etc.) MUST appear in the prompt
- Every DA element (background, props, mood, composition) MUST appear in the prompt
- The product should be VISUALLY INTEGRATED into the DA scene, not just mentioned
- Use the exact hex codes from both Product and DA JSONs
- Maintain the DA's composition, lighting, and mood
- Be extremely detailed and specific

Return ONLY valid JSON object with 6 prompt objects:
{
  "duo": {
    "type": "duo",
    "display_name": "DUO (Father + Son)",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "vue de dos, logo RR visible, fond blanc, fond studio, sneakers, chaussures, sandales, plantes, décors aléatoires",
    "camera": {
      "focal_length_mm": 85,
      "aperture": 2.8,
      "focus": "SHARP_sur_produit_et_visages"
    },
    "background": {
      "wall": "[DA_BG_HEX]",
      "floor": "[DA_FLOOR_HEX]"
    },
    "product_details": {
      "type": "[PRODUCT_TYPE]",
      "color": "[COLOR_HEX]",
      "piping": "[if applicable]",
      "zip": "[if applicable]",
      "logos": "[LOGO_FRONT_TYPE] + [LOGO_BACK_TYPE]"
    },
    "da_elements": {
      "background": "[DA_BACKGROUND_DESC]",
      "props": "[DA_PROPS_ITEMS]",
      "mood": "[DA_MOOD]",
      "composition": "[DA_COMPOSITION_LAYOUT]"
    }
  },
  "solo": {
    "type": "solo",
    "display_name": "SOLO (Man alone)",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "enfant, fils, vue de dos, logo RR visible, fond blanc, plantes, décors aléatoires",
    "camera": {...},
    "background": {...},
    "product_details": {...},
    "da_elements": {...}
  },
  "flatlay_front": {
    "type": "flatlay_front",
    "display_name": "FLAT LAY FRONT",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "mannequin, personne, vue de dos, logo RR, fond blanc, ombres dures, plis désordonnés",
    "camera": {
      "focal_length_mm": 50,
      "aperture": 5.6,
      "focus": "SHARP_entire_garment",
      "angle": "TOP_DOWN_90_degrees"
    },
    "background": {...},
    "product_details": {...},
    "da_elements": {...}
  },
  "flatlay_back": {
    "type": "flatlay_back",
    "display_name": "FLAT LAY BACK",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "mannequin, personne, vue de face, logo Romimi cursif, fond blanc, ombres dures",
    "camera": {...},
    "background": {...},
    "product_details": {...},
    "da_elements": {...}
  },
  "closeup_front": {
    "type": "closeup_front",
    "display_name": "CLOSE UP FRONT",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "vue de dos, logo RR, visage visible, plan large, fond blanc",
    "camera": {
      "focal_length_mm": 85,
      "aperture": 2.8,
      "focus": "SHARP_sur_logo_et_texture"
    },
    "background": {...},
    "product_details": {...},
    "da_elements": {...}
  },
  "closeup_back": {
    "type": "closeup_back",
    "display_name": "CLOSE UP BACK",
    "prompt": "[FULL DETAILED PROMPT WITH PRODUCT + DA MERGED]",
    "negative_prompt": "vue de face, logo Romimi cursif, visage visible, fond blanc",
    "camera": {...},
    "background": {...},
    "product_details": {...},
    "da_elements": {...}
  }
}

Example merged prompt structure for DUO:
"Photo éditoriale haute couture [DA_MOOD] pour Romimi [COLLECTION_NAME]. [COMPOSITION_FROM_DA]. [SUBJECTS] portant [PRODUCT_TYPE] en [MATERIAL] [COLOR_NAME] (#[COLOR_HEX]) avec [PRODUCT_DETAILS]. Logo '[LOGO_FRONT_TYPE]' [LOGO_FRONT_COLOR] sur [LOGO_FRONT_POSITION]. Logo '[LOGO_BACK_TYPE]' [LOGO_BACK_COLOR] sur [LOGO_BACK_POSITION]. Texture [TEXTURE_DESCRIPTION]. STYLING : [DA_STYLING]. DÉCOR : fond [DA_BACKGROUND_DESC] (#[DA_BG_HEX]) avec [DA_PROPS_ITEMS]. [DA_LIGHTING]. Poses : [DA_POSES]. Ambiance [DA_MOOD]. Qualité [DA_QUALITY]."`;
