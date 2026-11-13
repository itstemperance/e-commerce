import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  PaginatedProductsResponse,
  ProductResponseItem,
  ProductsService,
} from './products.service';
import {
  CreateProductDto,
  QueryProductsDto,
  UpdateProductDto,
  UploadProductImageDto,
} from './dto/query-products.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @Query() query: QueryProductsDto,
    @Headers('x-benchmark-mode') benchmarkMode?: string,
    @Query('nocache') nocache?: string,
  ): Promise<PaginatedProductsResponse> {
    const bypassCache = benchmarkMode === 'no-cache' || nocache === '1';
    return this.productsService.findAll(query, bypassCache);
  }

  @Get('slug/:slug')
  async findBySlug(
    @Param('slug') slug: string,
    @Headers('x-benchmark-mode') benchmarkMode?: string,
    @Query('nocache') nocache?: string,
  ): Promise<ProductResponseItem> {
    const bypassCache = benchmarkMode === 'no-cache' || nocache === '1';
    return this.productsService.findBySlug(slug, bypassCache);
  }

  @Get(':id')
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProductResponseItem> {
    return this.productsService.findById(id);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async uploadImage(
    @Body() dto: UploadProductImageDto,
  ): Promise<{ url: string; fileName: string; savedPaths: string[] }> {
    return this.productsService.saveUploadedProductImage(
      dto.fileName,
      dto.dataUrl,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto): Promise<ProductResponseItem> {
    return this.productsService.createProduct(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseItem> {
    return this.productsService.updateProduct(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deletedId: string; title: string }> {
    return this.productsService.deleteProduct(id);
  }
}
