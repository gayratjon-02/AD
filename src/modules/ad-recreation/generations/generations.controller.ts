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
import { AdGenerationStatus } from '../../../libs/enums/AdRecreationEnums';

/**
 * Generations Controller - Phase 2: Ad Recreation
 *
 * Endpoints:
 * - POST /ad-recreation/generate            → Generate ads (with N variations)
 * - POST /ad-recreation/:id/render          → Re-render ad image
 * - POST /ad-recreation/:id/regenerate      → Regenerate specific variation
 * - GET  /ad-recreation/:id                 → Get generation by ID
 * - GET  /ad-recreation                     → Generation history
 */
@Controller('ad-recreation')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
    private readonly logger = new Logger(GenerationsController.name);

    constructor(private readonly generationsService: GenerationsService) { }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-recreation/generate - Generate Ad (N variations)
    // ═══════════════════════════════════════════════════════════

    @Post('generate')
    async generateAd(
        @CurrentUser() user: User,
        @Body() dto: GenerateAdDto,
    ): Promise<{ success: boolean; message: string; generation: AdGeneration; ad_copy: any; result: any }> {
        this.logger.log(`Generating ad for user ${user.id} (variations: ${dto.variations_count || 4})`);
        console.log('[AD-RECREATION CONTROLLER] 🚀 Generate request received');

        // Await the full generation — Socket.IO events fire during this call
        // for real-time updates if the frontend is connected
        const genResult = await this.generationsService.generateAd(user.id, dto);

        console.log(`[AD-RECREATION CONTROLLER] ✅ Generation completed: ${genResult.generation.id}`);
        console.log(`[AD-RECREATION CONTROLLER] 📊 Result images: ${genResult.generation.result_images?.length || 0}`);

        return {
            success: true,
            message: AdGenerationMessage.GENERATION_CREATED,
            generation: genResult.generation,
            ad_copy: genResult.ad_copy,
            result: genResult.result,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-recreation/:id/render - Render Ad Image (Legacy)
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
    // POST /ad-recreation/:id/regenerate - Regenerate Variation
    // ═══════════════════════════════════════════════════════════

    @Post(':id/regenerate')
    async regenerateVariation(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { variation_index: number },
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string; generation: AdGeneration }> {
        const variationIndex = body.variation_index || 1;
        this.logger.log(`Regenerating variation ${variationIndex} for generation ${id}`);

        const generation = await this.generationsService.regenerateVariation(id, variationIndex, user.id);

        return {
            success: true,
            message: AdGenerationMessage.REGENERATION_COMPLETED,
            generation,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /ad-recreation/:id - Get Generation by ID
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
    // GET /ad-recreation - Get All Generations
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
