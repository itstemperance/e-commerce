import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

export interface NotificationEntry {
  id: string;
  userId: string;
  orderId: string;
  type: 'ORDER_CREATED' | 'ORDER_PAID' | 'ORDER_EXPIRED';
  subject: string;
  body: string;
  sentAt: string;
}

@Injectable()
export class NotificationWorker {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(private readonly redisService: RedisService) {}

  async handleOrderCreated(payload: {
    orderId: string;
    userId: string;
    productId: string;
    quantity: number;
    totalAmount: number;
  }): Promise<void> {
    const entry: NotificationEntry = {
      id: `notif-${payload.orderId}-created`,
      userId: payload.userId,
      orderId: payload.orderId,
      type: 'ORDER_CREATED',
      subject: `Flash Sale Order Reserved (#${payload.orderId.slice(0, 8)})`,
      body: `Your order for ${payload.quantity} unit(s) totaling $${payload.totalAmount.toFixed(2)} is reserved for 15 minutes. Complete payment to lock in your item.`,
      sentAt: new Date().toISOString(),
    };

    await this.recordNotification(entry);
    this.logger.log(
      JSON.stringify({
        event: 'WORKER_NOTIFICATION_DISPATCHED',
        channel: 'EMAIL_MOCK',
        ...entry,
      }),
    );
  }

  async handleOrderPaid(payload: {
    orderId: string;
    userId: string;
    transactionId: string;
    amount: number;
  }): Promise<void> {
    const entry: NotificationEntry = {
      id: `notif-${payload.orderId}-paid`,
      userId: payload.userId,
      orderId: payload.orderId,
      type: 'ORDER_PAID',
      subject: `Payment Confirmed for Order #${payload.orderId.slice(0, 8)}`,
      body: `Payment of $${payload.amount.toFixed(2)} (TX: ${payload.transactionId}) has been verified and settled.`,
      sentAt: new Date().toISOString(),
    };

    await this.recordNotification(entry);
    this.logger.log(
      JSON.stringify({
        event: 'WORKER_NOTIFICATION_DISPATCHED',
        channel: 'EMAIL_MOCK',
        ...entry,
      }),
    );
  }

  async handleOrderExpired(payload: {
    orderId: string;
    userId: string;
  }): Promise<void> {
    const entry: NotificationEntry = {
      id: `notif-${payload.orderId}-expired`,
      userId: payload.userId,
      orderId: payload.orderId,
      type: 'ORDER_EXPIRED',
      subject: `Order #${payload.orderId.slice(0, 8)} Expired`,
      body: `Your 15-minute reservation window has elapsed and the reserved stock has been returned to the Flash Sale pool.`,
      sentAt: new Date().toISOString(),
    };

    await this.recordNotification(entry);
    this.logger.log(
      JSON.stringify({
        event: 'WORKER_NOTIFICATION_DISPATCHED',
        channel: 'EMAIL_MOCK',
        ...entry,
      }),
    );
  }

  private async recordNotification(entry: NotificationEntry): Promise<void> {
    try {
      const key = `notifications:order:${entry.orderId}`;
      await this.redisService.getClient().lpush(key, JSON.stringify(entry));
      await this.redisService.getClient().expire(key, 86400);
    } catch {
      // Non-fatal in notification logger
    }
  }
}
