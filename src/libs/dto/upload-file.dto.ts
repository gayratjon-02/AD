import { IsOptional, IsString, registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const ALLOWED_IMAGE_MIMES = new Set([
	'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg)$/i;

function isImageFile(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const file = value as { mimetype?: string; originalname?: string };
	const mime = file.mimetype?.toLowerCase();
	const name = file.originalname ?? '';
	if (mime && ALLOWED_IMAGE_MIMES.has(mime)) return true;
	if (name && ALLOWED_IMAGE_EXT.test(name)) return true;
	return false;
}

function IsImageFile(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isImageFile',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown) {
					return isImageFile(value);
				},
				defaultMessage(args: ValidationArguments) {
					return (validationOptions?.message as string) ?? 'File must be a valid image (JPEG, PNG, GIF, WebP, or SVG)';
				},
			},
		});
	};
}

function MaxFileSize(maxSizeMb: number, validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		const maxBytes = maxSizeMb * 1024 * 1024;
		registerDecorator({
			name: 'maxFileSize',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			constraints: [maxSizeMb],
			validator: {
				validate(value: unknown) {
					if (!value || typeof value !== 'object') return true; // let IsImageFile handle missing
					const file = value as { size?: number };
					const size = file.size ?? 0;
					return size <= maxBytes;
				},
				defaultMessage() {
					return (validationOptions?.message as string) ?? `File size must not exceed ${maxSizeMb}MB`;
				},
			},
		});
	};
}

export class UploadFileDto {
	@ApiProperty({
		description: 'Image file to upload',
		type: 'string',
		format: 'binary',
	})
	@IsImageFile({ message: 'File must be a valid image (JPEG, PNG, GIF, WebP, or SVG)' })
	@MaxFileSize(5, { message: 'File size must not exceed 5MB' })
	file: any; // Using 'any' instead of Express.Multer.File to avoid namespace issues

	@IsOptional()
	@IsString({ message: 'Description must be a string' })
	description?: string;

	@IsOptional()
	@IsString({ message: 'Category must be a string' })
	category?: string;
}

