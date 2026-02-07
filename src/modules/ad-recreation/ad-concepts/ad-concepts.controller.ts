import {
    Controller,
    Get,
    Post,
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
 * - POST /ad-concepts/analyze   → Upload image and analyze with Claude Vision
 * - GET  /ad-concepts/:id       → Get concept by ID
 * - GET  /ad-concepts           → Get all concepts for user
 */
@Controller('ad-concepts')
@UseGuards(JwtAuthGuard)
export class AdConceptsController {
    private readonly logger = new Logger(AdConceptsController.name);

    constructor(private readonly adConceptsService: AdConceptsService) {}

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
}
