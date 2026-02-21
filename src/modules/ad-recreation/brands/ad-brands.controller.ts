import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
    UploadedFile,
    Logger,
    ParseUUIDPipe,
    BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AdBrandsService } from './ad-brands.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import {
    CreateAdBrandDto,
    BrandAssetsResponseDto,
    PlaybookType,
    AnalyzePlaybookResponseDto,
    AnalyzeBrandDto,
    AnalyzeBrandResponseDto,
} from '../../../libs/dto/AdRecreation/brands';
import { AdBrandMessage } from '../../../libs/messages';

/**
 * Ad Brands Controller - Phase 2: Ad Recreation
 *
 * Endpoints:
 * - POST /brands                → Create brand
 * - GET  /brands/:id            → Get brand details
 * - GET  /brands                → Get all brands
 * - GET  /brands/:id/playbooks  → Get all 3 playbook JSONs
 * - PUT  /brands/:id/playbooks/:type → Edit a playbook JSON
 * - GET  /brands/:id/angles     → Get available angles for this brand
 * - POST /brands/:id/angles     → Create custom angle
 * - POST /brands/:id/assets     → Upload brand assets (logos)
 * - POST /brands/:id/analyze-playbook → Analyze playbook PDF (brand/ads/copy)
 */
@Controller('brands')
@UseGuards(JwtAuthGuard)
export class AdBrandsController {
    private readonly logger = new Logger(AdBrandsController.name);

    constructor(private readonly adBrandsService: AdBrandsService) { }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-brands - Create Brand
    // ═══════════════════════════════════════════════════════════

