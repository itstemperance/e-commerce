import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, logLevel, Producer } from 'kafkajs';
import { OrderCreatedEventPayload } from '@repo/types';
import { RedisService } from '../common/redis/redis.service';
import { NotificationWorker } from './notification.worker';
import { StockSettlementWorker } from './stock-settlement.worker';
import { OrderExpirationWorker } from './order-expiration.worker';

export interface OrderPaidEventPayload {
  orderId: string;
  userId: string;
  productId: string;
  quantity: number;
  transactionId: string;
  amount: number;
  paidAt: string;
}

@Injectable()
export class KafkaEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private isConnected = false;

  public static readonly TOPIC_ORDER_CREATED = 'orders.created';
  public static readonly TOPIC_ORDER_PAID = 'orders.paid';

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly notificationWorker: NotificationWorker,
    private readonly stockSettlementWorker: StockSettlementWorker,
    private readonly orderExpirationWorker: OrderExpirationWorker,
  ) {
    const brokersRaw = this.configService.get<string>(
      'KAFKA_BROKERS',
      'localhost:9092',
    );
    const brokers = brokersRaw.split(',').map((b) => b.trim());
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'flashsale-api',
    );
    const groupId = this.configService.get<string>(
      'KAFKA_GROUP_ID',
      'flashsale-workers-group',
    );

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.NOTHING,
      retry: {
        initialRetryTime: 200,
        retries: 5,
      },
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      await this.producer.connect();
      await this.consumer.connect();

      await this.consumer.subscribe({
        topics: [
          KafkaEventService.TOPIC_ORDER_CREATED,
          KafkaEventService.TOPIC_ORDER_PAID,
        ],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (!message.value) return;
          const raw = message.value.toString();

          if (topic === KafkaEventService.TOPIC_ORDER_CREATED) {
            const payload = JSON.parse(raw) as OrderCreatedEventPayload;
            await this.processOrderCreatedEvent(payload);
          } else if (topic === KafkaEventService.TOPIC_ORDER_PAID) {
            const payload = JSON.parse(raw) as OrderPaidEventPayload;
            await this.processOrderPaidEvent(payload);
          }
        },
      });

      this.isConnected = true;
      this.logger.log(
        'Connected Kafka Producer & Consumer workers to Redpanda broker (port 9092)',
      );
    } catch (error) {
      this.logger.warn(
        `Kafka broker connection degraded (${(error as Error).message}); using local async event worker fallback`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isConnected) {
      await this.consumer.disconnect().catch(() => undefined);
      await this.producer.disconnect().catch(() => undefined);
    }
  }

  /**
   * Non-blocking event emission for OrderCreated so the HTTP checkout endpoint
   * returns well under the 100ms SLA while Redpanda + background workers process the event.
   */
  emitOrderCreated(payload: OrderCreatedEventPayload): void {
    setImmediate(async () => {
      try {
        // Schedule 15-minute unpaid order expiration countdown immediately
        await this.orderExpirationWorker.scheduleOrderExpiration(payload.orderId);

        if (this.isConnected) {
          await this.producer.send({
            topic: KafkaEventService.TOPIC_ORDER_CREATED,
            messages: [
              {
                key: payload.orderId,
                value: JSON.stringify(payload),
              },
            ],
          });
        } else {
          await this.processOrderCreatedEvent(payload);
        }
      } catch (error) {
        this.logger.warn(
          `Kafka publish fallback triggered for OrderCreated ${payload.orderId}: ${(error as Error).message}`,
        );
        await this.processOrderCreatedEvent(payload);
      }
    });
  }

  emitOrderPaid(payload: OrderPaidEventPayload): void {
    setImmediate(async () => {
      try {
        await this.orderExpirationWorker.cancelScheduledExpiration(payload.orderId);

        if (this.isConnected) {
          await this.producer.send({
            topic: KafkaEventService.TOPIC_ORDER_PAID,
            messages: [
              {
                key: payload.orderId,
                value: JSON.stringify(payload),
              },
            ],
          });
        } else {
          await this.processOrderPaidEvent(payload);
        }
      } catch (error) {
        this.logger.warn(
          `Kafka publish fallback triggered for OrderPaid ${payload.orderId}: ${(error as Error).message}`,
        );
        await this.processOrderPaidEvent(payload);
      }
    });
  }

  private async processOrderCreatedEvent(
    payload: OrderCreatedEventPayload,
  ): Promise<void> {
    const dedupKey = `worker:dedup:order_created:${payload.orderId}`;
    const firstTime = await this.redisService
      .getClient()
      .set(dedupKey, '1', 'EX', 3600, 'NX');
    if (firstTime !== 'OK') return;

    await Promise.all([
      this.stockSettlementWorker.handleOrderCreatedStockSync({
        orderId: payload.orderId,
        productId: payload.productId,
        quantity: payload.quantity,
      }),
      this.notificationWorker.handleOrderCreated({
        orderId: payload.orderId,
        userId: payload.userId,
        productId: payload.productId,
        quantity: payload.quantity,
        totalAmount: payload.totalAmount,
      }),
    ]);
  }

  private async processOrderPaidEvent(payload: OrderPaidEventPayload): Promise<void> {
    const dedupKey = `worker:dedup:order_paid:${payload.orderId}`;
    const firstTime = await this.redisService
      .getClient()
      .set(dedupKey, '1', 'EX', 3600, 'NX');
    if (firstTime !== 'OK') return;

    await Promise.all([
      this.stockSettlementWorker.handleOrderPaidStockSettlement({
        orderId: payload.orderId,
        productId: payload.productId,
        quantity: payload.quantity,
      }),
      this.notificationWorker.handleOrderPaid({
        orderId: payload.orderId,
        userId: payload.userId,
        transactionId: payload.transactionId,
        amount: payload.amount,
      }),
    ]);
  }
}
