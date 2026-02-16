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

        this.s3Client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
                secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
            },
        });

        this.logger.log(`S3 Client initialized → bucket: ${this.bucketName}, region: ${this.region}`);
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
        // Strip data URI header if present (e.g., "data:image/png;base64,")
        let cleanBase64 = base64String;
        if (cleanBase64.includes(',')) {
            const parts = cleanBase64.split(',');
            // Extract mime from header if available
            const headerMatch = parts[0].match(/data:(.*?);/);
            if (headerMatch) {
                mimeType = headerMatch[1];
            }
            cleanBase64 = parts[1];
        }

        const buffer = Buffer.from(cleanBase64, 'base64');
        const extension = mimeType.includes('png') ? 'png' : 'jpeg';
        const fileName = `${uuidv4()}.${extension}`;
        const key = `${folder}/${fileName}`;

        try {
            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                    Body: buffer,
                    ContentType: mimeType,
                    // Public read access for direct browser loading
                    // ACL: 'public-read',  // Uncomment if bucket policy requires ACL
                }),
            );

            const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
            this.logger.log(`✅ S3 upload success: ${publicUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);
            return publicUrl;
        } catch (error) {
            this.logger.error(`❌ S3 upload failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
