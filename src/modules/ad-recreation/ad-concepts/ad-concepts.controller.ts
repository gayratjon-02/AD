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
    UploadedFile,
    Logger,
    ParseUUIDPipe,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AdConceptsService } from './ad-concepts.service';
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
 */
@Controller('concepts')
@UseGuards(JwtAuthGuard)
export class AdConceptsController {
    private readonly logger = new Logger(AdConceptsController.name);

    constructor(private readonly adConceptsService: AdConceptsService) { }

    // ═══════════════════════════════════════════════════════════
    // POST /concepts/analyze - Upload & Analyze with Claude Vision
    // ═══════════════════════════════════════════════════════════

    @Post('analyze')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads/concepts',
                filename: (_req, file, cb) => {
                    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
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

        this.logger.log(`Analyzing concept image: ${file.filename}`);

        const baseUrl = process.env.UPLOAD_BASE_URL || 'http://localhost:4001';
        const imageUrl = `${baseUrl}/uploads/concepts/${file.filename}`;

        const concept = await this.adConceptsService.analyze(
            user.id,
            imageUrl,
            file.path,
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
}


