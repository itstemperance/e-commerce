import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { NotificationWorker } from './notification.worker';

@Injectable()
export class OrderExpirationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpirationWorker.name);
  private static readonly DELAYED_QUEUE_KEY = 'orders:delayed_expiration';
  private static readonly EXPIRATION_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly inventoryService: InventoryService,
    private readonly notificationWorker: NotificationWorker,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.processExpiredOrders();
    }, 5000);
    this.logger.log(
      'Initialized OrderExpirationWorker (15-minute Delayed Queue / TTL poller)',
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedule an unpaid order to expire in 15 minutes (or custom delayMs).
   */
  async scheduleOrderExpiration(
    orderId: string,
    delayMs = OrderExpirationWorker.EXPIRATION_TTL_MS,
  ): Promise<void> {
    const expireAtTimestamp = Date.now() + delayMs;
    await this.redisService
      .getClient()
      .zadd(OrderExpirationWorker.DELAYED_QUEUE_KEY, expireAtTimestamp, orderId);
  }

  /**
   * Remove an order from the delayed expiration queue once paid or cancelled.
   */
  async cancelScheduledExpiration(orderId: string): Promise<void> {
    await this.redisService
      .getClient()
      .zrem(OrderExpirationWorker.DELAYED_QUEUE_KEY, orderId);
  }

  /**
   * Poll Redis ZSET for orders whose 15-minute countdown has elapsed.
   */
  async processExpiredOrders(): Promise<number> {
    const now = Date.now();
    const client = this.redisService.getClient();

    const dueOrderIds = await client.zrangebyscore(
      OrderExpirationWorker.DELAYED_QUEUE_KEY,
      '-inf',
      now,
      'LIMIT',
      0,
      25,
    );

    let expiredCount = 0;
    for (const orderId of dueOrderIds) {
      const removed = await client.zrem(
        OrderExpirationWorker.DELAYED_QUEUE_KEY,
        orderId,
      );
      if (removed === 1) {
        const didExpire = await this.expireSingleOrder(orderId);
        if (didExpire) expiredCount++;
      }
    }

    return expiredCount;
  }

  /**
   * Atomically transition a PENDING order to EXPIRED and return its reserved stock to Redis & Postgres.
   */
  async expireSingleOrder(orderId: string): Promise<boolean> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });

        if (!order || order.status !== OrderStatus.PENDING) {
          return null;
        }

        const updated = await tx.order.updateMany({
          where: { id: orderId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.EXPIRED },
        });

        if (updated.count !== 1) {
          return null;
        }

        for (const item of order.items) {
          await this.inventoryService.releaseReservedStockOnExpiry(
            tx,
            item.product_id,
            item.quantity,
          );
        }

        return order;
      });

      if (result) {
        this.logger.log(
          JSON.stringify({
            event: 'ORDER_STATE_TRANSITION',
            orderId: result.id,
            from: OrderStatus.PENDING,
            to: OrderStatus.EXPIRED,
            reason: 'TTL_15_MIN_EXPIRED',
          }),
        );

        await this.notificationWorker.handleOrderExpired({
          orderId: result.id,
          userId: result.user_id,
        });
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(
        `Error expiring order ${orderId}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
