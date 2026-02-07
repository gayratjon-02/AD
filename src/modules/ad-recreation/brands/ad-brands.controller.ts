import {
    Controller,
    Get,
    Post,
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
} from '../../../libs/dto/AdRecreation/brands';
import { AdBrandMessage } from '../../../libs/messages';

/**
 * Ad Brands Controller - Phase 2: Ad Recreation
 *
 * Endpoints:
 * - POST /ad-brands                → Create brand
 * - GET  /ad-brands/:id            → Get brand details
 * - GET  /ad-brands                → Get all brands
 * - POST /ad-brands/:id/assets     → Upload brand assets (logos)
 * - POST /ad-brands/:id/playbook   → Analyze playbook PDF (brand/ads/copy)
 */
@Controller('ad-brands')
@UseGuards(JwtAuthGuard)
export class AdBrandsController {
    private readonly logger = new Logger(AdBrandsController.name);

    constructor(private readonly adBrandsService: AdBrandsService) {}

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

        // If type is 'brand', file is mandatory
        if (playbookType === PlaybookType.BRAND && !file) {
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
