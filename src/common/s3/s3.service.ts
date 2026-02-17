// src/common/s3/s3.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
    private readonly logger = new Logger(S3Service.name);
    private readonly s3Client: S3Client;
    private readonly bucketName: string;
    private readonly region: string;

    constructor(private readonly configService: ConfigService) {
        this.region = this.configService.get<string>('AWS_BUCKET_REGION', 'eu-west-3');
        this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME', 'romimi-visual-generator');

        const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '');
        const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', '');

        this.s3Client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });

        // ═══ INITIALIZATION LOGS ═══
        this.logger.log(`══════════════════════════════════════════════`);
        this.logger.log(`🪣 S3 SERVICE INITIALIZED`);
        this.logger.log(`   Bucket:     ${this.bucketName}`);
        this.logger.log(`   Region:     ${this.region}`);
        this.logger.log(`   Access Key: ${accessKeyId ? accessKeyId.substring(0, 8) + '...' : '❌ MISSING!'}`);
        this.logger.log(`   Secret Key: ${secretAccessKey ? '✅ SET (' + secretAccessKey.length + ' chars)' : '❌ MISSING!'}`);
        this.logger.log(`══════════════════════════════════════════════`);
    }

    /**
     * Upload a Base64-encoded image to S3.
     *
     * @param base64String - Raw Base64 string (with or without data URI header)
     * @param folder - S3 key prefix, e.g. "generations" or "brands/logos"
     * @param mimeType - MIME type, defaults to "image/png"
     * @returns Full public S3 URL
     */
    async uploadBase64Image(
        base64String: string,
        folder: string,
        mimeType: string = 'image/png',
    ): Promise<string> {
        this.logger.log(`──────────────────────────────────────────────`);
        this.logger.log(`📤 S3 UPLOAD STARTED`);
        this.logger.log(`   Folder:     ${folder}`);
        this.logger.log(`   MIME Type:  ${mimeType}`);
        this.logger.log(`   Base64 len: ${(base64String.length / 1024).toFixed(1)} KB`);

        // Strip data URI header if present (e.g., "data:image/png;base64,")
        let cleanBase64 = base64String;
        if (cleanBase64.includes(',')) {
            const parts = cleanBase64.split(',');
            // Extract mime from header if available
            const headerMatch = parts[0].match(/data:(.*?);/);
            if (headerMatch) {
                mimeType = headerMatch[1];
                this.logger.log(`   Extracted MIME from header: ${mimeType}`);
            }
            cleanBase64 = parts[1];
            this.logger.log(`   Stripped data URI header`);
        }

        const buffer = Buffer.from(cleanBase64, 'base64');
        const extension = mimeType.includes('png') ? 'png' : 'jpeg';
        const fileName = `${uuidv4()}.${extension}`;
        const key = `${folder}/${fileName}`;

        this.logger.log(`   File name:  ${fileName}`);
        this.logger.log(`   S3 Key:     ${key}`);
        this.logger.log(`   Buffer size: ${(buffer.length / 1024).toFixed(1)} KB`);
        this.logger.log(`   Uploading to S3...`);

        const startTime = Date.now();

        try {
            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                    Body: buffer,
                    ContentType: mimeType,
                    ACL: 'public-read',
                }),
            );

            const elapsed = Date.now() - startTime;
            const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

            this.logger.log(`   ✅ UPLOAD SUCCESS (${elapsed}ms)`);
            this.logger.log(`   🔗 URL: ${publicUrl}`);
            this.logger.log(`──────────────────────────────────────────────`);

            return publicUrl;
        } catch (error) {
            const elapsed = Date.now() - startTime;
            this.logger.error(`   ❌ UPLOAD FAILED (${elapsed}ms)`);
            this.logger.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.name) {
                this.logger.error(`   Error Name: ${error.name}`);
            }
            this.logger.error(`──────────────────────────────────────────────`);
            throw error;
        }
    }
}
