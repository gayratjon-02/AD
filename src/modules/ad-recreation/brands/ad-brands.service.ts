import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdBrand } from '../../../database/entities/Ad-Recreation/ad-brand.entity';
import { CreateAdBrandDto, PlaybookType } from '../../../libs/dto/AdRecreation/brands';
import {
    BrandPlaybook,
    AdsPlaybook,
    CopyPlaybook,
    BrandAssets,
} from '../../../libs/types/AdRecreation';
import { AdBrandMessage } from '../../../libs/messages';

/**
 * Ad Brands Service - Phase 2: Ad Recreation
 *
 * Handles all business logic for brand creation, asset uploads,
 * and playbook analysis (brand / ads / copy).
 */
@Injectable()
export class AdBrandsService {
    private readonly logger = new Logger(AdBrandsService.name);

    constructor(
        @InjectRepository(AdBrand)
        private adBrandsRepository: Repository<AdBrand>,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // CREATE BRAND
    // ═══════════════════════════════════════════════════════════

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
    // GET BRAND BY ID (with ownership check)
    // ═══════════════════════════════════════════════════════════

    async findOne(id: string, userId: string): Promise<AdBrand> {
        const brand = await this.adBrandsRepository.findOne({
            where: { id },
            relations: ['user'],
        });

        if (!brand) {
            throw new NotFoundException(AdBrandMessage.BRAND_NOT_FOUND);
        }

        if (brand.user_id !== userId) {
            throw new ForbiddenException(AdBrandMessage.BRAND_ACCESS_DENIED);
        }

        return brand;
    }

    // ═══════════════════════════════════════════════════════════
    // GET ALL BRANDS
    // ═══════════════════════════════════════════════════════════

    async findAll(userId: string): Promise<AdBrand[]> {
        return this.adBrandsRepository.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UPLOAD BRAND ASSETS (both logos required)
    // ═══════════════════════════════════════════════════════════

    async uploadAssets(
        id: string,
        userId: string,
        logoLightUrl: string,
        logoDarkUrl: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        const updatedAssets: BrandAssets = {
            logo_light: logoLightUrl,
            logo_dark: logoDarkUrl,
        };

        brand.assets = updatedAssets;
        const saved = await this.adBrandsRepository.save(brand);

        this.logger.log(`Updated assets for Ad Brand ${id}`);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYZE PLAYBOOK (brand / ads / copy)
    // Saves to the correct column based on type.
    // ═══════════════════════════════════════════════════════════

    async analyzePlaybook(
        id: string,
        userId: string,
        type: PlaybookType,
        pdfUrl?: string,
    ): Promise<AdBrand> {
        const brand = await this.findOne(id, userId);

        this.logger.log(`Analyzing ${type} playbook for Ad Brand ${id}${pdfUrl ? `: ${pdfUrl}` : ''}`);

        // Mock analysis based on type
        // TODO: Replace with actual ClaudeService.analyzePdf() call
        switch (type) {
            case PlaybookType.BRAND: {
                const brandPlaybook = await this.mockBrandPlaybookAnalysis(pdfUrl!);
                brand.brand_playbook = brandPlaybook;
                break;
            }
            case PlaybookType.ADS: {
                const adsPlaybook = await this.mockAdsPlaybookAnalysis(pdfUrl);
                brand.ads_playbook = adsPlaybook;
                break;
            }
            case PlaybookType.COPY: {
                const copyPlaybook = await this.mockCopyPlaybookAnalysis(pdfUrl);
                brand.copy_playbook = copyPlaybook;
                break;
            }
        }

        const saved = await this.adBrandsRepository.save(brand);
        this.logger.log(`Saved ${type} playbook for Ad Brand ${id}`);

        return saved;
    }

    // ═══════════════════════════════════════════════════════════
    // MOCK ANALYSIS METHODS
    // TODO: Replace with real Claude integration
    // ═══════════════════════════════════════════════════════════

    private async mockBrandPlaybookAnalysis(pdfUrl: string): Promise<BrandPlaybook> {
        this.logger.log(`[MOCK] Analyzing brand PDF: ${pdfUrl}`);
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

    private async mockAdsPlaybookAnalysis(pdfUrl?: string): Promise<AdsPlaybook> {
        this.logger.log(`[MOCK] Analyzing ads playbook${pdfUrl ? `: ${pdfUrl}` : ''}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            layout_rules: {
                preferred_formats: ['9:16', '1:1', '4:5'],
                grid_system: '12-column grid',
                safe_zones: {
                    top: '10%',
                    bottom: '15%',
                    left: '5%',
                    right: '5%',
                },
            },
            visual_style: {
                image_treatment: 'high-contrast',
                overlay_opacity: 0.3,
                corner_radius: 12,
            },
        };
    }

    private async mockCopyPlaybookAnalysis(pdfUrl?: string): Promise<CopyPlaybook> {
        this.logger.log(`[MOCK] Analyzing copy playbook${pdfUrl ? `: ${pdfUrl}` : ''}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            hooks: [
                'Tired of {{pain_point}}?',
                'What if you could {{desired_outcome}}?',
                'Stop {{bad_habit}}. Start {{good_habit}}.',
            ],
            angles: [
                {
                    name: 'Problem-Solution',
                    description: 'Lead with the pain point, then present the product as the solution',
                    example_headlines: ['Still struggling with X?', 'The #1 solution for Y'],
                },
                {
                    name: 'Social Proof',
                    description: 'Leverage testimonials and numbers to build trust',
                    example_headlines: ['Join 10,000+ happy customers', 'Rated #1 by experts'],
                },
            ],
            cta_variations: ['Shop Now', 'Get Started', 'Try Free', 'Learn More'],
            forbidden_words: ['cheap', 'guarantee', 'best ever', 'miracle'],
        };
    }
}
