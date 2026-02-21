import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import 'multer';
import { FileMessage } from '../libs/enums';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { S3Service } from './s3.service';

@Injectable()
export class FilesService {
	private readonly logger = new Logger(FilesService.name);

	constructor(
		private configService: ConfigService,
		private s3Service: S3Service,
	) {}

	/**
	 * Store an uploaded file (from memoryStorage or diskStorage).
	 * Routes to S3 when enabled, otherwise saves locally.
	 * @param file - Multer file (buffer-backed from memoryStorage or disk-backed)
	 * @param prefix - S3 key prefix / local subfolder (e.g. 'ad-brands/logos', 'concepts')
	 */
	async storeImage(file: Express.Multer.File, prefix: string = 'uploads') {
		if (!file) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		// Get buffer: memoryStorage has file.buffer, diskStorage has file.path
		const buffer = file.buffer || fs.readFileSync(file.path);
		const ext = path.extname(file.originalname).slice(1) || 'jpg';

		// S3 upload path
		if (this.s3Service.isEnabled()) {
			const s3Path = this.s3Service.generatePath(prefix, ext);
			const { url, path: storedPath } = await this.s3Service.uploadBuffer(buffer, s3Path, file.mimetype);

			// Clean up local temp file if diskStorage was used
			if (file.path) {
				try { fs.unlinkSync(file.path); } catch {}
			}

			this.logger.log(`📤 S3: ${storedPath} (${buffer.length} bytes)`);

			return {
				filename: path.basename(s3Path),
				mimetype: file.mimetype,
				size: file.size,
				path: storedPath,
				url,
			};
		}

		// Local storage fallback
		const uploadConfig = this.configService.get<any>('upload');
		const localPath = uploadConfig.localPath as string;
		const baseUrl = uploadConfig.baseUrl || process.env.UPLOAD_BASE_URL || '';

		// If file is already on disk (diskStorage), use it as-is
		if (file.path && file.filename) {
			const url = baseUrl
				? `${baseUrl}/${localPath}/${file.filename}`
				: `/${localPath}/${file.filename}`;

			return {
				filename: file.filename,
				mimetype: file.mimetype,
				size: file.size,
				path: file.path,
				url,
			};
		}

		// memoryStorage: save buffer to local disk under {localPath}/{prefix}/
		const filename = `${randomUUID()}.${ext}`;
		const localDir = path.join(process.cwd(), localPath, prefix);
		fs.mkdirSync(localDir, { recursive: true });
		const filePath = path.join(localDir, filename);
		fs.writeFileSync(filePath, buffer);

		const url = baseUrl
			? `${baseUrl}/${localPath}/${prefix}/${filename}`
			: `/${localPath}/${prefix}/${filename}`;

		this.logger.log(`📁 Local: ${filePath}`);

		return {
			filename,
			mimetype: file.mimetype,
			size: file.size,
			path: filePath,
			url,
		};
	}

	async storeBase64Image(base64Data: string, mimeType: string = 'image/jpeg'): Promise<{ url: string; filename: string; path: string }> {
		if (!base64Data) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		// Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
		const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
		
		// Convert base64 to buffer
		const buffer = Buffer.from(base64String, 'base64');
		
		// Determine file extension from mime type
		const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

		// Use S3 if enabled, otherwise fallback to local
		if (this.s3Service.isEnabled()) {
			const filePath = this.s3Service.generatePath('generations', ext);
			const { url, path: s3Path } = await this.s3Service.uploadBuffer(buffer, filePath, mimeType);
			
			return {
				filename: path.basename(filePath),
				path: s3Path,
				url,
			};
		}

		// Local storage fallback
		const uploadConfig = this.configService.get<any>('upload');
		const filename = `${randomUUID()}.${ext}`;
		
		// Get upload directory
		const localPath = uploadConfig.localPath as string;
		const absolutePath = path.join(process.cwd(), localPath);
		
		// Ensure directory exists
		fs.mkdirSync(absolutePath, { recursive: true });
		
		// Save file
		const filePath = path.join(absolutePath, filename);
		fs.writeFileSync(filePath, buffer);
		
		// 🚀 CRITICAL: Return ABSOLUTE URL for generated images
		// This ensures frontend can access images directly without URL manipulation
		const baseUrl = uploadConfig.baseUrl || process.env.UPLOAD_BASE_URL || '';
		let url: string;
		
		if (baseUrl) {
			// Use configured base URL (e.g., http://209.97.168.255:5031)
			url = `${baseUrl}/${localPath}/${filename}`;
		} else {
			// Fallback to relative URL (frontend must handle)
			url = `/${localPath}/${filename}`;
		}

		this.logger.log(`📸 Generated image URL: ${url}`);

		return {
			filename,
			path: filePath,
			url,
		};
	}
}
