import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: process.env.GEMINI_API_KEY,
  // gemini-2.5-flash-image (Imagen 3 shut down)
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-image',
}));
