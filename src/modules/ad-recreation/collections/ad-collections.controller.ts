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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AdCollectionsService } from './ad-collections.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdCollection } from '../../../database/entities/Ad-Recreation/ad-collection.entity';
import { CreateAdCollectionDto, UpdateAdCollectionDto } from '../../../libs/dto/AdRecreation/collections';
import { AdCollectionMessage } from '../../../libs/messages';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class AdCollectionsController {
    private readonly logger = new Logger(AdCollectionsController.name);

    constructor(private readonly adCollectionsService: AdCollectionsService) {}

    // ═══════════════════════════════════════════════════════════
    // POST /collections - Create Collection
    // ═══════════════════════════════════════════════════════════

    @Post()
    async create(
        @CurrentUser() user: User,
        @Body() dto: CreateAdCollectionDto,
    ): Promise<{ success: boolean; message: string; collection: AdCollection }> {
        this.logger.log(`Creating Ad Collection: ${dto.name}`);

        const collection = await this.adCollectionsService.create(user.id, dto);

        return {
            success: true,
            message: AdCollectionMessage.COLLECTION_CREATED,
            collection,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /collections - List All Collections
    // ═══════════════════════════════════════════════════════════

    @Get()
    async findAll(
        @CurrentUser() user: User,
        @Query('brand_id') brandId?: string,
    ): Promise<{ success: boolean; collections: AdCollection[] }> {
        const collections = await this.adCollectionsService.findAll(user.id, brandId);

        return {
            success: true,
            collections,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /collections/:id - Get Collection Details
    // ═══════════════════════════════════════════════════════════

    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; collection: AdCollection }> {
        const collection = await this.adCollectionsService.findOne(id, user.id);

        return {
            success: true,
            collection,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PATCH /collections/:id - Update Collection
    // ═══════════════════════════════════════════════════════════

    @Patch(':id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @Body() dto: UpdateAdCollectionDto,
    ): Promise<{ success: boolean; message: string; collection: AdCollection }> {
        this.logger.log(`Updating Ad Collection: ${id}`);

        const collection = await this.adCollectionsService.update(id, user.id, dto);

        return {
            success: true,
            message: AdCollectionMessage.COLLECTION_UPDATED,
            collection,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE /collections/:id - Delete Collection
    // ═══════════════════════════════════════════════════════════

    @Delete(':id')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Deleting Ad Collection: ${id}`);

        await this.adCollectionsService.remove(id, user.id);

        return {
            success: true,
            message: AdCollectionMessage.COLLECTION_DELETED,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /collections/:id/cover-image - Upload Cover Image
    // ═══════════════════════════════════════════════════════════

    @Post(':id/cover-image')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads/ad-collections/covers',
                filename: (_req, file, cb) => {
                    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
            fileFilter: (_req, file, cb) => {
                if (file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml|webp)$/)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException(AdCollectionMessage.ONLY_IMAGES_ALLOWED), false);
                }
            },
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async uploadCoverImage(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<{ success: boolean; message: string; collection: AdCollection }> {
        if (!file) {
            throw new BadRequestException('Cover image file is required');
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const coverImageUrl = `${baseUrl}/uploads/ad-collections/covers/${file.filename}`;

        const collection = await this.adCollectionsService.updateCoverImage(id, user.id, coverImageUrl);

        return {
            success: true,
            message: AdCollectionMessage.COLLECTION_UPDATED,
            collection,
        };
    }
}
