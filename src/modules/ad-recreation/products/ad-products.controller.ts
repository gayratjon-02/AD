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
    UploadedFiles,
    Logger,
    ParseUUIDPipe,
    BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FILE_SIZE_LIMIT } from '../../../libs/config';
import { AdProductsService } from './ad-products.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../../database/entities/Product-Visuals/user.entity';
import { AdProduct } from '../../../database/entities/Ad-Recreation/ad-product.entity';
import { CreateAdProductDto, UpdateAdProductDto } from '../../../libs/dto/AdRecreation/products';
import { AdProductMessage } from '../../../libs/messages';
import { FilesService } from '../../../files/files.service';

@Controller('ad-recreation/products')
@UseGuards(JwtAuthGuard)
export class AdProductsController {
    private readonly logger = new Logger(AdProductsController.name);

    constructor(
        private readonly adProductsService: AdProductsService,
        private readonly filesService: FilesService,
    ) {}

    // ═══════════════════════════════════════════════════════════
    // POST /products - Create Product
    // ═══════════════════════════════════════════════════════════

    @Post()
    async create(
        @CurrentUser() user: User,
        @Body() dto: CreateAdProductDto,
    ): Promise<{ success: boolean; message: string; product: AdProduct }> {
        this.logger.log(`Creating Ad Product: ${dto.name}`);

        const product = await this.adProductsService.create(user.id, dto);

        return {
            success: true,
            message: AdProductMessage.PRODUCT_CREATED,
            product,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /products/analyze - Analyze Single Reference Image
    // ═══════════════════════════════════════════════════════════

    @Post('analyze')
    @UseInterceptors(FileInterceptor('reference_image', { limits: FILE_SIZE_LIMIT }))
    async analyzeProduct(
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<{
        success: boolean;
        message: string;
        product_id: string;
        image_url: string;
        analysis: Record<string, any>;
    }> {
        if (!file) {
            throw new BadRequestException(AdProductMessage.REFERENCE_IMAGE_REQUIRED);
        }

        this.logger.log(`Analyzing Ad product image: ${file.filename}`);

        // Store the file and get URL
        const stored = await this.filesService.storeImage(file);

        // Analyze and save
        const result = await this.adProductsService.analyzeProductDirect(user.id, stored.url);

        return {
            success: true,
            message: AdProductMessage.PRODUCT_ANALYZED,
            product_id: result.product_id,
            image_url: result.image_url,
            analysis: result.analysis,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /products - List All Products
    // ═══════════════════════════════════════════════════════════

    @Get()
    async findAll(
        @CurrentUser() user: User,
        @Query('category_id') categoryId?: string,
    ): Promise<{ success: boolean; products: AdProduct[] }> {
        const products = await this.adProductsService.findAll(user.id, categoryId);

        return {
            success: true,
            products,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // GET /products/:id - Get Product Details
    // ═══════════════════════════════════════════════════════════

    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; product: AdProduct }> {
        const product = await this.adProductsService.findOne(id, user.id);

        return {
            success: true,
            product,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // PATCH /products/:id - Update Product
    // ═══════════════════════════════════════════════════════════

    @Patch(':id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @Body() dto: UpdateAdProductDto,
    ): Promise<{ success: boolean; message: string; product: AdProduct }> {
        this.logger.log(`Updating Ad Product: ${id}`);

        const product = await this.adProductsService.update(id, user.id, dto);

        return {
            success: true,
            message: AdProductMessage.PRODUCT_UPDATED,
            product,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE /products/:id - Delete Product
    // ═══════════════════════════════════════════════════════════

    @Delete(':id')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Deleting Ad Product: ${id}`);

        await this.adProductsService.remove(id, user.id);

        return {
            success: true,
            message: AdProductMessage.PRODUCT_DELETED,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // POST /products/:id/images - Upload Product Images
    // ═══════════════════════════════════════════════════════════

    @Post(':id/images')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'front_image', maxCount: 1 },
                { name: 'back_image', maxCount: 1 },
            ],
            {
                storage: diskStorage({
                    destination: './uploads/ad-products/images',
                    filename: (_req, file, cb) => {
                        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
                        cb(null, uniqueName);
                    },
                }),
                fileFilter: (_req, file, cb) => {
                    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|svg\+xml|webp)$/)) {
                        cb(null, true);
                    } else {
                        cb(new BadRequestException(AdProductMessage.ONLY_IMAGES_ALLOWED), false);
                    }
                },
                limits: { fileSize: 5 * 1024 * 1024 },
            },
        ),
    )
    async uploadImages(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @UploadedFiles() files: { front_image?: Express.Multer.File[]; back_image?: Express.Multer.File[] },
    ): Promise<{ success: boolean; message: string; product: AdProduct }> {
        if (!files?.front_image?.[0] && !files?.back_image?.[0]) {
            throw new BadRequestException('At least one image file is required (front_image or back_image)');
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const frontImageUrl = files?.front_image?.[0]
            ? `${baseUrl}/uploads/ad-products/images/${files.front_image[0].filename}`
            : undefined;
        const backImageUrl = files?.back_image?.[0]
            ? `${baseUrl}/uploads/ad-products/images/${files.back_image[0].filename}`
            : undefined;

        const product = await this.adProductsService.updateImages(id, user.id, frontImageUrl, backImageUrl);

        return {
            success: true,
            message: AdProductMessage.PRODUCT_UPDATED,
            product,
        };
    }
}
