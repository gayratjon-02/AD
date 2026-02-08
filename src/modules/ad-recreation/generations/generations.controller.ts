import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Logger,
    ParseUUIDPipe,
} from '@nestjs/common';
import { GenerationsService } from './generations.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdGeneration } from '../../../database/entities/Ad-Recreation/ad-generation.entity';
import { AdGenerationMessage } from '../../../libs/messages';
import { GenerateAdDto } from './dto/generate-ad.dto';

/**
 * Generations Controller - Phase 2: Ad Recreation
 *
 * Endpoints:
 * - POST /ad-generations/generate    → Generate ad copy from brand + concept + angle
 * - POST /ad-generations/:id/render  → Render ad image from generated image_prompt
 * - GET  /ad-generations/:id         → Get generation by ID
 * - GET  /ad-generations             → Get all generations for user
 */
@Controller('ad-generations')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
    private readonly logger = new Logger(GenerationsController.name);

    constructor(private readonly generationsService: GenerationsService) {}

    // ═══════════════════════════════════════════════════════════
    // POST /ad-generations/generate - Generate Ad
    // ═══════════════════════════════════════════════════════════

    @Post('generate')
    async generateAd(
        @CurrentUser() user: User,
        @Body() dto: GenerateAdDto,
    ): Promise<{ success: boolean; message: string; generation: AdGeneration; ad_copy: any }> {
        this.logger.log(`Generating ad for user ${user.id}`);

        const result = await this.generationsService.generateAd(user.id, dto);

        return {
            success: true,
            message: AdGenerationMessage.GENERATION_CREATED,
            generation: result.generation,
            ad_copy: result.ad_copy,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-generations/:id/render - Render Ad Image
    // ═══════════════════════════════════════════════════════════

    @Post(':id/render')
    async renderAdImage(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string; generation: AdGeneration }> {
        this.logger.log(`Rendering image for generation ${id}`);

        const generation = await this.generationsService.renderAdImage(id, user.id);

        return {
            success: true,
            message: AdGenerationMessage.RENDER_COMPLETED,
            generation,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /ad-generations/:id - Get Generation by ID
    // ═══════════════════════════════════════════════════════════

    @Get(':id')
    async getGeneration(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; generation: AdGeneration }> {
        const generation = await this.generationsService.findOne(id, user.id);

        return {
            success: true,
            generation,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /ad-generations - Get All Generations
    // ═══════════════════════════════════════════════════════════

    @Get()
    async getAllGenerations(
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; generations: AdGeneration[] }> {
        const generations = await this.generationsService.findAll(user.id);

        return {
            success: true,
            generations,
        };
    }
}
