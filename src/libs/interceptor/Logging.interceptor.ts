import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
	Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger('HTTP');

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const request = context.switchToHttp().getRequest<Request>();
		const response = context.switchToHttp().getResponse<Response>();
		const { method, url, body, query, params, ip } = request;
		const userAgent = request.get('user-agent') || '';
		const startTime = Date.now();

		// Log request
		const requestLog = {
			method,
			url,
			body: this.sanitizeBody(body),
			query: Object.keys(query).length > 0 ? query : undefined,
			params: Object.keys(params).length > 0 ? params : undefined,
			ip,
			userAgent,
		};

		this.logger.log(
			`${method} ${url} - ${JSON.stringify(requestLog)}`,
			'REQUEST',
		);

		// Handle response
		return next.handle().pipe(
			tap((data) => {
				const responseTime = Date.now() - startTime;
				const statusCode = response.statusCode;

				const responseLog = {
					method,
					url,
					statusCode,
					responseTime: `${responseTime}ms`,
					responseSize: this.getResponseSize(data),
				};

				this.logger.log(
					`${method} ${url} ${statusCode} - ${responseTime}ms`,
					'RESPONSE',
				);
			}),
			catchError((error) => {
				const responseTime = Date.now() - startTime;
				const statusCode = error.status || 500;

				this.logger.error(
					`${method} ${url} ${statusCode} - ${responseTime}ms - ${error.message}`,
					error.stack,
					'ERROR',
				);

				throw error;
			}),
		);
	}

	private sanitizeBody(body: any): any {
		if (!body || typeof body !== 'object') {
			return body;
		}

		const sanitized = { ...body };
		const sensitiveFields = ['password', 'password_hash', 'token', 'secret'];

		for (const field of sensitiveFields) {
			if (sanitized[field]) {
				sanitized[field] = '***';
			}
		}

		return sanitized;
	}

	private getResponseSize(data: any): string {
		if (!data) return '0 B';
		const size = JSON.stringify(data).length;
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
		return `${(size / (1024 * 1024)).toFixed(2)} MB`;
	}
}
