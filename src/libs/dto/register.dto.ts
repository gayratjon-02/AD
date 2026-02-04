import { IsEmail, IsString, IsOptional, IsNotEmpty, registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ValidationMessage } from '../enums';

/** Disposable / temporary email domains to reject; Gmail, Yahoo, Outlook, custom domains are allowed. */
const DISPOSABLE_DOMAINS = new Set([
	'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email', 'yopmail.com',
	'maildrop.cc', 'trashmail.com', 'fakeinbox.com', 'temp-mail.org', 'getnada.com', 'mailnesia.com',
	'guerrillamail.info', 'sharklasers.com', 'grr.la', 'guerrillamail.biz', 'guerrillamail.de',
]);

function isBusinessEmail(value: string): boolean {
	if (!value || typeof value !== 'string') return false;
	const domain = value.split('@')[1]?.toLowerCase();
	if (!domain) return false;
	return !DISPOSABLE_DOMAINS.has(domain);
}

function IsBusinessEmail(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isBusinessEmail',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown, _args: ValidationArguments) {
					return typeof value === 'string' && isBusinessEmail(value);
				},
				defaultMessage(args: ValidationArguments) {
					return (validationOptions?.message as string) ?? 'Please provide a valid business email address';
				},
			},
		});
	};
}

function IsPasswordStrong(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isPasswordStrong',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown) {
					if (typeof value !== 'string') return false;
					if (value.length < 8) return false;
					const hasUpper = /[A-Z]/.test(value);
					const hasLower = /[a-z]/.test(value);
					const hasNumber = /\d/.test(value);
					return hasUpper && hasLower && hasNumber;
				},
				defaultMessage() {
					return 'Password must be at least 8 characters with uppercase, lowercase and a number';
				},
			},
		});
	};
}

export class RegisterDto {
	@ApiProperty({
		description: 'User email address (business emails only, no disposable emails)',
		example: 'john.doe@company.com',
		format: 'email',
	})
	@IsEmail({}, { message: ValidationMessage.EMAIL_INVALID })
	@IsBusinessEmail({ message: 'Please provide a valid business email address' })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	email: string;

	@ApiProperty({
		description: 'Strong password (min 8 chars, uppercase, lowercase, number)',
		example: 'MySecurePass123',
		minLength: 8,
	})
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsPasswordStrong({ message: 'Password must be at least 8 characters with uppercase, lowercase and a number' })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	password: string;

	@ApiProperty({
		description: 'User full name (optional)',
		example: 'John Doe',
		required: false,
	})
	@IsString()
	@IsOptional()
	name?: string;
}

