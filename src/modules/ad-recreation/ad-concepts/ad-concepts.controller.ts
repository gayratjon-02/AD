import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
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
import { AnalyzeConceptResponseDto } from '../../../libs/dto/AdRecreation/ad-concepts';
import { AdConceptMessage } from '../../../libs/messages';

/**
 * Ad Concepts Controller - Phase 2: Ad Recreation
 *
 * Endpoints:
 * - POST /concepts/analyze   → Upload image and analyze with Claude Vision
 * - GET  /concepts/:id       → Get concept by ID
 * - GET  /concepts           → List saved concepts (filterable by tags)
 * - PUT  /concepts/:id       → Edit concept (name, tags, JSON)
 */
@Controller('concepts')
@UseGuards(JwtAuthGuard)
export class AdConceptsController {
    private readonly logger = new Logger(AdConceptsController.name);

    constructor(private readonly adConceptsService: AdConceptsService) { }

    // ═══════════════════════════════════════════════════════════
    // POST /ad-concepts/analyze - Upload & Analyze with Claude Vision
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

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
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
    // GET /ad-concepts/:id - Get Concept by ID
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
    // GET /ad-concepts - Get All Concepts
    // ═══════════════════════════════════════════════════════════

    @Get()
    async getAllConcepts(
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; concepts: AdConcept[] }> {
        const concepts = await this.adConceptsService.findAll(user.id);

        return {
            success: true,
            concepts,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PATCH /ad-concepts/:id - Update Concept Analysis JSON
    // ═══════════════════════════════════════════════════════════

    @Patch(':id')
    async updateConcept(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { analysis_json: object },
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string; concept: AdConcept }> {
        if (!body.analysis_json || typeof body.analysis_json !== 'object') {
            throw new BadRequestException('analysis_json must be a valid object');
        }

        this.logger.log(`Updating concept ${id} analysis_json`);

        const concept = await this.adConceptsService.updateAnalysis(
            id,
            user.id,
            body.analysis_json,
        );

        return {
            success: true,
            message: 'Ad concept updated successfully',
            concept,
        };
    }
}

