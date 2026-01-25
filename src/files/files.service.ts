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

	async storeImage(file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		// Use S3 if enabled, otherwise fallback to local
		if (this.s3Service.isEnabled()) {
			const filePath = this.s3Service.generatePath('uploads', path.extname(file.originalname).slice(1) || 'jpg');
			const buffer = fs.readFileSync(file.path);
			const { url, path: s3Path } = await this.s3Service.uploadBuffer(buffer, filePath, file.mimetype);
			
			// Clean up local temp file
			try {
				fs.unlinkSync(file.path);
			} catch (error) {
				this.logger.warn(`Failed to delete temp file: ${file.path}`);
			}

			return {
				filename: path.basename(filePath),
				mimetype: file.mimetype,
				size: file.size,
				path: s3Path,
				url,
			};
		}

		// Local storage fallback
		const uploadConfig = this.configService.get<any>('upload');
		const baseUrl = uploadConfig.baseUrl as string;
		const localPath = uploadConfig.localPath as string;
		const url = baseUrl
			? `${baseUrl.replace(/\/$/, '')}/${localPath}/${file.filename}`
			: `/${localPath}/${file.filename}`;

		return {
			filename: file.filename,
			mimetype: file.mimetype,
			size: file.size,
			path: file.path,
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
		
		// 🚀 CRITICAL: Generate URL that works with frontend
		// If baseUrl is set, use it; otherwise use relative path (frontend will prepend API base URL)
		const baseUrl = uploadConfig.baseUrl as string;
		
		// Generate URL - use baseUrl if provided, otherwise use relative path
		let url: string;
		if (baseUrl) {
			url = `${baseUrl.replace(/\/$/, '')}/${localPath}/${filename}`;
		} else {
			// Use relative path - frontend will prepend API base URL
			url = `/${localPath}/${filename}`;
		}

		this.logger.log(`📸 Generated image URL for local storage: ${url}`);

		return {
			filename,
			path: filePath,
			url,
		};
	}
}
