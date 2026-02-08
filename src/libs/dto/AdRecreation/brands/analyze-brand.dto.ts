import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength } from 'class-validator';

/**
 * DTO for analyzing brand assets and creating a brand in one step.
 * 
 * User must provide either file (via multipart) OR text_content.
 * The backend will use Claude to analyze the input and return a structured playbook.
 */
export class AnalyzeBrandDto {
    @IsString()
    @IsNotEmpty({ message: 'Brand name is required' })
    @MaxLength(100)
    name: string;

    @IsString()
    @IsNotEmpty({ message: 'Website URL is required' })
    @IsUrl({}, { message: 'Please provide a valid URL' })
    website: string;

    @IsString()
    @IsOptional()
    @MaxLength(10000, { message: 'Text content cannot exceed 10000 characters' })
    text_content?: string;

    @IsString()
    @IsOptional()
    industry?: string;
}

/**
 * Response from the analyze endpoint
 */
export class AnalyzeBrandResponseDto {
    success: boolean;
    message: string;
    brand_id: string;
    brand_name: string;
    playbook: BrandPlaybookJson;
}

/**
 * Brand Playbook JSON structure (as per user spec)
 */
export interface BrandPlaybookJson {
    brand_name: string;
    website: string;
    brand_colors: {
        primary: string;
        secondary: string;
        background: string;
        text_dark: string;
    };
    typography: {
        headline: string;
        body: string;
    };
    tone_of_voice: string;
    target_audience: {
        gender: string;
        age_range: string;
    };
}
