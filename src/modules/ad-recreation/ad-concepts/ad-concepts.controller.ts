import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Logger,
    ParseUUIDPipe,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdConceptsService } from './ad-concepts.service';
import { FilesService } from '../../../files/files.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdConcept } from '../../../database/entities/Ad-Recreation/ad-concept.entity';
import { AnalyzeConceptResponseDto, UpdateConceptDto } from '../../../libs/dto/AdRecreation/ad-concepts';
import { AdConceptMessage } from '../../../libs/messages';

/**
 * Ad Concepts Controller - Phase 2: Ad Recreation
 *
 * Endpoints:
 * - POST /concepts/analyze   → Upload image and analyze with Claude Vision
 * - GET  /concepts/:id       → Get concept by ID
 * - GET  /concepts           → List saved concepts (filterable by tags)
 * - PATCH /concepts/:id      → Edit concept (name, notes, tags, analysis_json)
 * - DELETE /concepts/:id     → Delete concept
 */
@Controller('concepts')
@UseGuards(JwtAuthGuard)
export class AdConceptsController {
    private readonly logger = new Logger(AdConceptsController.name);

    constructor(
        private readonly adConceptsService: AdConceptsService,
        private readonly filesService: FilesService,
    ) { }

    // ═══════════════════════════════════════════════════════════
    // POST /concepts/analyze - Upload & Analyze with Claude Vision
    // ═══════════════════════════════════════════════════════════

    @Post('analyze')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, cb) => {
                if (file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException(AdConceptMessage.ONLY_IMAGES_ALLOWED), false);
                }
            },
            limits: {
                fileSize: 20 * 1024 * 1024,
            },
        }),
    )
    async analyzeConcept(
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<AnalyzeConceptResponseDto> {
        if (!file) {
            throw new BadRequestException(AdConceptMessage.IMAGE_FILE_REQUIRED);
        }

        this.logger.log(`Analyzing concept image: ${file.originalname}`);

        // Upload to S3
        const stored = await this.filesService.storeImage(file, 'concepts');

        const concept = await this.adConceptsService.analyze(
            user.id,
            stored.url,
            file.buffer,
            file.mimetype,
        );

        return {
            success: true,
            message: AdConceptMessage.CONCEPT_ANALYZED,
            concept,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /concepts/:id - Get Concept by ID
    // ═══════════════════════════════════════════════════════════

    @Get(':id')
    async getConcept(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; concept: AdConcept }> {
        const concept = await this.adConceptsService.findOne(id, user.id);

        return {
            success: true,
            concept,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /concepts - List All Concepts (filterable by tags)
    // Usage: GET /concepts?tags=notes_app,editorial
    // ═══════════════════════════════════════════════════════════

    @Get()
    async getAllConcepts(
        @CurrentUser() user: User,
        @Query('tags') tagsQuery?: string,
    ): Promise<{ success: boolean; concepts: AdConcept[]; total: number }> {
        // Parse comma-separated tags from query string
        const tags = tagsQuery
            ? tagsQuery.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
            : undefined;

        const concepts = await this.adConceptsService.findAll(user.id, tags);

        return {
            success: true,
            concepts,
            total: concepts.length,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PATCH /concepts/:id - Update Concept (name, notes, tags, analysis_json)
    // ═══════════════════════════════════════════════════════════

    @Patch(':id')
    async updateConcept(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: UpdateConceptDto,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string; concept: AdConcept }> {
        this.logger.log(`Updating concept ${id}: ${JSON.stringify(Object.keys(body))}`);

        const concept = await this.adConceptsService.updateConcept(
            id,
            user.id,
            body,
        );

        return {
            success: true,
            message: AdConceptMessage.CONCEPT_UPDATED,
            concept,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE /concepts/:id - Delete Concept
    // ═══════════════════════════════════════════════════════════

    @Delete(':id')
    async removeConcept(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string }> {
        await this.adConceptsService.remove(id, user.id);
        return {
            success: true,
            message: AdConceptMessage.CONCEPT_DELETED,
        };
    }
}


