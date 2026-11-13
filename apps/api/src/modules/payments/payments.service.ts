import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { KafkaEventService } from '../../workers/kafka-event.service';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

export interface PaymentWebhookResponse {
  paymentId: string;
  orderId: string;
  transactionId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  processedAt: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly inventoryService: InventoryService,
    private readonly kafkaEventService: KafkaEventService,
  ) {}

  /**
   * Compute HMAC-SHA256 signature over canonical webhook payload.
   */
  computeHmacSignature(dto: PaymentWebhookDto): string {
    const secret = this.configService.get<string>(
      'PAYMENT_WEBHOOK_SECRET',
      'whsec_flashsale_hmac_secret_2026',
    );
    const canonical = `${dto.orderId}:${dto.transactionId}:${dto.provider}:${Number(dto.amount).toFixed(2)}:${dto.status}`;
    return createHmac('sha256', secret).update(canonical).digest('hex');
  }

  /**
   * Constant-time cryptographic verification of X-Webhook-Signature.
   */
  verifyHmacSignature(dto: PaymentWebhookDto, signatureHeader?: string): boolean {
    if (!signatureHeader) return false;
    const expected = this.computeHmacSignature(dto);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signatureHeader.trim(), 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Handle incoming payment webhook with HMAC signature verification and X-Idempotency-Key protection.
   */
  async handlePaymentWebhook(
    idempotencyKey: string,
    signatureHeader: string | undefined,
    dto: PaymentWebhookDto,
  ): Promise<PaymentWebhookResponse> {
    if (!idempotencyKey || idempotencyKey.trim().length < 4) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }

    if (!this.verifyHmacSignature(dto, signatureHeader)) {
      throw new UnauthorizedException('Invalid cryptographic HMAC webhook signature');
    }

    const normalizedKey = idempotencyKey.trim();
    const requestHash = createHash('sha256')
      .update(
        `${dto.orderId}:${dto.transactionId}:${dto.provider}:${Number(dto.amount).toFixed(2)}:${dto.status}`,
      )
      .digest('hex');

    const existingIdem =
      await this.redisService.getIdempotencyRecord<PaymentWebhookResponse>(
        'payment',
        normalizedKey,
      );

    if (existingIdem) {
      if (existingIdem.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'X-Idempotency-Key already used with different payment webhook payload',
        );
      }
      if (existingIdem.status === 'COMPLETED' && existingIdem.response) {
        return existingIdem.response;
      }
      throw new ConflictException('Payment webhook with this key is already processing');
    }

    const acquired = await this.redisService.acquireIdempotencyLock(
      'payment',
      normalizedKey,
      requestHash,
    );
    if (!acquired) {
      throw new ConflictException('Duplicate concurrent payment webhook request');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: dto.orderId },
          include: { items: true },
        });

        if (!order) {
          throw new NotFoundException(`Order ${dto.orderId} not found`);
        }

        if (order.status === OrderStatus.PAID) {
          const existingPayment = await tx.payment.findFirst({
            where: { order_id: order.id },
          });
          return {
            order,
            payment:
              existingPayment ??
              (await tx.payment.create({
                data: {
                  order_id: order.id,
                  transaction_id: dto.transactionId,
                  provider: dto.provider,
                  amount: dto.amount,
                  status: PaymentStatus.COMPLETED,
                  raw_payload: dto as unknown as Prisma.InputJsonValue,
                },
              })),
            alreadyPaid: true,
          };
        }

        let orderMeta: Record<string, string> | null = null;
        if (this.redisService?.getClient) {
          try {
            orderMeta = await this.redisService
              .getClient()
              .hgetall(`order:meta:${order.id}`);
          } catch {
            // Redis fallback
          }
        }

        const isPartialCod = orderMeta?.paymentPlan === 'PARTIAL_COD';
        let targetOrderStatus: OrderStatus = OrderStatus.PAID;

        if (order.status === OrderStatus.PENDING) {
          targetOrderStatus = isPartialCod
            ? OrderStatus.DEPOSIT_PAID
            : OrderStatus.PAID;
        } else if (order.status === OrderStatus.DEPOSIT_PAID) {
          targetOrderStatus = OrderStatus.PAID;
        } else {
          throw new ConflictException(
            `Order ${order.id} is in state ${order.status} and cannot be paid`,
          );
        }

        const paymentStatus =
          dto.status === 'COMPLETED'
            ? PaymentStatus.COMPLETED
            : PaymentStatus.FAILED;

        const payment = await tx.payment.create({
          data: {
            order_id: order.id,
            transaction_id: dto.transactionId,
            provider: dto.provider,
            amount: dto.amount,
            status: paymentStatus,
            raw_payload: dto as unknown as Prisma.InputJsonValue,
          },
        });

        if (paymentStatus === PaymentStatus.COMPLETED) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: targetOrderStatus },
          });

          if (order.status === OrderStatus.PENDING) {
            for (const item of order.items) {
              await this.inventoryService.commitPermanentStockDecrement(
                tx,
                item.product_id,
                item.quantity,
              );
            }
          }
        }

        return {
          order: {
            ...order,
            status:
              paymentStatus === PaymentStatus.COMPLETED
                ? targetOrderStatus
                : order.status,
          },
          payment,
          alreadyPaid: false,
          targetOrderStatus,
        };
      });

      if (this.redisService?.getClient && result.payment.status === PaymentStatus.COMPLETED) {
        const metaUpdates: Record<string, string> = {};
        if (result.targetOrderStatus === OrderStatus.DEPOSIT_PAID) {
          metaUpdates.isDepositPaid = 'true';
          metaUpdates.depositPaidAt = new Date().toISOString();
          metaUpdates.fulfillmentStatus = 'PACKING';
          metaUpdates.fulfillmentNote =
            'Đã nhận cọc 10%. Đơn hàng đang được kho tiến hành đóng gói.';
          metaUpdates.fulfillmentUpdatedAt = new Date().toISOString();
        } else if (result.targetOrderStatus === OrderStatus.PAID) {
          metaUpdates.isDepositPaid = 'true';
          metaUpdates.isFullyPaid = 'true';
          metaUpdates.fullyPaidAt = new Date().toISOString();
        }
        await this.redisService
          .getClient()
          .hset(`order:meta:${result.order.id}`, metaUpdates);
        await this.redisService
          .getClient()
          .zrem('orders:delayed_expiration', result.order.id);
      }

      const response: PaymentWebhookResponse = {
        paymentId: result.payment.id,
        orderId: result.order.id,
        transactionId: result.payment.transaction_id,
        orderStatus: result.order.status,
        paymentStatus: result.payment.status,
        amount: Number(result.payment.amount),
        processedAt: new Date().toISOString(),
      };

      await this.redisService.saveIdempotencyResponse(
        'payment',
        normalizedKey,
        requestHash,
        200,
        response,
      );

      if (!result.alreadyPaid && result.order.status === OrderStatus.PAID) {
        const firstItem = result.order.items[0];
        this.kafkaEventService.emitOrderPaid({
          orderId: result.order.id,
          userId: result.order.user_id,
          productId: firstItem?.product_id ?? '',
          quantity: firstItem?.quantity ?? 1,
          transactionId: result.payment.transaction_id,
          amount: Number(result.payment.amount),
          paidAt: response.processedAt,
        });

        this.logger.log(
          JSON.stringify({
            event: 'ORDER_STATE_TRANSITION',
            orderId: result.order.id,
            from: OrderStatus.PENDING,
            to: OrderStatus.PAID,
            transactionId: result.payment.transaction_id,
          }),
        );
      }

      return response;
    } catch (error) {
      await this.redisService.clearIdempotencyRecord('payment', normalizedKey);
      throw error;
    }
  }

  /**
   * Mock Payment Gateway simulator: signs a valid HMAC-SHA256 webhook payload and executes settlement.
   */
  async simulatePaymentForOrder(
    orderId: string,
    idempotencyKey: string,
    provider = 'STRIPE_MOCK',
  ): Promise<PaymentWebhookResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    let paymentAmount = Number(order.total_amount);
    if (this.redisService?.getClient) {
      try {
        const meta = await this.redisService
          .getClient()
          .hgetall(`order:meta:${order.id}`);
        if (meta?.paymentPlan === 'PARTIAL_COD') {
          if (order.status === OrderStatus.PENDING && meta?.depositDueNow) {
            paymentAmount = Number(meta.depositDueNow);
          } else if (
            order.status === OrderStatus.DEPOSIT_PAID &&
            meta?.codBalance
          ) {
            paymentAmount = Number(meta.codBalance);
          }
        }
      } catch {
        // fallback
      }
    }

    const dto: PaymentWebhookDto = {
      orderId: order.id,
      transactionId: `tx_${order.id.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
      provider,
      amount: paymentAmount,
      status: 'COMPLETED',
    };

    const signature = this.computeHmacSignature(dto);
    return this.handlePaymentWebhook(idempotencyKey, signature, dto);
  }
}
