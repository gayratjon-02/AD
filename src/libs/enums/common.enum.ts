// Authentication Errors
export enum AuthMessage {
	USER_ALREADY_EXISTS = 'User with this email already exists',
	INVALID_EMAIL_OR_PASSWORD = 'Invalid email or password',
	UNAUTHORIZED = 'Unauthorized access',
	TOKEN_EXPIRED = 'Token has expired',
	TOKEN_INVALID = 'Invalid token',
}

// Validation Errors
export enum ValidationMessage {
	EMAIL_INVALID = 'Email must be a valid email address',
	PASSWORD_TOO_SHORT = 'Password must be at least 6 characters long',
	FIELD_REQUIRED = 'This field is required',
	FIELD_INVALID = 'Invalid field value',
	UNKNOWN_PROPERTIES = 'Unknown properties are not allowed',
}

// Not Found Errors
export enum NotFoundMessage {
	USER_NOT_FOUND = 'User not found',
	BRAND_NOT_FOUND = 'Brand not found',
	COLLECTION_NOT_FOUND = 'Collection not found',
	PRODUCT_NOT_FOUND = 'Product not found',
	GENERATION_NOT_FOUND = 'Generation not found',
	PACKSHOT_NOT_FOUND = 'Packshot generation not found',
}

// Permission Errors
export enum PermissionMessage {
	FORBIDDEN = 'You do not have permission to access this resource',
	NOT_OWNER = 'You are not the owner of this resource',
}

// File Upload Errors
export enum FileMessage {
	FILE_TOO_LARGE = 'File size is too large',
	INVALID_FILE_TYPE = 'Invalid file type',
	FILE_UPLOAD_FAILED = 'File upload failed',
	FILE_NOT_FOUND = 'File not found',
	MAX_FILES_EXCEEDED = 'Maximum number of files exceeded',
}

// AI Service Errors
export enum AIMessage {
	CLAUDE_API_ERROR = 'Claude API error occurred',
	GEMINI_API_ERROR = 'Gemini API error occurred',
	IMAGE_ANALYSIS_FAILED = 'Image analysis failed',
	PROMPT_GENERATION_FAILED = 'Prompt generation failed',
	IMAGE_GENERATION_FAILED = 'Image generation failed',
	API_KEY_MISSING = 'AI API key is missing',
}

// Generation Errors
export enum GenerationMessage {
	GENERATION_IN_PROGRESS = 'Generation is already in progress',
	GENERATION_FAILED = 'Generation failed',
	GENERATION_NOT_READY = 'Generation is not ready yet',
	NO_VISUALS_FOUND = 'No visuals found for this generation',
	INVALID_GENERATION_TYPE = 'Invalid generation type',
}

// Packshot Errors
export enum PackshotMessage {
	PACKSHOT_NOT_FOUND = 'Packshot generation not found',
	PACKSHOT_IN_PROGRESS = 'Packshot generation is already in progress',
	PACKSHOT_FAILED = 'Packshot generation failed',
}

// Database Errors
export enum DatabaseMessage {
	CONNECTION_ERROR = 'Database connection error',
	QUERY_FAILED = 'Database query failed',
	TRANSACTION_FAILED = 'Database transaction failed',
}

// General Errors
export enum ErrorMessage {
	INTERNAL_SERVER_ERROR = 'Internal server error',
	BAD_REQUEST = 'Bad request',
	CONFLICT = 'Resource conflict',
	UNPROCESSABLE_ENTITY = 'Unprocessable entity',
}

// Success Messages
export enum SuccessMessage {
	USER_CREATED = 'User created successfully',
	USER_UPDATED = 'User updated successfully',
	BRAND_CREATED = 'Brand created successfully',
	BRAND_UPDATED = 'Brand updated successfully',
	BRAND_DELETED = 'Brand deleted successfully',
	COLLECTION_CREATED = 'Collection created successfully',
	COLLECTION_UPDATED = 'Collection updated successfully',
	COLLECTION_DELETED = 'Collection deleted successfully',
	PRODUCT_CREATED = 'Product created successfully',
	PRODUCT_UPDATED = 'Product updated successfully',
	PRODUCT_DELETED = 'Product deleted successfully',
	PRODUCT_ANALYZED = 'Product analyzed successfully',
	GENERATION_CREATED = 'Generation created successfully',
	GENERATION_STARTED = 'Generation started successfully',
	GENERATION_COMPLETED = 'Generation completed successfully',
	FILE_UPLOADED = 'File uploaded successfully',
	PACKSHOT_CREATED = 'Packshot generation created successfully',
	PACKSHOT_COMPLETED = 'Packshot generation completed successfully',
}