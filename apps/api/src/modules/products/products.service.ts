import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  CreateProductDto,
  QueryProductsDto,
  UpdateProductDto,
} from './dto/query-products.dto';

export interface ProductResponseItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  originalPrice: number;
  images: string[];
  tags: string[];
  status: ProductStatus;
  created_at: string;
  inventory: {
    product_id: string;
    total_stock: number;
    reserved_stock: number;
    available_stock: number;
    version: number;
  };
}

export interface PaginatedProductsResponse {
  items: ProductResponseItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface DefaultProductCatalogExtras {
  originalPrice?: number;
  tags: string[];
  accentHex: [string, string];
  categoryLabel: string;
}

const DEFAULT_EXTRAS_BY_SLUG: Record<string, DefaultProductCatalogExtras> = {
  'nvidia-rtx-5090-founders-edition-flash': {
    originalPrice: 61190000,
    tags: ['Flash Deal', 'Card đồ họa', 'Gaming', 'Cao cấp', '32GB GDDR7'],
    accentHex: ['#064e3b', '#18181b'],
    categoryLabel: 'CARD ĐỒ HỌA NVIDIA BLACKWELL',
  },
  'macbook-pro-16-m4-max-flash': {
    originalPrice: 76490000,
    tags: ['Flash Deal', 'Laptop', 'Apple M4 Max', 'Đồ họa', 'Cao cấp'],
    accentHex: ['#1e293b', '#09090b'],
    categoryLabel: 'TRẠM LÀM VIỆC APPLE M4 MAX',
  },
  'sony-wh-1000xm6-headphones': {
    tags: ['Âm thanh', 'Không dây', 'Chống ồn', 'Bán chạy'],
    accentHex: ['#44403c', '#1c1917'],
    categoryLabel: 'TAI NGHE CHỐNG ỒN KHÔNG DÂY',
  },
  'keychron-q1-pro-keyboard': {
    tags: ['Phụ kiện', 'Bàn phím cơ', 'Không dây', 'Góc làm việc'],
    accentHex: ['#334155', '#0f172a'],
    categoryLabel: 'BÀN PHÍM CƠ CUSTOM',
  },
  'lg-ultragear-32-4k-oled-240hz': {
    tags: ['Màn hình', 'OLED', '240Hz', 'Gaming', 'Hiển thị 4K'],
    accentHex: ['#312e81', '#09090b'],
    categoryLabel: 'MÀN HÌNH 4K 240HZ OLED',
  },
  'logitech-g-pro-x-superlight-2-dex': {
    tags: ['Phụ kiện', 'Gaming', 'Không dây', 'Esports'],
    accentHex: ['#0c4a6e', '#09090b'],
    categoryLabel: 'CHUỘT ESPORTS SIÊU NHẸ',
  },
  'samsung-990-pro-4tb-nvme-ssd': {
    tags: ['Lưu trữ', 'SSD NVMe', '4TB', 'Lắp ráp PC'],
    accentHex: ['#27272a', '#09090b'],
    categoryLabel: 'Ổ CỨNG PCIE 4.0 NVME',
  },
  'amd-ryzen-9-9950x3d-processor': {
    tags: ['CPU', 'Gaming', '3D V-Cache', 'Lắp ráp PC', 'Cao cấp'],
    accentHex: ['#7c2d12', '#09090b'],
    categoryLabel: 'CPU ZEN 5 3D V-CACHE',
  },
  'asus-rog-crosshair-x870e-hero': {
    tags: ['Bo mạch chủ', 'Lắp ráp PC', 'Gaming', 'Wi-Fi 7'],
    accentHex: ['#4c0519', '#09090b'],
    categoryLabel: 'BO MẠCH CHỦ X870E HERO',
  },
  'corsair-dominator-titanium-64gb-ddr5': {
    tags: ['Bộ nhớ RAM', 'DDR5', '64GB', 'Lắp ráp PC'],
    accentHex: ['#1e293b', '#09090b'],
    categoryLabel: 'RAM DDR5-6600 TITANIUM',
  },
  'caldigit-ts4-thunderbolt-4-dock': {
    tags: ['Phụ kiện', 'Thunderbolt 4', 'Góc làm việc', 'Đồ họa'],
    accentHex: ['#3f3f46', '#18181b'],
    categoryLabel: 'HUB DOCK 18 CỔNG THUNDERBOLT',
  },
  'shure-sm7db-dynamic-microphone': {
    tags: ['Âm thanh', 'Microphone', 'Phòng thu', 'Sáng tạo'],
    accentHex: ['#262626', '#0a0a0a'],
    categoryLabel: 'MICRO THU ÂM CHUYÊN NGHIỆP',
  },
  'elgato-stream-deck-plus': {
    tags: ['Phụ kiện', 'Sáng tạo', 'Phòng thu', 'Góc làm việc'],
    accentHex: ['#172554', '#09090b'],
    categoryLabel: 'BÀN ĐIỀU KHIỂN STUDIO',
  },
  'herman-miller-embody-chair': {
    tags: ['Công thái học', 'Góc làm việc', 'Ghế văn phòng', 'Cao cấp'],
    accentHex: ['#134e4a', '#09090b'],
    categoryLabel: 'GHẾ CÔNG THÁI HỌC CAO CẤP',
  },
  'secretlab-magnus-pro-xl-desk': {
    tags: ['Góc làm việc', 'Bàn nâng hạ', 'Công thái học'],
    accentHex: ['#27272a', '#09090b'],
    categoryLabel: 'BÀN NÂNG HẠ KIM LOẠI',
  },
  'benq-screenbar-halo-monitor-light': {
    tags: ['Màn hình', 'Đèn chiếu sáng', 'Góc làm việc'],
    accentHex: ['#451a03', '#0c0a09'],
    categoryLabel: 'ĐÈN TREO MÀN HÌNH CHỐNG CHÓI',
  },
  'synology-ds923-plus-4-bay-nas': {
    tags: ['Lưu trữ', 'Ổ mạng NAS', 'Mạng dữ liệu', 'Doanh nghiệp'],
    accentHex: ['#1e293b', '#020617'],
    categoryLabel: 'Ổ LƯU TRỮ MẠNG CLOUD NAS',
  },
  'ubiquiti-unifi-dream-machine-pro-max': {
    tags: ['Mạng dữ liệu', 'Gateway 10G', 'Doanh nghiệp'],
    accentHex: ['#082f49', '#020617'],
    categoryLabel: 'GATEWAY MẠNG ĐÁM MÂY 10G',
  },
  'anker-prime-27650mah-250w-power-bank': {
    tags: ['Phụ kiện', 'Pin dự phòng', 'Sạc nhanh 250W', 'Di động'],
    accentHex: ['#3f3f46', '#09090b'],
    categoryLabel: 'PIN DỰ PHÒNG CÔNG SUẤT 250W',
  },
  'sennheiser-hd-800-s-headphones': {
    tags: ['Âm thanh', 'Audiophile', 'Tai nghe mở', 'Cao cấp'],
    accentHex: ['#292524', '#0c0a09'],
    categoryLabel: 'TAI NGHE THAM CHIẾU KIỂM ÂM',
  },
  'rme-adi-2-dac-fs-converter': {
    tags: ['Âm thanh', 'Audiophile', 'DAC giải mã', 'Phòng thu'],
    accentHex: ['#0f172a', '#09090b'],
    categoryLabel: 'BỘ GIẢI MÃ DAC THAM CHIẾU',
  },
  'valve-steam-deck-oled-1tb': {
    tags: ['Máy cầm tay', 'Màn hình OLED', 'Gaming', 'Bán chạy'],
    accentHex: ['#431407', '#09090b'],
    categoryLabel: 'MÁY CHƠI GAME CẦM TAY OLED',
  },
};

function escapeSvgText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PLACEHOLDER_PHOTO_CACHE = new Map<string, string[]>();

export function buildPlaceholderProductPhotos(
  title: string,
  categoryLabel = 'FLAGSHIP HARDWARE',
  colors: [string, string] = ['#1e293b', '#09090b'],
): string[] {
  const cacheKey = `${title}|${categoryLabel}|${colors[0]}|${colors[1]}`;
  const cached = PLACEHOLDER_PHOTO_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const shortTitle = escapeSvgText(
    title.length > 34 ? `${title.slice(0, 32)}...` : title,
  );
  const safeCat = escapeSvgText(categoryLabel);
  const angles = [
    { view: 'STUDIO FRONT PROFILE', accent: '#f43f5e' },
    { view: 'ISOMETRIC CHASSIS & COOLING', accent: '#10b981' },
    { view: 'PORTS & RETAIL EDITION BOX', accent: '#38bdf8' },
  ];

  const photos = angles.map((angle, idx) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" width="800" height="560">
      <defs>
        <linearGradient id="bg${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colors[0]}"/>
          <stop offset="100%" stop-color="${colors[1]}"/>
        </linearGradient>
        <radialGradient id="glow${idx}" cx="75%" cy="25%" r="55%">
          <stop offset="0%" stop-color="${angle.accent}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${angle.accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="560" rx="28" fill="url(#bg${idx})"/>
      <rect width="800" height="560" rx="28" fill="url(#glow${idx})"/>
      <g stroke="rgba(255,255,255,0.08)" stroke-width="1">
        <line x1="0" y1="140" x2="800" y2="140"/>
        <line x1="0" y1="420" x2="800" y2="420"/>
        <line x1="160" y1="0" x2="160" y2="560"/>
        <line x1="640" y1="0" x2="640" y2="560"/>
      </g>
      <rect x="210" y="135" width="380" height="250" rx="26" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
      <rect x="245" y="165" width="310" height="190" rx="16" fill="rgba(0,0,0,0.35)" stroke="${angle.accent}" stroke-width="1.5" stroke-opacity="0.7"/>
      <circle cx="400" cy="260" r="${52 + idx * 10}" fill="none" stroke="${angle.accent}" stroke-width="2.5" stroke-opacity="0.8"/>
      <circle cx="400" cy="260" r="20" fill="${angle.accent}" fill-opacity="0.45"/>
      <rect x="44" y="40" width="240" height="32" rx="16" fill="rgba(255,255,255,0.1)"/>
      <text x="62" y="61" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="1.5">${safeCat}</text>
      <rect x="530" y="40" width="226" height="32" rx="16" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.15)"/>
      <text x="550" y="61" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" font-weight="700" letter-spacing="1">${angle.view}</text>
      <text x="48" y="476" fill="#ffffff" font-family="system-ui, sans-serif" font-size="26" font-weight="800">${shortTitle}</text>
      <text x="48" y="508" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13" font-weight="600">AURA STUDIO VERIFIED PHOTOGRAPHY • SHOT 0${idx + 1} / 03</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });

  PLACEHOLDER_PHOTO_CACHE.set(cacheKey, photos);
  return photos;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private allProductsDbCache: {
    rows: Array<Prisma.ProductGetPayload<{ include: { inventory: true } }>>;
    expiresAt: number;
  } | null = null;
  private formattedCatalogCache = new Map<
    string,
    { data: PaginatedProductsResponse; expiresAt: number }
  >();
  private formattedSlugCache = new Map<
    string,
    { data: ProductResponseItem; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  private invalidateProductsCache(): void {
    this.allProductsDbCache = null;
    this.formattedCatalogCache.clear();
    this.formattedSlugCache.clear();
  }

  async findAll(
    query: QueryProductsDto,
    bypassCache = false,
  ): Promise<PaginatedProductsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const cacheKey = JSON.stringify({
      page,
      limit,
      status: query.status ?? '',
      search: query.search ?? '',
      minPrice: query.minPrice ?? '',
      maxPrice: query.maxPrice ?? '',
      inStockOnly: query.inStockOnly ?? '',
      includeArchived: query.includeArchived ?? '',
      tag: query.tag ?? '',
      sort: query.sort ?? '',
    });

    if (!bypassCache) {
      const cached = this.formattedCatalogCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    const hasSearch = Boolean(query.search && query.search.trim().length > 0);
    const hasPriceFilter =
      query.minPrice !== undefined || query.maxPrice !== undefined;

    let products: Array<Prisma.ProductGetPayload<{ include: { inventory: true } }>>;

    if (!bypassCache && !hasSearch && !hasPriceFilter) {
      const now = Date.now();
      let cachedRows =
        this.allProductsDbCache && this.allProductsDbCache.expiresAt > now
          ? this.allProductsDbCache.rows
          : null;

      if (!cachedRows) {
        cachedRows = await this.prisma.product.findMany({
          include: { inventory: true },
          orderBy: [{ status: 'desc' }, { created_at: 'desc' }],
        });
        this.allProductsDbCache = {
          rows: cachedRows,
          expiresAt: now + 2000,
        };
      }

      const excludeArchived =
        query.includeArchived !== 'true' &&
        query.status !== ProductStatus.ARCHIVED;

      products = query.status
        ? cachedRows.filter((p) => p.status === query.status)
        : excludeArchived
          ? cachedRows.filter((p) => p.status !== ProductStatus.ARCHIVED)
          : [...cachedRows];

      if (query.sort === 'price_asc') {
        products.sort((a, b) => Number(a.price) - Number(b.price));
      } else if (query.sort === 'price_desc') {
        products.sort((a, b) => Number(b.price) - Number(a.price));
      } else if (query.sort === 'newest') {
        products.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      } else if (query.sort === 'flash_first') {
        products.sort((a, b) => {
          if (a.status !== b.status) return b.status.localeCompare(a.status);
          return Number(a.price) - Number(b.price);
        });
      }
    } else {
      const where: Prisma.ProductWhereInput = {};

      if (query.status) {
        where.status = query.status;
      } else if (query.includeArchived !== 'true') {
        where.status = { not: ProductStatus.ARCHIVED };
      }

      if (query.search && query.search.trim().length > 0) {
        const term = query.search.trim();
        where.OR = [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { slug: { contains: term, mode: 'insensitive' } },
        ];
      }

      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        where.price = {};
        if (query.minPrice !== undefined) {
          where.price.gte = query.minPrice;
        }
        if (query.maxPrice !== undefined) {
          where.price.lte = query.maxPrice;
        }
      }

      let orderBy: Prisma.ProductOrderByWithRelationInput[] = [
        { status: 'desc' },
        { created_at: 'desc' },
      ];

      if (query.sort === 'price_asc') {
        orderBy = [{ price: 'asc' }];
      } else if (query.sort === 'price_desc') {
        orderBy = [{ price: 'desc' }];
      } else if (query.sort === 'newest') {
        orderBy = [{ created_at: 'desc' }];
      } else if (query.sort === 'flash_first') {
        orderBy = [{ status: 'desc' }, { price: 'asc' }];
      }

      products = await this.prisma.product.findMany({
        where,
        include: { inventory: true },
        orderBy,
      });
    }

    const formatted: ProductResponseItem[] = bypassCache
      ? products.map((p) => this.formatProductDbOnly(p))
      : await this.attachLiveStockAndMetaBatch(products);

    let filtered = formatted;

    if (
      query.includeArchived !== 'true' &&
      query.status !== ProductStatus.ARCHIVED
    ) {
      filtered = filtered.filter(
        (item) => item.status !== ProductStatus.ARCHIVED,
      );
    }

    if (query.inStockOnly === 'true') {
      filtered = filtered.filter((item) => item.inventory.available_stock > 0);
    }

    const total = filtered.length;
    const skip = (page - 1) * limit;
    const paged = filtered.slice(skip, skip + limit);

    const response: PaginatedProductsResponse = {
      items: paged,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };

    if (!bypassCache) {
      this.formattedCatalogCache.set(cacheKey, {
        data: response,
        expiresAt: Date.now() + 2000,
      });
    }

    return response;
  }

  async findBySlug(
    slug: string,
    bypassCache = false,
  ): Promise<ProductResponseItem> {
    if (!bypassCache) {
      const cached = this.formattedSlugCache.get(slug);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.data.status === ProductStatus.ARCHIVED) {
          throw new NotFoundException(`Product with slug "${slug}" not found`);
        }
        return cached.data;
      }

      if (this.allProductsDbCache && this.allProductsDbCache.expiresAt > Date.now()) {
        const cachedProduct = this.allProductsDbCache.rows.find(
          (p) => p.slug === slug,
        );
        if (cachedProduct) {
          if (cachedProduct.status === ProductStatus.ARCHIVED) {
            throw new NotFoundException(`Product with slug "${slug}" not found`);
          }
          const formatted = await this.attachLiveStockAndMeta(cachedProduct);
          this.formattedSlugCache.set(slug, {
            data: formatted,
            expiresAt: Date.now() + 2000,
          });
          return formatted;
        }
      }
    }

    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: { inventory: true },
    });

    if (!product || product.status === ProductStatus.ARCHIVED) {
      throw new NotFoundException(`Product with slug "${slug}" not found`);
    }

    const result = bypassCache
      ? this.formatProductDbOnly(product)
      : await this.attachLiveStockAndMeta(product);

    if (!bypassCache) {
      this.formattedSlugCache.set(slug, {
        data: result,
        expiresAt: Date.now() + 2000,
      });
    }

    return result;
  }

  async findById(id: string): Promise<ProductResponseItem> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { inventory: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    return this.attachLiveStockAndMeta(product);
  }

  async createProduct(dto: CreateProductDto): Promise<ProductResponseItem> {
    const baseSlug = (dto.slug?.trim() || dto.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug || `product-${Date.now()}`;
    const existingSlug = await this.prisma.product.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const status =
      dto.totalStock === 0 && !dto.status
        ? ProductStatus.OUT_OF_STOCK
        : dto.status ?? ProductStatus.ACTIVE;

    const created = await this.prisma.product.create({
      data: {
        title: dto.title.trim(),
        slug,
        description: dto.description.trim(),
        price: dto.price,
        status,
        inventory: {
          create: {
            total_stock: dto.totalStock,
            reserved_stock: 0,
            version: 1,
          },
        },
      },
      include: { inventory: true },
    });

    const originalPrice =
      dto.originalPrice && dto.originalPrice >= dto.price
        ? dto.originalPrice
        : Number((dto.price * 1.15).toFixed(2));

    const images =
      dto.images && dto.images.filter((u) => u.trim().length > 0).length > 0
        ? dto.images.map((u) => u.trim()).filter(Boolean)
        : buildPlaceholderProductPhotos(created.title, 'AURA STUDIO HARDWARE');

    const tags: string[] = [];

    await this.syncProductToRedis(created, {
      originalPrice,
      images,
      tags,
    });
    this.invalidateProductsCache();

    this.logger.log(
      JSON.stringify({
        event: 'PRODUCT_CREATED',
        productId: created.id,
        slug: created.slug,
        status: created.status,
        totalStock: dto.totalStock,
      }),
    );

    return this.attachLiveStockAndMeta(created);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductResponseItem> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { inventory: true },
    });

    if (!existing) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    const currentItem = await this.attachLiveStockAndMeta(existing);

    let nextSlug = existing.slug;
    if (dto.slug && dto.slug.trim() !== existing.slug) {
      nextSlug = dto.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const conflict = await this.prisma.product.findUnique({
        where: { slug: nextSlug },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Slug "${nextSlug}" is already in use`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.totalStock !== undefined) {
        await tx.inventory.upsert({
          where: { product_id: id },
          update: {
            total_stock: dto.totalStock,
            version: { increment: 1 },
          },
          create: {
            product_id: id,
            total_stock: dto.totalStock,
            reserved_stock: 0,
            version: 1,
          },
        });
      }

      return tx.product.update({
        where: { id },
        data: {
          title: dto.title !== undefined ? dto.title.trim() : undefined,
          slug: nextSlug,
          description:
            dto.description !== undefined ? dto.description.trim() : undefined,
          price: dto.price !== undefined ? dto.price : undefined,
          status: dto.status !== undefined ? dto.status : undefined,
        },
        include: { inventory: true },
      });
    });

    const nextPrice = Number(updated.price);
    const nextOriginalPrice =
      dto.originalPrice !== undefined
        ? Math.max(nextPrice, dto.originalPrice)
        : Math.max(nextPrice, currentItem.originalPrice);

    const nextImages =
      dto.images !== undefined
        ? dto.images.map((u) => u.trim()).filter(Boolean).length > 0
          ? dto.images.map((u) => u.trim()).filter(Boolean)
          : buildPlaceholderProductPhotos(updated.title)
        : currentItem.images;

    const nextTags: string[] = [];

    await this.syncProductToRedis(updated, {
      originalPrice: nextOriginalPrice,
      images: nextImages,
      tags: nextTags,
    });
    this.invalidateProductsCache();

    this.logger.log(
      JSON.stringify({
        event: 'PRODUCT_UPDATED',
        productId: updated.id,
        slug: updated.slug,
        status: updated.status,
        totalStock: updated.inventory?.total_stock,
      }),
    );

    return this.attachLiveStockAndMeta(updated);
  }

  async deleteProduct(id: string): Promise<{ deletedId: string; title: string }> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      const relatedItems = await tx.orderItem.findMany({
        where: { product_id: id },
        select: { order_id: true },
      });
      const orderIds = [...new Set(relatedItems.map((i) => i.order_id))];

      if (orderIds.length > 0) {
        await tx.payment.deleteMany({
          where: { order_id: { in: orderIds } },
        });
        await tx.orderItem.deleteMany({
          where: { order_id: { in: orderIds } },
        });
        await tx.order.deleteMany({
          where: { id: { in: orderIds } },
        });
      }

      await tx.inventory.deleteMany({ where: { product_id: id } });
      await tx.product.delete({ where: { id } });
    });

    await this.redisService
      .getClient()
      .del(`inventory:stock:${id}`, `inventory:meta:${id}`);
    this.invalidateProductsCache();

    this.logger.log(
      JSON.stringify({
        event: 'PRODUCT_DELETED',
        productId: id,
        title: existing.title,
      }),
    );

    return {
      deletedId: id,
      title: existing.title,
    };
  }

  /**
   * Fast price, normal/originalPrice & existence lookup for checkout critical path.
   */
  async getProductPriceAndStatusFast(productId: string): Promise<{
    id: string;
    price: number;
    originalPrice?: number;
    title: string;
    status: string;
  }> {
    const metaKey = `inventory:meta:${productId}`;
    const cached = await this.redisService.getClient().hgetall(metaKey);

    if (cached && cached.price && cached.title) {
      const sellingPrice = Number(cached.price);
      const slugDefaults = cached.slug
        ? DEFAULT_EXTRAS_BY_SLUG[cached.slug]
        : undefined;
      const origPrice = cached.originalPrice
        ? Number(cached.originalPrice)
        : slugDefaults?.originalPrice ?? sellingPrice;

      return {
        id: productId,
        price: sellingPrice,
        originalPrice: Math.max(sellingPrice, origPrice),
        title: cached.title,
        status: cached.status || 'ACTIVE',
      };
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { inventory: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const full = await this.attachLiveStockAndMeta(product);

    return {
      id: product.id,
      price: full.price,
      originalPrice: full.originalPrice,
      title: product.title,
      status: product.status,
    };
  }

  private async syncProductToRedis(
    product: Prisma.ProductGetPayload<{ include: { inventory: true } }>,
    extras?: {
      originalPrice?: number;
      images?: string[];
      tags?: string[];
    },
  ): Promise<void> {
    const totalStock = product.inventory?.total_stock ?? 0;
    const reservedStock = product.inventory?.reserved_stock ?? 0;
    const availableStock = Math.max(0, totalStock - reservedStock);

    const metaFields: Record<string, string> = {
      productId: product.id,
      slug: product.slug,
      title: product.title,
      price: product.price.toFixed(2),
      status: product.status,
      totalStock: totalStock.toString(),
      reservedStock: reservedStock.toString(),
    };

    if (extras?.originalPrice !== undefined) {
      metaFields.originalPrice = extras.originalPrice.toFixed(2);
    }
    if (extras?.images !== undefined) {
      metaFields.images = JSON.stringify(extras.images);
    }
    if (extras?.tags !== undefined) {
      metaFields.tags = JSON.stringify(extras.tags);
    }

    await Promise.all([
      this.redisService.setStock(product.id, availableStock),
      this.redisService.getClient().hset(`inventory:meta:${product.id}`, metaFields),
    ]);
  }

  private buildProductResponseItem(
    product: Prisma.ProductGetPayload<{ include: { inventory: true } }>,
    redisStock: number | null,
    cachedMeta: Record<string, string> | null,
  ): ProductResponseItem {
    const dbTotal = product.inventory?.total_stock ?? 0;
    const dbReserved = product.inventory?.reserved_stock ?? 0;
    const dbAvailable = Math.max(0, dbTotal - dbReserved);

    const sellingPrice = Number(product.price);
    const defaults = DEFAULT_EXTRAS_BY_SLUG[product.slug] ?? {
      originalPrice: Number((sellingPrice * 1.15).toFixed(2)),
      tags:
        product.status === ProductStatus.FLASH_SALE
          ? ['Flash Deal', 'Flagship', 'Hardware']
          : ['Hardware', 'Flagship'],
      accentHex: ['#1e293b', '#09090b'] as [string, string],
      categoryLabel: 'AURA FLAGSHIP HARDWARE',
    };

    const originalPrice = cachedMeta?.originalPrice
      ? Math.max(sellingPrice, Number(cachedMeta.originalPrice))
      : Math.max(sellingPrice, defaults.originalPrice ?? sellingPrice);

    let images: string[] = [];
    if (cachedMeta?.images) {
      try {
        const parsed = JSON.parse(cachedMeta.images) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          images = parsed;
        }
      } catch {
        // Fallback below
      }
    }
    if (images.length === 0) {
      images = buildPlaceholderProductPhotos(
        product.title,
        defaults.categoryLabel,
        defaults.accentHex,
      );
    }

    const tags: string[] = [];

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      price: sellingPrice,
      originalPrice,
      images,
      tags,
      status: product.status,
      created_at: product.created_at.toISOString(),
      inventory: {
        product_id: product.id,
        total_stock: dbTotal,
        reserved_stock: dbReserved,
        available_stock:
          redisStock !== null ? Math.max(0, redisStock) : dbAvailable,
        version: product.inventory?.version ?? 1,
      },
    };
  }

  async saveUploadedProductImage(
    fileName: string,
    dataUrl: string,
  ): Promise<{ url: string; fileName: string; savedPaths: string[] }> {
    const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/.exec(
      dataUrl.trim(),
    );
    if (!match) {
      throw new BadRequestException('Định dạng ảnh tải lên không hợp lệ');
    }

    const mimeSubtype = match[1].toLowerCase();
    const base64Data = match[2];

    let ext = 'png';
    if (mimeSubtype.includes('jpeg') || mimeSubtype === 'jpg') ext = 'jpg';
    else if (mimeSubtype.includes('webp')) ext = 'webp';
    else if (mimeSubtype.includes('gif')) ext = 'gif';
    else if (mimeSubtype.includes('svg')) ext = 'svg';
    else if (mimeSubtype.includes('png')) ext = 'png';
    else {
      const fileExt = path.extname(fileName).replace('.', '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(fileExt)) {
        ext = fileExt === 'jpeg' ? 'jpg' : fileExt;
      }
    }

    const baseName =
      fileName
        .replace(/\.[^/.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'product';
    const finalFileName = `${baseName}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');

    const repoRoot = process.cwd().endsWith(path.join('apps', 'api'))
      ? path.resolve(process.cwd(), '../..')
      : process.cwd();
    const rootAssetsDir = path.join(repoRoot, 'assets', 'products');
    const webPublicAssetsDir = path.join(
      repoRoot,
      'apps',
      'web',
      'public',
      'assets',
      'products',
    );
    fs.mkdirSync(rootAssetsDir, { recursive: true });
    fs.mkdirSync(webPublicAssetsDir, { recursive: true });

    const rootFilePath = path.join(rootAssetsDir, finalFileName);
    const webPublicFilePath = path.join(webPublicAssetsDir, finalFileName);
    fs.writeFileSync(rootFilePath, buffer);
    fs.writeFileSync(webPublicFilePath, buffer);

    this.logger.log(
      JSON.stringify({
        event: 'PRODUCT_IMAGE_UPLOADED',
        fileName: finalFileName,
        bytes: buffer.length,
        rootFilePath,
        webPublicFilePath,
      }),
    );

    return {
      url: `/assets/products/${finalFileName}`,
      fileName: finalFileName,
      savedPaths: [rootFilePath, webPublicFilePath],
    };
  }

  private formatProductDbOnly(
    product: Prisma.ProductGetPayload<{ include: { inventory: true } }>,
  ): ProductResponseItem {
    return this.buildProductResponseItem(product, null, null);
  }

  private async attachLiveStockAndMetaBatch(
    products: Array<Prisma.ProductGetPayload<{ include: { inventory: true } }>>,
  ): Promise<ProductResponseItem[]> {
    if (products.length === 0) return [];

    const client = this.redisService.getClient();
    const pipeline = client.pipeline();
    for (const product of products) {
      pipeline.get(`inventory:stock:${product.id}`);
      pipeline.hgetall(`inventory:meta:${product.id}`);
    }
    const results = await pipeline.exec();

    return products.map((product, index) => {
      const stockTuple = results?.[index * 2];
      const metaTuple = results?.[index * 2 + 1];
      const rawStock =
        stockTuple && !stockTuple[0] && stockTuple[1] !== null
          ? Number(stockTuple[1])
          : null;
      const rawMeta =
        metaTuple &&
        !metaTuple[0] &&
        metaTuple[1] &&
        typeof metaTuple[1] === 'object'
          ? (metaTuple[1] as Record<string, string>)
          : null;

      return this.buildProductResponseItem(
        product,
        rawStock !== null && !Number.isNaN(rawStock) ? rawStock : null,
        rawMeta,
      );
    });
  }

  private async attachLiveStockAndMeta(
    product: Prisma.ProductGetPayload<{ include: { inventory: true } }>,
  ): Promise<ProductResponseItem> {
    const metaKey = `inventory:meta:${product.id}`;

    const [redisStock, cachedMeta] = await Promise.all([
      this.redisService.getStock(product.id),
      this.redisService.getClient().hgetall(metaKey),
    ]);

    return this.buildProductResponseItem(product, redisStock, cachedMeta);
  }
}
