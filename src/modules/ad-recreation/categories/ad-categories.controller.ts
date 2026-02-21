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
import { AdCategoriesService } from './ad-categories.service';
import { FilesService } from '../../../files/files.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdCategory } from '../../../database/entities/Ad-Recreation/ad-category.entity';
import { CreateAdCategoryDto, UpdateAdCategoryDto } from '../../../libs/dto/AdRecreation/categories';
import { AdCategoryMessage } from '../../../libs/messages';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class AdCategoriesController {
    private readonly logger = new Logger(AdCategoriesController.name);

    constructor(
        private readonly adCategoriesService: AdCategoriesService,
        private readonly filesService: FilesService,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // POST /categories - Create Category
    // ═══════════════════════════════════════════════════════════

    @Post()
    async create(
        @CurrentUser() user: User,
        @Body() dto: CreateAdCategoryDto,
    ): Promise<{ success: boolean; message: string; category: AdCategory }> {
        this.logger.log(`Creating Ad Category: ${dto.name}`);

        const category = await this.adCategoriesService.create(user.id, dto);

        return {
            success: true,
            message: AdCategoryMessage.CATEGORY_CREATED,
            category,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /categories - List All Categories
    // ═══════════════════════════════════════════════════════════

    @Get()
    async findAll(
        @CurrentUser() user: User,
        @Query('collection_id') collectionId?: string,
    ): Promise<{ success: boolean; categories: AdCategory[] }> {
        const categories = await this.adCategoriesService.findAll(user.id, collectionId);

        return {
            success: true,
            categories,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /categories/:id - Get Category Details
    // ═══════════════════════════════════════════════════════════

    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; category: AdCategory }> {
        const category = await this.adCategoriesService.findOne(id, user.id);

        return {
            success: true,
            category,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PATCH /categories/:id - Update Category
    // ═══════════════════════════════════════════════════════════

    @Patch(':id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @Body() dto: UpdateAdCategoryDto,
    ): Promise<{ success: boolean; message: string; category: AdCategory }> {
        this.logger.log(`Updating Ad Category: ${id}`);

        const category = await this.adCategoriesService.update(id, user.id, dto);

        return {
            success: true,
            message: AdCategoryMessage.CATEGORY_UPDATED,
            category,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE /categories/:id - Delete Category
    // ═══════════════════════════════════════════════════════════

    @Delete(':id')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Deleting Ad Category: ${id}`);

        await this.adCategoriesService.remove(id, user.id);

        return {
            success: true,
            message: AdCategoryMessage.CATEGORY_DELETED,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /categories/:id/image - Upload Category Image
    // ═══════════════════════════════════════════════════════════

    @Post(':id/image')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, cb) => {
                if (file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml|webp)$/)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException(AdCategoryMessage.ONLY_IMAGES_ALLOWED), false);
                }
            },
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async uploadImage(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<{ success: boolean; message: string; category: AdCategory }> {
        if (!file) {
            throw new BadRequestException('Image file is required');
        }

        const stored = await this.filesService.storeImage(file, 'ad-categories/images');

        const category = await this.adCategoriesService.updateImage(id, user.id, stored.url);

        return {
            success: true,
            message: AdCategoryMessage.CATEGORY_UPDATED,
            category,
        };
    }
}
