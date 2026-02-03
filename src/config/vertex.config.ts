import { registerAs } from '@nestjs/config';

export default registerAs('vertex', () => ({
  projectId: process.env.VERTEX_PROJECT_ID,
  location: process.env.VERTEX_LOCATION || 'us-central1',
  imagenModel: process.env.VERTEX_IMAGEN_MODEL || 'imagen-3.0-generate-002',
  // Optional: path to service account JSON for ADC
  applicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
}));
