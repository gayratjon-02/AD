import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import { CreateAdBrandDto } from '../../../libs/dto/AdRecreation/brands';
import { BrandPlaybook, BrandAssets } from '../../../libs/types/AdRecreation';

/**
 * Ad Brands Service
 * 
 * Handles all business logic for Phase 2 Ad Recreation brands.
 * Separate from Phase 1 BrandsService to avoid conflicts.
 */
@Injectable()
export class AdBrandsService {
    private readonly logger = new Logger(AdBrandsService.name);

    constructor(
        @InjectRepository(AdBrand)
        private adBrandsRepository: Repository<AdBrand>,
    ) { }

    // ═══════════════════════════════════════════════════════════
    // CREATE BRAND
    // ═══════════════════════════════════════════════════════════

    /**
     * Create a new Ad Brand for the user
     */
    async create(userId: string, dto: CreateAdBrandDto): Promise<AdBrand> {
        this.logger.log(`Creating Ad Brand: ${dto.name} for user ${userId}`);

        const brand = this.adBrandsRepository.create({
            ...dto,
            user_id: userId,
        });

        const saved = await this.adBrandsRepository.save(brand);
        this.logger.log(`Created Ad Brand: ${saved.id}`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // GET BRAND BY ID
    // ═══════════════════════════════════════════════════════════

    /**
     * Get Ad Brand by ID with ownership check
     */
    async findOne(id: string, userId: string): Promise<AdBrand> {
        const brand = await this.adBrandsRepository.findOne({
            where: { id },
            relations: ['user'],
        });

        if (!brand) {
            throw new NotFoundException(`Ad Brand with ID ${id} not found`);
        }

        // Check ownership
        if (brand.user_id !== userId) {
            throw new ForbiddenException('You do not have access to this brand');
        }

        return brand;
    }

    /**
     * Get all Ad Brands for a user
     */
    async findAll(userId: string): Promise<AdBrand[]> {
        return this.adBrandsRepository.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPLOAD BRAND ASSETS
    // ═══════════════════════════════════════════════════════════

    /**
     * Upload and save brand assets (logos)
     */
    async uploadAssets(
        id: string,
        userId: string,
        logoLightUrl?: string,
        logoDarkUrl?: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        const currentAssets = brand.assets || {};
        const updatedAssets: BrandAssets = {
            ...currentAssets,
            ...(logoLightUrl && { logo_light_mode: logoLightUrl }),
            ...(logoDarkUrl && { logo_dark_mode: logoDarkUrl }),
        };

        brand.assets = updatedAssets;
        const saved = await this.adBrandsRepository.save(brand);

        this.logger.log(`Updated assets for Ad Brand ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE BRAND PLAYBOOK (PDF)
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyze uploaded PDF and save brand playbook
     */
    async analyzePlaybook(
        id: string,
        userId: string,
        pdfUrl: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        this.logger.log(`Analyzing playbook PDF for Ad Brand ${id}: ${pdfUrl}`);

        // Mock Claude PDF analysis - In production, call ClaudeService.analyzePdf(pdfUrl)
        const analyzedPlaybook = await this.mockClaudeAnalyzePdf(pdfUrl);

        brand.brand_playbook = analyzedPlaybook;
        const saved = await this.adBrandsRepository.save(brand);

        this.logger.log(`Saved brand playbook for Ad Brand ${id}`);
        return saved;
    }

    /**
     * Mock Claude PDF Analysis
     * TODO: Replace with actual ClaudeService.analyzePdf() call
     */
    private async mockClaudeAnalyzePdf(pdfUrl: string): Promise<BrandPlaybook> {
        this.logger.log(`[MOCK] Analyzing PDF: ${pdfUrl}`);

        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            colors: {
                primary: '#1E3A5F',
                secondary: '#F5A623',
                accent: '#00D4AA',
                palette: ['#1E3A5F', '#F5A623', '#00D4AA', '#FFFFFF', '#1A1A1A'],
            },
            fonts: {
                heading: 'Montserrat Bold',
                body: 'Inter Regular',
                accent: 'Playfair Display',
            },
            tone: {
                voice: 'professional',
                keywords: ['premium', 'innovative', 'trusted', 'elegant'],
            },
            logo_usage: {
                min_size: '24px',
                clear_space: '16px around logo',
                forbidden_contexts: ['dark busy backgrounds', 'competitor logos nearby'],
            },
        };
    }
}
