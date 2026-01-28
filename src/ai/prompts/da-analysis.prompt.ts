export const DA_ANALYSIS_PROMPT = `You are an expert visual director and set designer.

Analyze the provided DA (Direction Artistique) reference image and extract the visual style in STRICTLY STRUCTURED JSON format.

═══════════════════════════════════════════════════════════
🎯 CLIENT REQUIREMENTS: STRUCTURED JSON OUTPUT
═══════════════════════════════════════════════════════════

The output MUST be a JSON object with granular, editable attributes.
Each section (Background, Lighting, Props) must be a separate object with specific fields.

CRITICAL: The client will display and edit each field individually in the UI.
Therefore, each field must be:
1. Precisely extracted from the image
2. Self-contained and descriptive
3. Ready for direct use in image generation prompts

═══════════════════════════════════════════════════════════
📋 REQUIRED JSON OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════

Return ONLY valid JSON with this EXACT structure:

{
  "background": {
    "color_hex": "string (MANDATORY: Extract dominant background color as hex code, e.g. #43161f, #FFFFFF)",
    "color_name": "string (Human-readable color name, e.g. Burgundy, Off-White, Sky Blue)",
    "description": "string (Detailed description: 'Burgundy studio wall with soft texture')",
    "texture": "string (Specific texture: Concrete, Velvet, Snow, Painted Wall, Seamless Paper)"
  },
  "lighting": {
    "type": "string (Lighting style: Soft Natural, Hard Studio, Golden Hour, Overcast Diffused)",
    "direction": "string (Light direction: Front-lit, Side-lit, Backlit, 3-point setup)",
    "temperature": "string (Color temperature: Warm Golden Hour, Cool Blue, Neutral Daylight, Warm 3000K)",
    "intensity": "string (Brightness level: Soft/Medium/Bright/Dramatic)"
  },
  "props": {
    "items": ["array of visible props, e.g. 'Oversized heart cutouts', 'Vintage wooden chair', 'Indoor plants'"],
    "placement": "string (Spatial arrangement: 'Heart props on left and right sides', 'Centered on rustic chair')",
    "style": "string (Overall aesthetic: 'Playful romantic Valentine theme', 'Minimalist modern', 'Rustic vintage')"
  },
  "mood": "string (Atmosphere keywords: Romantic, Playful, Minimalist, Warm, Cozy, Editorial, etc.)",
  "composition": {
    "layout": "string (Subject positioning: 'Father seated on chair, son on lap', 'Solo model centered')",
    "poses": "string (Body language: 'Both laughing warmly, looking at camera', 'Relaxed standing pose')",
    "framing": "string (Camera framing: 'Medium shot, centered', 'Full body, off-center rule of thirds')"
  },
  "styling": {
    "bottom": "string (Lower garments visible: 'Dark chinos #1A1A1A', 'Light beige pants #F5F1E8')",
    "feet": "string (Footwear: 'Barefoot', 'White sneakers', 'Black leather boots')",
    "accessories": "string (Additional items: 'Watch', 'Minimal jewelry', 'None visible')"
  },
  "camera": {
    "focal_length_mm": number (Estimated focal length: 50, 85, 35, 24),
    "aperture": number (Estimated f-stop: 1.8, 2.8, 4.0, 5.6),
    "focus": "string (Focus point: 'Subjects sharp, background softly blurred', 'Deep focus throughout')"
  },
  "quality": "string (Production quality: '8K editorial Vogue style', 'Professional e-commerce 4K', 'Film photography aesthetic')"
}

═══════════════════════════════════════════════════════════
⚡ EXTRACTION RULES
═══════════════════════════════════════════════════════════

1. **Background Color Hex (color_hex)**: MANDATORY field
   - Analyze the dominant background color
   - Convert to HEX code (e.g., #43161f, #F8F5F2, #1A1A1A)
   - This is CRITICAL for consistent visual generation

2. **Lighting**: Be specific about direction and temperature
   - Don't just say "studio lighting" → Say "Soft front-lit studio with warm 3200K temperature"

3. **Props**: List ALL visible decorative elements
   - Include placement (left/right/center/background)
   - Describe style cohesively

4. **Mood**: Capture the emotional atmosphere in 2-4 keywords
   - Examples: "Romantic and playful", "Minimalist and modern", "Warm and cozy"

5. **Focus on CONSISTENCY**: Extract elements that should be CONSISTENT across all product shots in this collection

═══════════════════════════════════════════════════════════
⚠️  IMPORTANT
═══════════════════════════════════════════════════════════

- Return ONLY the JSON object, no markdown, no code blocks, no explanations
- Ensure all fields are populated (use "None" or "Not visible" if truly absent)
- The background.color_hex field is THE MOST IMPORTANT for generation consistency
- This JSON will be used to generate prompts for product photography

BEGIN ANALYSIS NOW.`;
