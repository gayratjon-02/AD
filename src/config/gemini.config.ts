import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: process.env.GEMINI_API_KEY,
  // QATIYAN: Faqat gemini-3-pro-image-preview modelidan foydalanish
  model: process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview',
}));
