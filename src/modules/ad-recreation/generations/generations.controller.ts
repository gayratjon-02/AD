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
    ): Promise<{ success: boolean; message: string; generation: any }> {
        this.logger.log(`Generating ad for user ${user.id} (variations: ${dto.variations_count || 4})`);
        console.log('[AD-RECREATION CONTROLLER] 🚀 Generate request received, starting fire-and-forget...');

        // Fire-and-forget: start generation in background, return generation ID immediately
        // This allows the frontend to connect to Socket.IO BEFORE images start generating
        const genPromise = this.generationsService.generateAd(user.id, dto);

        // Wait briefly for validation + DB record creation (fast steps 1-4)
        // The generation ID is needed for the frontend to connect to Socket.IO
        // We use a race: either the full generation completes (unlikely in < 2s) or timeout
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));

        const earlyResult = await Promise.race([genPromise, timeoutPromise]);

        if (earlyResult) {
            // Full generation completed quickly (rare for image generation)
            console.log('[AD-RECREATION CONTROLLER] ✅ Generation completed within timeout');
            return {
                success: true,
                message: AdGenerationMessage.GENERATION_CREATED,
                generation: earlyResult.generation,
            };
        }

        // Timeout hit — generation is still running in background
        // Fetch the generation record that was created in Step 4
        console.log('[AD-RECREATION CONTROLLER] ⏳ Generation running in background, returning early...');

        // Let the background promise continue but handle errors
        genPromise.then((result) => {
            console.log(`[AD-RECREATION CONTROLLER] ✅ Background generation completed: ${result.generation.id}`);
        }).catch((err) => {
            console.error(`[AD-RECREATION CONTROLLER] ❌ Background generation failed:`, err.message);
        });

        // Find the generation record that was just created
        const generations = await this.generationsService.findAll(user.id);
        const latestGen = generations
            .filter(g => g.status === AdGenerationStatus.PROCESSING)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (latestGen) {
            console.log(`[AD-RECREATION CONTROLLER] 📤 Returning generation ID: ${latestGen.id} (status: processing)`);
            return {
                success: true,
                message: 'Generation started — connect to Socket.IO for real-time updates',
                generation: latestGen,
            };
        }

        // Fallback: wait for the full generation (shouldn't normally happen)
        console.log('[AD-RECREATION CONTROLLER] ⚠️ Falling back to full await...');
        const fullResult = await genPromise;
        return {
            success: true,
            message: AdGenerationMessage.GENERATION_CREATED,
            generation: fullResult.generation,
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
