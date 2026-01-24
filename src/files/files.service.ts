import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import 'multer';
import { FileMessage } from '../libs/enums';

@Injectable()
export class FilesService {
	constructor(private configService: ConfigService) {}

	async storeImage(file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const uploadConfig = this.configService.get<any>('upload');
		if (uploadConfig.provider !== 'local') {
			throw new BadRequestException(FileMessage.FILE_UPLOAD_FAILED);
		}

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
}
