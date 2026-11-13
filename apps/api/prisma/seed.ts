import { PrismaClient, ProductStatus, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface SeedProductInput {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  status: ProductStatus;
  totalStock: number;
}

const FLASH_SALE_PRODUCTS: SeedProductInput[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    title: 'Card màn hình NVIDIA GeForce RTX 5090 Founders Edition (Flash Sale)',
    slug: 'nvidia-rtx-5090-founders-edition-flash',
    description:
      'Siêu phẩm Flash Sale giới hạn! GPU kiến trúc Blackwell thế hệ mới với bộ nhớ 32GB GDDR7 đỉnh cao đồ họa và xử lý AI.',
    price: 50990000,
    status: ProductStatus.FLASH_SALE,
    totalStock: 50,
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    title: 'Apple MacBook Pro 16" M4 Max 128GB (Mở bán sớm Flash Sale)',
    slug: 'macbook-pro-16-m4-max-flash',
    description:
      'Suất mua Flash Sale độc quyền! CPU 16 nhân, GPU 40 nhân, bộ nhớ hợp nhất 128GB, ổ cứng SSD 2TB màu Space Black.',
    price: 63990000,
    status: ProductStatus.FLASH_SALE,
    totalStock: 50,
  },
];

const NORMAL_PRODUCTS: SeedProductInput[] = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    title: 'Tai nghe không dây chống ồn Sony WH-1000XM6',
    slug: 'sony-wh-1000xm6-headphones',
    description:
      'Công nghệ chống ồn chủ động hàng đầu thế giới với bộ xử lý kép và thời lượng pin vượt trội lên đến 40 giờ.',
    price: 10190000,
    status: ProductStatus.ACTIVE,
    totalStock: 250,
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    title: 'Bàn phím cơ không dây Custom Keychron Q1 Pro',
    slug: 'keychron-q1-pro-keyboard',
    description:
      'Khung nhôm CNC nguyên khối hỗ trợ phần mềm QMK/VIA và switch hotswap mang lại cảm giác gõ vượt trội.',
    price: 5580000,
    status: ProductStatus.ACTIVE,
    totalStock: 180,
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    title: 'Màn hình Gaming LG UltraGear 32" 4K OLED 240Hz',
    slug: 'lg-ultragear-32-4k-oled-240hz',
    description:
      'Tấm nền WOLED chế độ kép 4K 240Hz / FHD 480Hz với tốc độ phản hồi 0.03ms tương thích chuẩn G-SYNC.',
    price: 30590000,
    status: ProductStatus.ACTIVE,
    totalStock: 120,
  },
  {
    id: '22222222-2222-4222-8222-222222222204',
    title: 'Chuột gaming không dây Logitech G PRO X Superlight 2 DEX',
    slug: 'logitech-g-pro-x-superlight-2-dex',
    description:
      'Chuột thể thao điện tử công thái học siêu nhẹ 60g với cảm biến HERO 2 và tần số quét 8000Hz LIGHTSPEED.',
    price: 4080000,
    status: ProductStatus.ACTIVE,
    totalStock: 300,
  },
  {
    id: '22222222-2222-4222-8222-222222222205',
    title: 'Ổ cứng SSD Samsung 990 PRO 4TB PCIe 4.0 NVMe M.2',
    slug: 'samsung-990-pro-4tb-nvme-ssd',
    description:
      'Tốc độ đọc tuần tự lên đến 7.450 MB/s cùng bộ điều khiển bọc niken kiểm soát nhiệt độ vượt trội.',
    price: 8160000,
    status: ProductStatus.ACTIVE,
    totalStock: 400,
  },
  {
    id: '22222222-2222-4222-8222-222222222206',
    title: 'Bộ vi xử lý AMD Ryzen 9 9950X3D 16 nhân 32 luồng',
    slug: 'amd-ryzen-9-9950x3d-processor',
    description:
      'Kiến trúc Zen 5 với công nghệ 3D V-Cache thế hệ 2 mang lại hiệu năng gaming và sáng tạo nội dung tối thượng.',
    price: 17820000,
    status: ProductStatus.ACTIVE,
    totalStock: 150,
  },
  {
    id: '22222222-2222-4222-8222-222222222207',
    title: 'Bo mạch chủ ASUS ROG Crosshair X870E Hero ATX',
    slug: 'asus-rog-crosshair-x870e-hero',
    description:
      'Bo mạch chủ AM5 cao cấp với dàn cấp nguồn 18+2+2 pha, hỗ trợ PCIe 5.0, bộ nhớ DDR5 và cổng USB4 kép.',
    price: 16590000,
    status: ProductStatus.ACTIVE,
    totalStock: 95,
  },
  {
    id: '22222222-2222-4222-8222-222222222208',
    title: 'Bộ nhớ RAM Corsair Dominator Titanium 64GB (2x32GB) DDR5-6600',
    slug: 'corsair-dominator-titanium-64gb-ddr5',
    description:
      'Khung nhôm đúc tinh xảo với tản nhiệt DHX độc quyền và hỗ trợ cấu hình ép xung Intel XMP / AMD EXPO.',
    price: 7390000,
    status: ProductStatus.ACTIVE,
    totalStock: 210,
  },
  {
    id: '22222222-2222-4222-8222-222222222209',
    title: 'Dock cắm mở rộng CalDigit TS4 Thunderbolt 4 18 cổng',
    slug: 'caldigit-ts4-thunderbolt-4-dock',
    description:
      'Cấp nguồn máy chủ 98W, mạng Ethernet 2.5GbE, khe đọc thẻ SD 4.0 và 3 cổng Thunderbolt 4 downstream.',
    price: 9690000,
    status: ProductStatus.ACTIVE,
    totalStock: 140,
  },
  {
    id: '22222222-2222-4222-8222-222222222210',
    title: 'Microphone thu âm Shure SM7dB tích hợp preamp chủ động',
    slug: 'shure-sm7db-dynamic-microphone',
    description:
      'Micro thu âm phát thanh huyền thoại tích hợp sẵn preamp Shure khuếch đại chủ động (+18dB/+28dB).',
    price: 12720000,
    status: ProductStatus.ACTIVE,
    totalStock: 160,
  },
  {
    id: '22222222-2222-4222-8222-222222222211',
    title: 'Bàn điều khiển Elgato Stream Deck + Studio Controller',
    slug: 'elgato-stream-deck-plus',
    description:
      '8 phím bấm màn hình LCD tùy biến, thanh cảm ứng đa năng và 4 núm xoay vô cực điều khiển studio tiện lợi.',
    price: 5090000,
    status: ProductStatus.ACTIVE,
    totalStock: 220,
  },
  {
    id: '22222222-2222-4222-8222-222222222212',
    title: 'Ghế công thái học cao cấp Herman Miller Embody',
    slug: 'herman-miller-embody-chair',
    description:
      'Cấu trúc ma trận pixel đạt chuẩn khoa học với khả năng căn chỉnh Backfit và chất liệu vải Sync siêu thoáng.',
    price: 43200000,
    status: ProductStatus.ACTIVE,
    totalStock: 65,
  },
  {
    id: '22222222-2222-4222-8222-222222222213',
    title: 'Bàn nâng hạ kim loại Secretlab MAGNUS Pro XL',
    slug: 'secretlab-magnus-pro-xl-desk',
    description:
      'Cột điện tích hợp trong chân bàn, máng luồn cáp toàn bộ chiều dài và hệ sinh thái phụ kiện từ tính cao cấp.',
    price: 24190000,
    status: ProductStatus.ACTIVE,
    totalStock: 85,
  },
  {
    id: '22222222-2222-4222-8222-222222222214',
    title: 'Đèn treo màn hình chống chói BenQ ScreenBar Halo LED',
    slug: 'benq-screenbar-halo-monitor-light',
    description:
      'Thiết kế quang học bất đối xứng với núm xoay điều khiển không dây và đèn hắt nền chống mỏi mắt thông minh.',
    price: 4560000,
    status: ProductStatus.ACTIVE,
    totalStock: 260,
  },
  {
    id: '22222222-2222-4222-8222-222222222215',
    title: 'Thiết bị lưu trữ mạng NAS Synology DiskStation DS923+ 4 khay',
    slug: 'synology-ds923-plus-4-bay-nas',
    description:
      'Bộ vi xử lý AMD Ryzen lõi kép, 2 khe cắm bộ đệm M.2 NVMe và khả năng nâng cấp cổng kết nối mạng 10GbE.',
    price: 15290000,
    status: ProductStatus.ACTIVE,
    totalStock: 110,
  },
  {
    id: '22222222-2222-4222-8222-222222222216',
    title: 'Thiết bị Gateway đám mây Ubiquiti UniFi Dream Machine Pro Max',
    slug: 'ubiquiti-unifi-dream-machine-pro-max',
    description:
      'Gateway đám mây doanh nghiệp tốc độ 10G với khả năng định tuyến IPS 5 Gbps và 2 khay ổ đĩa NVR.',
    price: 15290000,
    status: ProductStatus.ACTIVE,
    totalStock: 90,
  },
  {
    id: '22222222-2222-4222-8222-222222222217',
    title: 'Pin sạc dự phòng Anker Prime 27.650mAh (Công suất 250W)',
    slug: 'anker-prime-27650mah-250w-power-bank',
    description:
      'Sạc nhanh di động đồng thời nhiều thiết bị với màn hình kỹ thuật số thông minh và kết nối ứng dụng.',
    price: 4590000,
    status: ProductStatus.ACTIVE,
    totalStock: 340,
  },
  {
    id: '22222222-2222-4222-8222-222222222218',
    title: 'Tai nghe kiểm âm tham chiếu Sennheiser HD 800 S',
    slug: 'sennheiser-hd-800-s-headphones',
    description:
      'Tai nghe dynamic thiết kế mở cao cấp chế tác thủ công tại Đức với củ loa vòng 56mm độc quyền.',
    price: 40790000,
    status: ProductStatus.ACTIVE,
    totalStock: 75,
  },
  {
    id: '22222222-2222-4222-8222-222222222219',
    title: 'Bộ giải mã D/A cao cấp RME ADI-2 DAC FS Ultra-Fidelity',
    slug: 'rme-adi-2-dac-fs-converter',
    description:
      'Bộ giải mã DAC chuẩn phòng thu 768kHz/32-bit và amply tai nghe Extreme Power với công nghệ SteadyClock FS.',
    price: 33120000,
    status: ProductStatus.ACTIVE,
    totalStock: 60,
  },
  {
    id: '22222222-2222-4222-8222-222222222220',
    title: 'Máy chơi game cầm tay Valve Steam Deck OLED 1TB Limited Edition',
    slug: 'valve-steam-deck-oled-1tb',
    description:
      'Màn hình OLED HDR 7.4 inch kính khắc chống chói, chuẩn mạng Wi-Fi 6E và pin dung lượng 50Wh.',
    price: 16550000,
    status: ProductStatus.ACTIVE,
    totalStock: 130,
  },
];

