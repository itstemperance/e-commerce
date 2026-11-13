import { PrismaClient, OrderStatus } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config({ path: './apps/api/.env' });
dotenv.config({ path: './.env' });

const TARGET_PRODUCT_ID =
  process.argv[2] || '11111111-1111-4111-8111-111111111101';
const EXPECTED_TOTAL_POOL = Number(process.argv[3] || 50);

async function verifyStockConservation(): Promise<void> {
  const prisma = new PrismaClient();
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
  });

  try {
    const product = await prisma.product.findUnique({
      where: { id: TARGET_PRODUCT_ID },
      include: { inventory: true },
    });

    if (!product || !product.inventory) {
      throw new Error(`Product or inventory not found for ID ${TARGET_PRODUCT_ID}`);
    }

    const soldAgg = await prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        product_id: TARGET_PRODUCT_ID,
        order: {
          status: { in: [OrderStatus.PENDING, OrderStatus.DEPOSIT_PAID, OrderStatus.PAID] },
        },
      },
    });

    const paidAgg = await prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        product_id: TARGET_PRODUCT_ID,
        order: { status: { in: [OrderStatus.DEPOSIT_PAID, OrderStatus.PAID] } },
      },
    });

    const soldItems = soldAgg._sum.quantity ?? 0;
    const paidItems = paidAgg._sum.quantity ?? 0;
    const dbTotalStock = product.inventory.total_stock;
    const dbReservedStock = product.inventory.reserved_stock;
    const remainingStock = dbTotalStock - dbReservedStock;
    const computedPool = soldItems + remainingStock;
    const redisStockRaw = await redis.get(`inventory:stock:${TARGET_PRODUCT_ID}`);
    const redisAvailableStock =
      redisStockRaw !== null ? Number(redisStockRaw) : remainingStock;

    console.log('==============================================================');
    console.log(' FLASH SALE ZERO-OVERSELLING VALIDATION REPORT');
    console.log('==============================================================');
    console.log(` Product ID             : ${product.id}`);
    console.log(` Product Title          : ${product.title}`);
    console.log(` Expected Pool          : ${EXPECTED_TOTAL_POOL}`);
    console.log(` Sold Items (DB Orders) : ${soldItems} (Paid: ${paidItems}, Reserved: ${dbReservedStock})`);
    console.log(` Remaining Stock (DB)   : ${remainingStock}`);
    console.log(` Remaining Stock (Redis): ${redisAvailableStock}`);
    console.log(` Equation Check         : ${soldItems} (sold_items) + ${remainingStock} (remaining_stock) == ${computedPool}`);
    console.log('--------------------------------------------------------------');

    const equationMatches = computedPool === EXPECTED_TOTAL_POOL;
    const noNegativeStock = remainingStock >= 0 && redisAvailableStock >= 0;
    const redisMatchesDb = redisAvailableStock === remainingStock;

    if (equationMatches && noNegativeStock && redisMatchesDb) {
      console.log(
        ` ✅ VALIDATION PASSED: sold_items (${soldItems}) + remaining_stock (${remainingStock}) == ${EXPECTED_TOTAL_POOL} EXACTLY!`,
      );
      console.log('==============================================================');
      process.exitCode = 0;
    } else {
      console.error(
        ` ❌ VALIDATION FAILED: Invariant violation detected!`,
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

void verifyStockConservation();
