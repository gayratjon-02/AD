import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
	provider: process.env.FILE_STORAGE_PROVIDER || 'local',
	localPath: process.env.UPLOAD_LOCAL_PATH || 'uploads',
	maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '15728640', 10), // 15MB default
	allowedMimeTypes: (process.env.UPLOAD_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp').split(
		',',
	),
	baseUrl: process.env.UPLOAD_BASE_URL || '',
	// S3 Configuration
	s3: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		region: process.env.AWS_REGION || 'us-east-1',
		bucket: process.env.AWS_S3_BUCKET,
		endpoint: process.env.AWS_S3_ENDPOINT, // For S3-compatible services (e.g., DigitalOcean Spaces)
		forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
	},
}));
