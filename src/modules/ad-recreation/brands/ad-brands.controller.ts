import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
    Logger,
    ParseUUIDPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AdBrandsService } from './ad-brands.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import {
    CreateAdBrandDto,
    BrandAssetsResponseDto,
    AnalyzeBrandPlaybookResponseDto,
} from '../../../libs/dto/AdRecreation/brands';

/**
 * Ad Brands Controller
 * 
 * Phase 2: Ad Recreation - Brand Foundation APIs
 * 
 * Endpoints:
 * - POST /ad-brands           → Create brand
 * - GET  /ad-brands/:id       → Get brand details
 * - GET  /ad-brands           → Get all brands
 * - POST /ad-brands/:id/assets → Upload brand assets (logos)
 * - POST /ad-brands/:id/playbook → Analyze brand playbook PDF
 */
@Controller('ad-brands')
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
            message: 'Brand created successfully',
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
                    filename: (req, file, cb) => {
                        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                        cb(null, uniqueName);
                    },
                }),
                fileFilter: (req, file, cb) => {
                    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml|webp)$/)) {
                        cb(null, true);
                    } else {
                        cb(new Error('Only image files are allowed'), false);
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

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const logoLightUrl = files.logo_light?.[0]
            ? `${baseUrl}/uploads/ad-brands/assets/${files.logo_light[0].filename}`
            : undefined;
        const logoDarkUrl = files.logo_dark?.[0]
            ? `${baseUrl}/uploads/ad-brands/assets/${files.logo_dark[0].filename}`
            : undefined;

        const brand = await this.adBrandsService.uploadAssets(id, user.id, logoLightUrl, logoDarkUrl);

        return {
            success: true,
            message: 'Brand assets uploaded successfully',
            assets: brand.assets,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-brands/:id/playbook - Analyze Brand Playbook
    // ═══════════════════════════════════════════════════════════

    @Post(':id/playbook')
    @UseInterceptors(
        FileFieldsInterceptor(
            [{ name: 'file', maxCount: 1 }],
            {
                storage: diskStorage({
                    destination: './uploads/ad-brands/playbooks',
                    filename: (req, file, cb) => {
                        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                        cb(null, uniqueName);
                    },
                }),
                fileFilter: (req, file, cb) => {
                    if (file.mimetype === 'application/pdf') {
                        cb(null, true);
                    } else {
                        cb(new Error('Only PDF files are allowed'), false);
                    }
                },
                limits: {
                    fileSize: 20 * 1024 * 1024,
                },
            },
        ),
    )
    async analyzePlaybook(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @UploadedFiles() files: { file?: Express.Multer.File[] },
    ): Promise<AnalyzeBrandPlaybookResponseDto> {
        this.logger.log(`Analyzing playbook for Ad Brand ${id}`);

        if (!files.file?.[0]) {
            throw new Error('PDF file is required');
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const pdfUrl = `${baseUrl}/uploads/ad-brands/playbooks/${files.file[0].filename}`;

        const brand = await this.adBrandsService.analyzePlaybook(id, user.id, pdfUrl);

        return {
            success: true,
            message: 'Brand playbook analyzed successfully',
            brand_playbook: brand.brand_playbook,
        };
    }
}