async function syncRedisInventory(allProducts: SeedProductInput[]): Promise<void> {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  try {
    await redis.connect();
    const pipeline = redis.pipeline();

    const defaultCheckoutConfig = {
      bankName: 'Vietcombank (VCB) — Chi nhánh TP. Hồ Chí Minh',
      accountNumber: '0071008899668',
      accountHolder: 'CÔNG TY TNHH CÔNG NGHỆ AURA',
      bankBranch: 'Chi nhánh chính TP. Hồ Chí Minh',
      qrTemplateUrl: '',
      checkoutGuidance:
        '1. Lựa chọn giữa Cọc trước 10% (tối thiểu 200.000 ₫, số còn lại thanh toán khi nhận hàng COD) hoặc Thanh toán đủ 100% để nhận Ưu đãi Miễn phí giao hàng hỏa tốc.\n2. Quét mã QR Ngân hàng bằng ứng dụng mobile banking hoặc chuyển khoản thủ công theo thông tin số tài khoản bên dưới.\n3. Nhập Mã đơn hàng vào nội dung chuyển khoản.\n4. Bấm "XÁC NHẬN" để hoàn tất đơn hàng và giữ chỗ sản phẩm trong kho.',
      minDepositVnd: 200000,
      usdToVndRate: 1,
      partialDepositPercent: 10,
      codShippingFee: 30000,
    };
    pipeline.set('settings:checkout_payment_config', JSON.stringify(defaultCheckoutConfig));

    for (const prod of allProducts) {
      const stockKey = `inventory:stock:${prod.id}`;
      const metaKey = `inventory:meta:${prod.id}`;
      pipeline.set(stockKey, prod.totalStock.toString());
      pipeline.hset(metaKey, {
        productId: prod.id,
        slug: prod.slug,
        title: prod.title,
        price: prod.price.toString(),
        status: prod.status,
        totalStock: prod.totalStock.toString(),
        reservedStock: '0',
      });
    }

    await pipeline.exec();
    console.log(`[Seed] Synchronized ${allProducts.length} product stock counters to Redis (${redisHost}:${redisPort}).`);
  } catch (err) {
    console.warn(`[Seed] Warning: Could not sync to Redis (${(err as Error).message}). Continuing DB seed.`);
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  console.log('==========================================================');
  console.log(' Starting High-Concurrency E-Commerce Database Seeding... ');
  console.log('==========================================================');

  // Clean existing records in reverse foreign-key order
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // 1. Seed Users (1 Admin, 3 Customers)
  const defaultPasswordHash = await argon2.hash('Password123!');

  const usersData = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@flashsale.io',
      password_hash: defaultPasswordHash,
      role: Role.ADMIN,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      email: 'alice@customer.io',
      password_hash: defaultPasswordHash,
      role: Role.CUSTOMER,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      email: 'bob@customer.io',
      password_hash: defaultPasswordHash,
      role: Role.CUSTOMER,
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      email: 'charlie@customer.io',
      password_hash: defaultPasswordHash,
      role: Role.CUSTOMER,
    },
  ];

  for (const user of usersData) {
    await prisma.user.create({ data: user });
  }
  console.log(`[Seed] Created ${usersData.length} users (1 ADMIN, 3 CUSTOMER). Default password: Password123!`);

  // 2. Seed Products & Inventory (2 Flash Sale + 20 Normal = 22 Products)
  const allProducts = [...FLASH_SALE_PRODUCTS, ...NORMAL_PRODUCTS];

  for (const item of allProducts) {
    await prisma.product.create({
      data: {
        id: item.id,
        title: item.title,
        slug: item.slug,
        description: item.description,
        price: item.price,
        status: item.status,
        inventory: {
          create: {
            total_stock: item.totalStock,
            reserved_stock: 0,
            version: 1,
          },
        },
      },
    });
  }

  console.log(
    `[Seed] Created ${allProducts.length} products (${FLASH_SALE_PRODUCTS.length} FLASH_SALE with 50 stock each, ${NORMAL_PRODUCTS.length} ACTIVE products).`,
  );

  // 3. Synchronize initial real-time stock cache in Redis
  await syncRedisInventory(allProducts);

  console.log('==========================================================');
  console.log(' Database & Redis Seeding Completed Successfully!         ');
  console.log('==========================================================');
}

main()
  .catch((error) => {
    console.error('[Seed] Fatal error during seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
