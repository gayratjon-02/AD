import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: process.env.GEMINI_API_KEY,
  // QATIYAN: Faqat imagen-3.0-generate-001 modelidan foydalanish
  model: process.env.GEMINI_MODEL || 'imagen-3.0-generate-001',
}));
