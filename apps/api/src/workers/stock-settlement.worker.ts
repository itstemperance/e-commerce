import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class StockSettlementWorker {
  private readonly logger = new Logger(StockSettlementWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Worker handler for OrderCreated event:
   * Synchronizes Redis hash metadata (`inventory:meta:<productId>`) with current DB reservation state.
   */
  async handleOrderCreatedStockSync(payload: {
    orderId: string;
    productId: string;
    quantity: number;
  }): Promise<void> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { product_id: payload.productId },
    });

    if (!inventory) return;

    await this.redisService.getClient().hset(`inventory:meta:${payload.productId}`, {
      totalStock: inventory.total_stock.toString(),
      reservedStock: inventory.reserved_stock.toString(),
    });

    this.logger.log(
      JSON.stringify({
        event: 'WORKER_STOCK_RESERVATION_SYNCED',
        orderId: payload.orderId,
        productId: payload.productId,
        quantity: payload.quantity,
        totalStock: inventory.total_stock,
        reservedStock: inventory.reserved_stock,
      }),
    );
  }

  /**
   * Worker handler for OrderPaid event:
   * Confirms permanent database stock deduction & updates Redis metadata.
   */
  async handleOrderPaidStockSettlement(payload: {
    orderId: string;
    productId: string;
    quantity: number;
  }): Promise<void> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { product_id: payload.productId },
    });

    if (!inventory) return;

    await this.redisService.getClient().hset(`inventory:meta:${payload.productId}`, {
      totalStock: inventory.total_stock.toString(),
      reservedStock: inventory.reserved_stock.toString(),
    });

    this.logger.log(
      JSON.stringify({
        event: 'WORKER_PERMANENT_STOCK_SETTLED',
        orderId: payload.orderId,
        productId: payload.productId,
        quantity: payload.quantity,
        remainingTotalStock: inventory.total_stock,
        remainingReservedStock: inventory.reserved_stock,
      }),
    );
  }
}
