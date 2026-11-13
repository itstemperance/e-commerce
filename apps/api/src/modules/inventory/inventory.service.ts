import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DistributedLockHandle, RedisService } from '../../common/redis/redis.service';

export interface InventoryRowLockResult {
  id: string;
  product_id: string;
  total_stock: number;
  reserved_stock: number;
  version: number;
}

export interface InventoryAuditReport {
  productId: string;
  title: string;
  initialTotalStock: number;
  dbTotalStock: number;
  dbReservedStock: number;
  remainingStock: number;
  soldItems: number;
  redisAvailableStock: number;
  invariantHolds: boolean;
  formula: string;
}

@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.warmupAllProductStock();
  }

  /**
   * Synchronize all product stock levels from PostgreSQL into Redis on startup.
   */
  async warmupAllProductStock(): Promise<void> {
    const inventories = await this.prisma.inventory.findMany({
      include: { product: true },
    });

    const pipeline = this.redisService.getClient().pipeline();
    for (const inv of inventories) {
      const available = Math.max(0, inv.total_stock - inv.reserved_stock);
      pipeline.set(`inventory:stock:${inv.product_id}`, available.toString());
      pipeline.hset(`inventory:meta:${inv.product_id}`, {
        productId: inv.product_id,
        slug: inv.product.slug,
        title: inv.product.title,
        price: inv.product.price.toFixed(2),
        status: inv.product.status,
        totalStock: inv.total_stock.toString(),
        reservedStock: inv.reserved_stock.toString(),
      });
    }
    await pipeline.exec();
    this.logger.log(
      `Warmed up Redis real-time stock cache for ${inventories.length} products`,
    );
  }

  /**
   * Step 1 of Flash Sale Engine:
   * Pre-check & atomically decrement real-time stock in Redis before touching Postgres.
   */
  async preDecrementRedisStock(productId: string, quantity: number): Promise<number> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    let result = await this.redisService.atomicReserveStock(productId, quantity);

    // Handle cache miss by hydrating from DB once under a short init lock
    if (result === -1) {
      const inv = await this.prisma.inventory.findUnique({
        where: { product_id: productId },
      });
      if (!inv) {
        throw new NotFoundException(`Product inventory not found for ${productId}`);
      }
      const available = Math.max(0, inv.total_stock - inv.reserved_stock);
      await this.redisService.setStock(productId, available);
      result = await this.redisService.atomicReserveStock(productId, quantity);
    }

    if (result === -2) {
      this.logger.debug(
        JSON.stringify({
          event: 'FLASH_SALE_FAST_REJECT_OUT_OF_STOCK',
          productId,
          requestedQuantity: quantity,
        }),
      );
      throw new ConflictException('Product is out of stock (Flash Sale depleted)');
    }

    return result;
  }

  /**
   * Compensating rollback of Redis stock if DB transaction or lock fails.
   */
  async rollbackRedisStock(productId: string, quantity: number): Promise<void> {
    await this.redisService.atomicReleaseStock(productId, quantity);
  }

  /**
   * Step 2 of Flash Sale Engine:
   * Acquire distributed Redis lock (Redlock token-verified primitive) for critical section.
   */
  async acquireProductWriteLock(
    productId: string,
    ttlMs = 5000,
  ): Promise<DistributedLockHandle> {
    const handle = await this.redisService.acquireLock(
      `inventory:${productId}`,
      ttlMs,
      400,
      2,
    );
    if (!handle) {
      throw new ServiceUnavailableException(
        'High concurrency contention on product lock; please retry',
      );
    }
    return handle;
  }

  async releaseProductWriteLock(handle: DistributedLockHandle): Promise<boolean> {
    return this.redisService.releaseLock(handle);
  }

  /**
   * Step 3 of Flash Sale Engine:
   * Database-level row locking (`SELECT ... FOR UPDATE`) + Optimistic Locking (`version` increment)
   * inside a Prisma interactive transaction.
   */
  async reserveStockInDbTransaction(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ): Promise<InventoryRowLockResult> {
    const rows = await tx.$queryRaw<InventoryRowLockResult[]>`
      SELECT id, product_id, total_stock, reserved_stock, version
      FROM inventory
      WHERE product_id = ${productId}::uuid
      FOR UPDATE
    `;

    const inventoryRow = rows[0];
    if (!inventoryRow) {
      throw new NotFoundException(`Inventory record not found for product ${productId}`);
    }

    const availableInDb = inventoryRow.total_stock - inventoryRow.reserved_stock;
    if (availableInDb < quantity) {
      throw new ConflictException(
        `Insufficient database stock for product ${productId} (available: ${availableInDb}, requested: ${quantity})`,
      );
    }

    const updatedCount = await tx.$executeRaw`
      UPDATE inventory
      SET reserved_stock = reserved_stock + ${quantity},
          version = version + 1
      WHERE product_id = ${productId}::uuid
        AND version = ${inventoryRow.version}
        AND (total_stock - reserved_stock) >= ${quantity}
    `;

    if (updatedCount !== 1) {
      throw new ConflictException(
        'Optimistic lock version mismatch during stock reservation',
      );
    }

    return {
      ...inventoryRow,
      reserved_stock: inventoryRow.reserved_stock + quantity,
      version: inventoryRow.version + 1,
    };
  }

  /**
   * Release reserved stock when an unpaid order expires or is cancelled.
   */
  async releaseReservedStockOnExpiry(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE inventory
      SET reserved_stock = GREATEST(0, reserved_stock - ${quantity}),
          version = version + 1
      WHERE product_id = ${productId}::uuid
    `;
    await this.redisService.atomicReleaseStock(productId, quantity);
  }

  /**
   * Permanently settle stock when an order is paid (decrement both total_stock and reserved_stock).
   */
  async commitPermanentStockDecrement(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE inventory
      SET total_stock = GREATEST(0, total_stock - ${quantity}),
          reserved_stock = GREATEST(0, reserved_stock - ${quantity}),
          version = version + 1
      WHERE product_id = ${productId}::uuid
    `;
  }

  /**
   * Get real-time stock snapshot combining Redis and PostgreSQL.
   */
  async getStockSnapshot(productId: string, bypassCache = false) {
    if (!bypassCache && this.redisService.getClient) {
      const [redisStock, meta] = await Promise.all([
        this.redisService.getStock(productId),
        this.redisService.getClient().hgetall(`inventory:meta:${productId}`),
      ]);

      if (redisStock !== null && meta && meta.totalStock !== undefined) {
        const totalStock = Number(meta.totalStock);
        const availableStock = Math.max(0, redisStock);
        const reservedStock = Math.max(0, totalStock - availableStock);

        return {
          product_id: productId,
          total_stock: totalStock,
          reserved_stock: reservedStock,
          available_stock: availableStock,
          db_available_stock: availableStock,
          version: Number(meta.version || 1),
        };
      }
    }

    if (bypassCache) {
      const dbInventory = await this.prisma.inventory.findUnique({
        where: { product_id: productId },
      });

      if (!dbInventory) {
        throw new NotFoundException(`Inventory for product ${productId} not found`);
      }

      const dbAvailable = Math.max(
        0,
        dbInventory.total_stock - dbInventory.reserved_stock,
      );

      return {
        product_id: productId,
        total_stock: dbInventory.total_stock,
        reserved_stock: dbInventory.reserved_stock,
        available_stock: dbAvailable,
        db_available_stock: dbAvailable,
        version: dbInventory.version,
      };
    }

    const [redisStock, dbInventory] = await Promise.all([
      this.redisService.getStock(productId),
      this.prisma.inventory.findUnique({
        where: { product_id: productId },
      }),
    ]);

    if (!dbInventory) {
      throw new NotFoundException(`Inventory for product ${productId} not found`);
    }

    const dbAvailable = Math.max(0, dbInventory.total_stock - dbInventory.reserved_stock);

    return {
      product_id: productId,
      total_stock: dbInventory.total_stock,
      reserved_stock: dbInventory.reserved_stock,
      available_stock: redisStock !== null ? redisStock : dbAvailable,
      db_available_stock: dbAvailable,
      version: dbInventory.version,
    };
  }

  /**
   * Audit endpoint verifying strict conservation of stock:
   * sold_items (PENDING + DEPOSIT_PAID + PAID order items) + remaining_stock == initial_stock
   */
  async auditProductStock(productId: string): Promise<InventoryAuditReport> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { inventory: true },
    });

    if (!product || !product.inventory) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const [activeOrderItemsAgg, paidOrderItemsAgg, redisStock] = await Promise.all([
      this.prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          product_id: productId,
          order: {
            status: {
              in: [OrderStatus.PENDING, OrderStatus.DEPOSIT_PAID, OrderStatus.PAID],
            },
          },
        },
      }),
      this.prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          product_id: productId,
          order: {
            status: {
              in: [OrderStatus.DEPOSIT_PAID, OrderStatus.PAID],
            },
          },
        },
      }),
      this.redisService.getStock(productId),
    ]);

    const soldItems = activeOrderItemsAgg._sum.quantity ?? 0;
    const paidSettledItems = paidOrderItemsAgg._sum.quantity ?? 0;
    const dbTotalStock = product.inventory.total_stock;
    const dbReservedStock = product.inventory.reserved_stock;
    const remainingStock = dbTotalStock - dbReservedStock;
    const initialTotalStock = dbTotalStock + paidSettledItems;
    const redisAvailable = redisStock ?? remainingStock;

    const invariantHolds =
      soldItems + remainingStock === initialTotalStock &&
      remainingStock >= 0 &&
      redisAvailable === remainingStock;

    return {
      productId,
      title: product.title,
      initialTotalStock,
      dbTotalStock,
      dbReservedStock,
      remainingStock,
      soldItems,
      redisAvailableStock: redisAvailable,
      invariantHolds,
      formula: `${soldItems} (sold) + ${remainingStock} (remaining) == ${initialTotalStock} (total)`,
    };
  }

  /**
   * Reset a product's stock to a target number (default 50) and clear its orders
   * so stress tests can be executed repeatedly and deterministically.
   */
  async resetProductForBenchmark(productId: string, stock = 50) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      const orderItems = await tx.orderItem.findMany({
        where: { product_id: productId },
        select: { order_id: true },
      });
      const orderIds = [...new Set(orderItems.map((i) => i.order_id))];

      if (orderIds.length > 0) {
        await tx.payment.deleteMany({ where: { order_id: { in: orderIds } } });
        await tx.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }

      await tx.inventory.update({
        where: { product_id: productId },
        data: {
          total_stock: stock,
          reserved_stock: 0,
          version: 1,
        },
      });
    });

    await this.redisService.setStock(productId, stock);
    if (this.redisService.getClient) {
      await this.redisService.getClient().hset(`inventory:meta:${productId}`, {
        totalStock: stock.toString(),
        reservedStock: '0',
      });
    }
    await this.redisService.invalidatePattern('idempotency:checkout:*');
    await this.redisService.invalidatePattern('products:*');

    this.logger.log(
      JSON.stringify({
        event: 'INVENTORY_BENCHMARK_RESET',
        productId,
        stock,
      }),
    );

    return this.auditProductStock(productId);
  }
}