    @Post()
    async createBrand(
        @CurrentUser() user: User,
        @Body() createDto: CreateAdBrandDto,
    ): Promise<{ success: boolean; message: string; brand: AdBrand }> {
        this.logger.log(`Creating Ad Brand: ${createDto.name}`);

        const brand = await this.adBrandsService.create(user.id, createDto);

        return {
            success: true,
            message: AdBrandMessage.BRAND_CREATED,
            brand,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-brands/analyze - ONLY Analyze Playbook (NO brand creation)
    // Returns analyzed JSON for user to review/edit
    // ═══════════════════════════════════════════════════════════

    @Post('analyze')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'file', maxCount: 1 },
                { name: 'logo_light', maxCount: 1 },
                { name: 'logo_dark', maxCount: 1 },
            ],
            {
                storage: diskStorage({
                    destination: './uploads/ad-brands/playbooks',
                    filename: (_req, file, cb) => {
                        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                        cb(null, uniqueName);
                    },
                }),
                fileFilter: (_req, file, cb) => {
                    // Accept PDF, DOCX, TXT for playbook; images for logos
                    const docMimes = [
                        'application/pdf',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'text/plain',
                    ];
                    const imageMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
                    if (file.fieldname === 'file') {
                        cb(docMimes.includes(file.mimetype) ? null : new BadRequestException('Only PDF, DOCX, or TXT files are allowed'), docMimes.includes(file.mimetype));
                    } else {
                        cb(imageMimes.includes(file.mimetype) ? null : new BadRequestException('Only PNG, JPG, WebP, or SVG images are allowed for logos'), imageMimes.includes(file.mimetype));
                    }
                },
                limits: {
                    fileSize: 10 * 1024 * 1024, // 10MB
                },
            },
        ),
    )
    async analyzeOnly(
        @CurrentUser() user: User,
        @UploadedFiles() files: { file?: Express.Multer.File[]; logo_light?: Express.Multer.File[]; logo_dark?: Express.Multer.File[] },
        @Body() dto: AnalyzeBrandDto,
    ): Promise<{ success: boolean; message: string; playbook: any }> {
        const file = files?.file?.[0];
        const logoLight = files?.logo_light?.[0];
        const logoDark = files?.logo_dark?.[0];

        this.logger.log(`Analyze Only (no brand creation): ${dto.name}`);
        this.logger.log(`Files received - playbook: ${file?.originalname || 'NONE'}, logo_light: ${logoLight?.originalname || 'NONE'}, logo_dark: ${logoDark?.originalname || 'NONE'}`);

        // Validation: must have file OR text_content
        if (!file && !dto.text_content) {
            throw new BadRequestException('Please provide either a file upload or text description of your brand');
        }

        // Only analyze - don't create brand
        const playbook = await this.adBrandsService.analyzeOnly(
            dto.name,
            dto.website,
            file?.path,
            dto.text_content,
            logoLight?.path,
            logoDark?.path,
        );

        return {
            success: true,
            message: 'Brand playbook analyzed successfully. Review and save to create brand.',
            playbook,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-brands/confirm - Create Brand with Edited Playbook
    // Called when user clicks "Save Brand" after reviewing JSON
    // ═══════════════════════════════════════════════════════════

    @Post('confirm')
    async confirmAndCreate(
        @CurrentUser() user: User,
        @Body() body: { name: string; website: string; industry: string; currency?: string; playbook: any },
    ): Promise<{ success: boolean; message: string; brand: AdBrand }> {
        this.logger.log(`Confirm and Create Brand: ${body.name}`);

        if (!body.name || !body.website || !body.playbook) {
            throw new BadRequestException('name, website, and playbook are required');
        }

        if (!body.industry) {
            throw new BadRequestException('industry is required');
        }

        if (typeof body.playbook !== 'object') {
            throw new BadRequestException('playbook must be a valid JSON object');
        }

        const brand = await this.adBrandsService.createWithPlaybook(
            user.id,
            body.name,
            body.website,
            body.industry,
            body.currency || 'GBP',
            body.playbook,
        );

        return {
            success: true,
            message: 'Brand created successfully',
            brand,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PATCH /ad-brands/:id/playbook - Update Brand Playbook
    // For editing existing brand playbook
    // ═══════════════════════════════════════════════════════════

    @Patch(':id/playbook')
    async updatePlaybook(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @Body() body: { playbook: any },
    ): Promise<{ success: boolean; message: string; brand: AdBrand }> {
        this.logger.log(`Updating playbook for brand ${id}`);

        if (!body.playbook || typeof body.playbook !== 'object') {
            throw new BadRequestException('playbook must be a valid JSON object');
        }

        const brand = await this.adBrandsService.updatePlaybook(id, user.id, body.playbook);

        return {
            success: true,
            message: 'Brand playbook updated successfully',
            brand,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /ad-brands/:id - Get Brand Details
    // ═══════════════════════════════════════════════════════════

    @Get(':id')
    async getBrand(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; brand: AdBrand }> {
        const brand = await this.adBrandsService.findOne(id, user.id);

        return {
            success: true,
            brand,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /ad-brands - Get All Brands
    // ═══════════════════════════════════════════════════════════

    @Get()
    async getAllBrands(
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; brands: AdBrand[] }> {
        const brands = await this.adBrandsService.findAll(user.id);

        return {
            success: true,
            brands,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /brands/:id/delete - Delete Brand
    // ═══════════════════════════════════════════════════════════

    @Post(':id/delete')
    async deleteBrand(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Deleting Ad Brand ${id}`);

        const result = await this.adBrandsService.remove(id, user.id);

        return {
            success: true,
            message: result.message,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /brands/:id/angles - Create Custom Angle
    // ═══════════════════════════════════════════════════════════

    @Post(':id/angles')
    async createCustomAngle(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @Body() body: { name: string; description: string; hook: string },
    ): Promise<{ success: boolean; message: string; brand: AdBrand }> {
        this.logger.log(`Creating custom angle for brand ${id}`);

        if (!body.name || !body.description || !body.hook) {
            throw new BadRequestException('name, description, and hook are required for a custom angle');
        }

        const brand = await this.adBrandsService.addCustomAngle(id, user.id, body);

        return {
            success: true,
            message: 'Custom angle created successfully',
            brand,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /brands/:id/angles - Get All Angles (Predefined + Custom)
    // ═══════════════════════════════════════════════════════════

    @Get(':id/angles')
    async getAngles(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; angles: any[] }> {
        this.logger.log(`Fetching angles for brand ${id}`);

        const angles = await this.adBrandsService.getAngles(id, user.id);

        return {
            success: true,
            angles,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-brands/:id/assets - Upload Brand Assets
    // Both logo_light and logo_dark are MANDATORY.
    // ═══════════════════════════════════════════════════════════

    @Post(':id/assets')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'logo_light', maxCount: 1 },
                { name: 'logo_dark', maxCount: 1 },
            ],
            {
                storage: diskStorage({
                    destination: './uploads/ad-brands/assets',
                    filename: (_req, file, cb) => {
                        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                        cb(null, uniqueName);
                    },
                }),
                fileFilter: (_req, file, cb) => {
                    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml|webp)$/)) {
                        cb(null, true);
                    } else {
                        cb(new BadRequestException(AdBrandMessage.ONLY_IMAGES_ALLOWED), false);
                    }
                },
                limits: {
                    fileSize: 5 * 1024 * 1024,
                },
            },
        ),
    )
    async uploadAssets(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @UploadedFiles() files: { logo_light?: Express.Multer.File[]; logo_dark?: Express.Multer.File[] },
    ): Promise<BrandAssetsResponseDto> {
        this.logger.log(`Uploading assets for Ad Brand ${id}`);

        // Strict validation: BOTH logos are required
        if (!files?.logo_light?.[0]) {
            throw new BadRequestException(AdBrandMessage.LOGO_LIGHT_REQUIRED);
        }
        if (!files?.logo_dark?.[0]) {
            throw new BadRequestException(AdBrandMessage.LOGO_DARK_REQUIRED);
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const logoLightUrl = `${baseUrl}/uploads/ad-brands/assets/${files.logo_light[0].filename}`;
        const logoDarkUrl = `${baseUrl}/uploads/ad-brands/assets/${files.logo_dark[0].filename}`;

        const brand = await this.adBrandsService.uploadAssets(id, user.id, logoLightUrl, logoDarkUrl);

        return {
            success: true,
            message: AdBrandMessage.ASSETS_UPLOADED,
            assets: brand.assets,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-brands/:id/playbook - Analyze Playbook PDF
    // Query param: ?type=brand|ads|copy (default: brand)
    // If type is 'brand', the file is MANDATORY.
    // ═══════════════════════════════════════════════════════════

    @Post(':id/playbook')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: (req, _file, cb) => {
                    const brandId = req.params.id as string;
                    const uploadPath = join('./uploads/brands', brandId, 'playbooks');

                    if (!existsSync(uploadPath)) {
                        mkdirSync(uploadPath, { recursive: true });
                    }

                    cb(null, uploadPath);
                },
                filename: (_req, file, cb) => {
                    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
            fileFilter: (_req, file, cb) => {
                if (file.mimetype === 'application/pdf') {
                    cb(null, true);
                } else {
                    cb(new BadRequestException(AdBrandMessage.ONLY_PDF_ALLOWED), false);
                }
            },
            limits: {
                fileSize: 10 * 1024 * 1024,
            },
        }),
    )
    async analyzePlaybook(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
        @Query('type') type?: string,
    ): Promise<AnalyzePlaybookResponseDto> {
        // Validate playbook type
        const validTypes = Object.values(PlaybookType);
        const playbookType = (type as PlaybookType) || PlaybookType.BRAND;

        if (!validTypes.includes(playbookType)) {
            throw new BadRequestException(AdBrandMessage.INVALID_PLAYBOOK_TYPE);
        }

        this.logger.log(`Analyzing ${playbookType} playbook for Ad Brand ${id}`);

        // PDF file is mandatory for all playbook types (brand, ads, copy)
        if (!file) {
            throw new BadRequestException(AdBrandMessage.PLAYBOOK_FILE_REQUIRED);
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const pdfUrl = file
            ? `${baseUrl}/uploads/brands/${id}/playbooks/${file.filename}`
            : undefined;

        const brand = await this.adBrandsService.analyzePlaybook(
            id,
            user.id,
            playbookType,
            file?.path,
            pdfUrl,
        );

        // Return the correct playbook data based on type
        const dataMap: Record<PlaybookType, any> = {
            [PlaybookType.BRAND]: brand.brand_playbook,
            [PlaybookType.ADS]: brand.ads_playbook,
            [PlaybookType.COPY]: brand.copy_playbook,
        };

        return {
            success: true,
            message: AdBrandMessage.PLAYBOOK_ANALYZED,
            playbook_type: playbookType,
            data: dataMap[playbookType],
        };
    }
}
