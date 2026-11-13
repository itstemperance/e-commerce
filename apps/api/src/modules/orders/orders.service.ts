import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  Role,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { FlashCheckoutResponseDto } from '@repo/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DistributedLockHandle,
  RedisService,
} from '../../common/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { KafkaEventService } from '../../workers/kafka-event.service';
import { OrderExpirationWorker } from '../../workers/order-expiration.worker';
import {
  CreateOrderDto,
  FlashCheckoutDto,
  UpdateCheckoutConfigDto,
} from './dto/flash-checkout.dto';

export interface CheckoutPaymentConfig {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  bankBranch: string;
  qrTemplateUrl: string;
  checkoutGuidance: string;
  minDepositVnd: number;
  usdToVndRate: number;
  partialDepositPercent: number;
  codShippingFee: number;
}

const DEFAULT_CHECKOUT_CONFIG: CheckoutPaymentConfig = {
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

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly verifiedUserIds = new Set<string>();
  private cachedFallbackUserId: string | null = null;
  private cachedCheckoutConfig: {
    data: CheckoutPaymentConfig;
    expiresAt: number;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly inventoryService: InventoryService,
    private readonly productsService: ProductsService,
    private readonly kafkaEventService: KafkaEventService,
    private readonly orderExpirationWorker: OrderExpirationWorker,
  ) {}

  normalizePhoneNumber(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '').replace(/^84/, '0');
  }

  private async backfillUserProfileFromOrderIfMissing(
    userId: string,
    fullName?: string,
    phone?: string,
    address?: string,
  ): Promise<void> {
    if (!this.redisService?.getClient) return;
    try {
      const client = this.redisService.getClient();
      const key = `user:profile:${userId}`;
      const existing = await client.hgetall(key);
      const updates: Record<string, string> = {};

      const cleanName = fullName?.trim() || '';
      const cleanPhone = phone?.trim() || '';
      const cleanAddress = address?.trim() || '';

      if (
        !existing?.fullName?.trim() &&
        cleanName &&
        cleanName !== 'Khách hàng AURA'
      ) {
        updates.fullName = cleanName;
      }
      if (
        !existing?.phone?.trim() &&
        cleanPhone &&
        cleanPhone !== '0982351080'
      ) {
        updates.phone = cleanPhone;
      }
      if (
        !existing?.address?.trim() &&
        cleanAddress &&
        cleanAddress !== 'Địa chỉ nhận hàng'
      ) {
        updates.address = cleanAddress;
      }
      if (existing?.notes === 'Registered via Storefront') {
        updates.notes = '';
      }

      if (Object.keys(updates).length > 0) {
        await client.hset(key, updates);
      }
    } catch {
      // Non-critical profile backfill
    }
  }

  async getCheckoutConfig(): Promise<CheckoutPaymentConfig> {
    if (this.cachedCheckoutConfig && this.cachedCheckoutConfig.expiresAt > Date.now()) {
      return this.cachedCheckoutConfig.data;
    }
    if (!this.redisService.getClient) {
      return DEFAULT_CHECKOUT_CONFIG;
    }
    const raw = await this.redisService
      .getClient()
      .get('settings:checkout_payment_config');
    let config = DEFAULT_CHECKOUT_CONFIG;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<CheckoutPaymentConfig>;
        config = {
          ...DEFAULT_CHECKOUT_CONFIG,
          ...parsed,
        };
      } catch {
        config = DEFAULT_CHECKOUT_CONFIG;
      }
    }
    this.cachedCheckoutConfig = {
      data: config,
      expiresAt: Date.now() + 5000,
    };
    return config;
  }

  async updateCheckoutConfig(
    dto: UpdateCheckoutConfigDto,
  ): Promise<CheckoutPaymentConfig> {
    const current = await this.getCheckoutConfig();
    const updated: CheckoutPaymentConfig = {
      bankName:
        dto.bankName !== undefined ? dto.bankName.trim() : current.bankName,
      accountNumber:
        dto.accountNumber !== undefined
          ? dto.accountNumber.trim()
          : current.accountNumber,
      accountHolder:
        dto.accountHolder !== undefined
          ? dto.accountHolder.trim()
          : current.accountHolder,
      bankBranch:
        dto.bankBranch !== undefined
          ? dto.bankBranch.trim()
          : current.bankBranch,
      qrTemplateUrl:
        dto.qrTemplateUrl !== undefined
          ? dto.qrTemplateUrl.trim()
          : current.qrTemplateUrl,
      checkoutGuidance:
        dto.checkoutGuidance !== undefined
          ? dto.checkoutGuidance.trim()
          : current.checkoutGuidance,
      minDepositVnd:
        dto.minDepositVnd !== undefined
          ? dto.minDepositVnd
          : current.minDepositVnd,
      usdToVndRate:
        dto.usdToVndRate !== undefined
          ? dto.usdToVndRate
          : current.usdToVndRate,
      partialDepositPercent:
        dto.partialDepositPercent !== undefined
          ? dto.partialDepositPercent
          : current.partialDepositPercent,
      codShippingFee:
        dto.codShippingFee !== undefined
          ? dto.codShippingFee
          : current.codShippingFee,
    };

    if (this.redisService.getClient) {
      await this.redisService
        .getClient()
        .set('settings:checkout_payment_config', JSON.stringify(updated));
    }

    this.cachedCheckoutConfig = {
      data: updated,
      expiresAt: Date.now() + 5000,
    };

    return updated;
  }

  /**
   * Computes real-world e-commerce promotional pricing:
   * "Giảm giá cho sản phẩm đầu tiên" CHỈ áp dụng cho sản phẩm được đánh dấu là FLASH_SALE.
   * Nếu là FLASH_SALE và số lượng >= 2: duy nhất 1 sản phẩm đầu được hưởng giá ưu đãi (price),
   * các sản phẩm còn lại (quantity - 1) quay về giá gốc niêm yết (originalPrice).
   * Đối với các sản phẩm thông thường (ACTIVE), áp dụng nguyên giá niêm yết cho toàn bộ số lượng.
   */
  computeTieredProductLine(
    productId: string,
    quantity: number,
    discountedPrice: number,
    originalPrice?: number,
    isFlashSale: boolean = true,
  ): {
    lineTotal: number;
    hasMultiUnitRevert: boolean;
    normalPrice: number;
    dbItemRows: Array<{
      product_id: string;
      quantity: number;
      price_at_purchase: number;
    }>;
  } {
    const normalPrice =
      isFlashSale && originalPrice && originalPrice > discountedPrice
        ? originalPrice
        : discountedPrice;

    if (!isFlashSale || quantity <= 1 || normalPrice <= discountedPrice) {
      const lineTotal = Number((discountedPrice * quantity).toFixed(2));
      return {
        lineTotal,
        hasMultiUnitRevert: false,
        normalPrice: discountedPrice,
        dbItemRows: [
          {
            product_id: productId,
            quantity,
            price_at_purchase: discountedPrice,
          },
        ],
      };
    }

    // 1st unit gets discountedPrice, remaining (quantity - 1) units get normalPrice
    const extraUnits = quantity - 1;
    const lineTotal = Number(
      (discountedPrice + extraUnits * normalPrice).toFixed(2),
    );

    return {
      lineTotal,
      hasMultiUnitRevert: true,
      normalPrice,
      dbItemRows: [
        {
          product_id: productId,
          quantity: 1,
          price_at_purchase: discountedPrice,
        },
        {
          product_id: productId,
          quantity: extraUnits,
          price_at_purchase: normalPrice,
        },
      ],
    };
  }

  /**
   * High-Concurrency Flash Sale Checkout Engine:
   * 1. Validate & lock X-Idempotency-Key (prevent duplicate orders / double charges)
   * 2. Fast Redis Lua stock pre-check & atomic decrement (rejects depleted stock in <1ms)
   * 3. Acquire Redis Distributed Lock (Redlock token-verified primitive)
   * 4. Execute PostgreSQL interactive transaction with SELECT ... FOR UPDATE + Optimistic Lock version check
   *    + Tiered Single-Discount-Unit Pricing Rule (Unit 1 @ discounted price, Units 2+ @ normal price)
   * 5. Release lock, persist idempotency result, emit Kafka OrderCreated event, return Order ID in <100ms
   */
  async executeFlashCheckout(
    userId: string,
    idempotencyKey: string,
    dto: FlashCheckoutDto,
    benchmarkMode?: string,
  ): Promise<FlashCheckoutResponseDto> {
    const startTime = performance.now();
    const isNoRedisLockMode = benchmarkMode === 'no-redis-lock';
    const isNaiveNoLockMode = benchmarkMode === 'naive-no-lock';
    const skipRedisProtection = isNoRedisLockMode || isNaiveNoLockMode;

    if (!idempotencyKey || idempotencyKey.trim().length < 4) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }

    const normalizedKey = idempotencyKey.trim();
    const requestHash = this.computeRequestHash(dto);

    if (!skipRedisProtection) {
      // 1. Check Redis idempotency cache first
      const existingIdem =
        await this.redisService.getIdempotencyRecord<FlashCheckoutResponseDto>(
          'checkout',
          normalizedKey,
        );

      if (existingIdem) {
        if (existingIdem.requestHash !== requestHash) {
          throw new UnprocessableEntityException(
            'X-Idempotency-Key was already used with a different request payload',
          );
        }
        if (existingIdem.status === 'COMPLETED' && existingIdem.response) {
          return {
            ...existingIdem.response,
            processingTimeMs: Number((performance.now() - startTime).toFixed(2)),
          };
        }
        throw new ConflictException(
          'A checkout request with this X-Idempotency-Key is already in progress',
        );
      }

      const acquiredIdem = await this.redisService.acquireIdempotencyLock(
        'checkout',
        normalizedKey,
        requestHash,
      );

      if (!acquiredIdem) {
        throw new ConflictException(
          'Concurrent request with identical X-Idempotency-Key detected',
        );
      }
    }

    let redisStockReserved = false;
    let lockHandle: DistributedLockHandle | null = null;

    try {
      if (!skipRedisProtection) {
        // 2. Fast Redis Lua stock pre-decrement BEFORE touching PostgreSQL
        await this.inventoryService.preDecrementRedisStock(
          dto.productId,
          dto.quantity,
        );
        redisStockReserved = true;
      }

      const [productMeta, cfg] = await Promise.all([
        this.productsService.getProductPriceAndStatusFast(dto.productId),
        this.getCheckoutConfig(),
      ]);

      const isFlashSale = productMeta.status === ProductStatus.FLASH_SALE;
      const tiered = this.computeTieredProductLine(
        dto.productId,
        dto.quantity,
        productMeta.price,
        productMeta.originalPrice,
        isFlashSale,
      );

      let totalAmount = tiered.lineTotal;
      if (dto.paymentPlan === 'PARTIAL_COD') {
        totalAmount = Number((totalAmount + cfg.codShippingFee).toFixed(2));
      }

      // Guard against foreign key constraint violations if userId does not exist in DB
      let targetUserId = userId;
      if (!this.verifiedUserIds.has(targetUserId) && this.prisma.user?.findUnique) {
        const userExists = await this.prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true },
        });
        if (userExists) {
          this.verifiedUserIds.add(targetUserId);
        } else {
          if (!this.cachedFallbackUserId) {
            const fallbackUser =
              (await this.prisma.user.findFirst({
                where: { role: Role.CUSTOMER },
                select: { id: true },
              })) ?? (await this.prisma.user.findFirst({ select: { id: true } }));
            if (fallbackUser) {
              this.cachedFallbackUserId = fallbackUser.id;
            }
          }
          if (this.cachedFallbackUserId) {
            targetUserId = this.cachedFallbackUserId;
          }
        }
      }

      let recipientFullName = dto.fullName?.trim();
      let recipientPhone = dto.phone?.trim();
      let recipientAddress = dto.address?.trim();
      const recipientNotes = dto.notes?.trim() || '';
      const hasAnyRecipientInput = Boolean(
        recipientFullName || recipientPhone || recipientAddress,
      );

      if (
        hasAnyRecipientInput &&
        (!recipientFullName || !recipientPhone || !recipientAddress) &&
        this.redisService?.getClient
      ) {
        try {
          const savedProfile = await this.redisService
            .getClient()
            .hgetall(`user:profile:${targetUserId}`);
          if (!recipientFullName && savedProfile?.fullName) {
            recipientFullName = savedProfile.fullName;
          }
          if (!recipientPhone && savedProfile?.phone) {
            recipientPhone = savedProfile.phone;
          }
          if (!recipientAddress && savedProfile?.address) {
            recipientAddress = savedProfile.address;
          }
        } catch {
          // Ignore redis lookup errors
        }
      }

      if (!recipientFullName) recipientFullName = 'Khách hàng AURA';
      if (!recipientPhone) recipientPhone = '0982351080';
      if (!recipientAddress) recipientAddress = 'Địa chỉ nhận hàng';

      let createdOrder;
      if (isNaiveNoLockMode) {
        // Baseline without Redis lock or DB row lock (demonstrates race condition & overselling)
        const inv = await this.prisma.inventory.findUnique({
          where: { product_id: dto.productId },
        });
        const available = inv ? inv.total_stock - inv.reserved_stock : 0;
        if (available < dto.quantity) {
          throw new ConflictException(
            'Product is out of stock (Naive DB Check)',
          );
        }
        await this.prisma.inventory.update({
          where: { product_id: dto.productId },
          data: {
            reserved_stock: { increment: dto.quantity },
          },
        });
        createdOrder = await this.prisma.order.create({
          data: {
            user_id: targetUserId,
            total_amount: totalAmount,
            status: OrderStatus.PENDING,
            idempotency_key: normalizedKey,
            items: {
              create:
                tiered.dbItemRows.length === 1
                  ? tiered.dbItemRows[0]
                  : tiered.dbItemRows,
            },
          },
        });
      } else {
        if (!isNoRedisLockMode) {
          // 3. Acquire Distributed Redis Lock ONLY for critical DB inventory/order section
          lockHandle = await this.inventoryService.acquireProductWriteLock(
            dto.productId,
            5000,
          );
        }

        // 4. Database Transaction with Row Lock (SELECT ... FOR UPDATE) + Optimistic Lock + Create Order
        createdOrder = await this.prisma.$transaction(async (tx) => {
          await this.inventoryService.reserveStockInDbTransaction(
            tx,
            dto.productId,
            dto.quantity,
          );

          return tx.order.create({
            data: {
              user_id: targetUserId,
              total_amount: totalAmount,
              status: OrderStatus.PENDING,
              idempotency_key: normalizedKey,
              items: {
                create:
                  tiered.dbItemRows.length === 1
                    ? tiered.dbItemRows[0]
                    : tiered.dbItemRows,
              },
            },
          });
        });

        if (lockHandle) {
          await this.inventoryService.releaseProductWriteLock(lockHandle);
          lockHandle = null;
        }
      }

      if (this.redisService.getClient) {
        const paymentPlan = dto.paymentPlan ?? 'FULL_TRANSFER';
        const shippingFee =
          paymentPlan === 'PARTIAL_COD' ? cfg.codShippingFee : 0;
        const minDepositUsd = Number(
          (cfg.minDepositVnd / cfg.usdToVndRate).toFixed(2),
        );
        const depositDueNow =
          paymentPlan === 'PARTIAL_COD'
            ? Number(
                Math.max(
                  totalAmount * (cfg.partialDepositPercent / 100),
                  minDepositUsd,
                ).toFixed(2),
              )
            : totalAmount;
        const codBalance =
          paymentPlan === 'PARTIAL_COD'
            ? Number(Math.max(0, totalAmount - depositDueNow).toFixed(2))
            : 0;

        const metaFields: Record<string, string> = {
          paymentPlan,
          shippingFee: shippingFee.toFixed(2),
          depositDueNow: depositDueNow.toFixed(2),
          depositDueNowVnd: Math.round(
            depositDueNow * cfg.usdToVndRate,
          ).toString(),
          codBalance: codBalance.toFixed(2),
          fulfillmentStatus: 'PENDING',
          trackingNumber: '',
          shippingCarrier: '',
          fulfillmentNote: 'Đơn hàng đã tiếp nhận, đang chờ xác nhận thanh toán',
          fulfillmentUpdatedAt: new Date().toISOString(),
          isDepositPaid: 'false',
          isFullyPaid: 'false',
        };
        metaFields.fullName = recipientFullName;
        metaFields.phone = recipientPhone;
        metaFields.address = recipientAddress;
        if (recipientNotes) metaFields.notes = recipientNotes;

        const client = this.redisService.getClient();
        const pipeline = client.pipeline();
        pipeline.hset(`order:meta:${createdOrder.id}`, metaFields);

        const normPhone = this.normalizePhoneNumber(recipientPhone);
        if (normPhone) {
          pipeline.sadd(`orders:by_phone:${normPhone}`, createdOrder.id);
          pipeline.set(`order:phone:${createdOrder.id}`, normPhone);
        }
        await pipeline.exec();

        await this.backfillUserProfileFromOrderIfMissing(
          targetUserId,
          recipientFullName,
          recipientPhone,
          recipientAddress,
        );
      }

      const processingTimeMs = Number(
        (performance.now() - startTime).toFixed(2),
      );

      const response: FlashCheckoutResponseDto = {
        orderId: createdOrder.id,
        status:
          createdOrder.status as unknown as FlashCheckoutResponseDto['status'],
        totalAmount: Number(createdOrder.total_amount),
        idempotencyKey: createdOrder.idempotency_key,
        processingTimeMs,
        createdAt: createdOrder.created_at.toISOString(),
      };

      if (!skipRedisProtection) {
        await this.redisService.saveIdempotencyResponse(
          'checkout',
          normalizedKey,
          requestHash,
          201,
          response,
        );
      }

      // 5. Publish OrderCreated event asynchronously to Kafka/Redpanda + Delayed Expiration Queue
      this.kafkaEventService.emitOrderCreated({
        orderId: createdOrder.id,
        userId,
        productId: dto.productId,
        quantity: dto.quantity,
        totalAmount,
        idempotencyKey: normalizedKey,
        createdAt: createdOrder.created_at.toISOString(),
      });

      if (!skipRedisProtection) {
        this.logger.log(
          JSON.stringify({
            event: 'ORDER_STATE_TRANSITION',
            orderId: createdOrder.id,
            from: null,
            to: OrderStatus.PENDING,
            productId: dto.productId,
            quantity: dto.quantity,
            totalAmount,
            processingTimeMs,
          }),
        );
      }

      return response;
    } catch (error) {
      if (redisStockReserved) {
        await this.inventoryService.rollbackRedisStock(
          dto.productId,
          dto.quantity,
        );
      }
      if (!skipRedisProtection) {
        await this.redisService.clearIdempotencyRecord('checkout', normalizedKey);
      }
      throw error;
    } finally {
      if (lockHandle) {
        await this.inventoryService.releaseProductWriteLock(lockHandle);
      }
    }
  }

  /**
   * Multi-item / Custom Order creation with Tiered Single-Discount-Unit Pricing:
   * For any product ordered with quantity >= 2 (or across duplicate lines),
   * only 1 unit gets the discounted price, while additional units return to normal price.
   */
  async createOrder(
    userId: string,
    idempotencyKey: string | undefined,
    dto: CreateOrderDto,
  ) {
    const startTime = performance.now();
    const normalizedKey =
      idempotencyKey && idempotencyKey.trim().length >= 4
        ? idempotencyKey.trim()
        : `order_${randomUUID()}`;

    // Merge duplicate productIds in items array so buying the same product twice in one order
    // strictly applies the "only 1 unit gets discounted price" rule!
    const mergedMap = new Map<string, number>();
    for (const item of dto.items) {
      mergedMap.set(
        item.productId,
        (mergedMap.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const itemsList = Array.from(mergedMap.entries()).map(
      ([productId, quantity]) => ({
        productId,
        quantity,
      }),
    );

    let targetUserId = userId;
    if (dto.customerEmail) {
      const foundUser = await this.prisma.user.findUnique({
        where: { email: dto.customerEmail.trim().toLowerCase() },
      });
      if (!foundUser) {
        throw new NotFoundException(
          `Customer with email "${dto.customerEmail}" not found`,
        );
      }
      targetUserId = foundUser.id;
    } else if (this.prisma.user?.findUnique) {
      const userExists = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!userExists) {
        const fallbackUser =
          (await this.prisma.user.findFirst({
            where: { role: Role.CUSTOMER },
            select: { id: true },
          })) ?? (await this.prisma.user.findFirst({ select: { id: true } }));
        if (fallbackUser) {
          targetUserId = fallbackUser.id;
        }
      }
    }

    let recipientFullName = dto.fullName?.trim();
    let recipientPhone = dto.phone?.trim();
    let recipientAddress = dto.address?.trim();
    const recipientNotes = dto.notes?.trim() || '';

    // If missing from payload, check if target user has a saved profile in Redis
    if (
      (!recipientFullName || !recipientPhone || !recipientAddress) &&
      this.redisService?.getClient
    ) {
      try {
        const savedProfile = await this.redisService
          .getClient()
          .hgetall(`user:profile:${targetUserId}`);
        if (!recipientFullName && savedProfile?.fullName) {
          recipientFullName = savedProfile.fullName;
        }
        if (!recipientPhone && savedProfile?.phone) {
          recipientPhone = savedProfile.phone;
        }
        if (!recipientAddress && savedProfile?.address) {
          recipientAddress = savedProfile.address;
        }
      } catch {
        // Ignore redis lookup errors
      }
    }

    if (!recipientFullName || !recipientPhone || !recipientAddress) {
      throw new BadRequestException(
        'Họ tên người nhận, số điện thoại và địa chỉ nhận hàng là bắt buộc đối với tất cả đơn hàng.',
      );
    }

    const reservedInRedis: Array<{ productId: string; quantity: number }> = [];

    try {
      const dbOrderItemRows: Array<{
        product_id: string;
        quantity: number;
        price_at_purchase: number;
      }> = [];
      let itemsSubtotal = 0;

      for (const item of itemsList) {
        await this.inventoryService.preDecrementRedisStock(
          item.productId,
          item.quantity,
        );
        reservedInRedis.push(item);

        const meta = await this.productsService.getProductPriceAndStatusFast(
          item.productId,
        );

        const isFlashSale = meta.status === ProductStatus.FLASH_SALE;
        const tiered = this.computeTieredProductLine(
          item.productId,
          item.quantity,
          meta.price,
          meta.originalPrice,
          isFlashSale,
        );

        itemsSubtotal += tiered.lineTotal;
        dbOrderItemRows.push(...tiered.dbItemRows);
      }

      const cfg = await this.getCheckoutConfig();
      const paymentPlan = dto.paymentPlan ?? 'FULL_TRANSFER';
      const shippingFee =
        paymentPlan === 'PARTIAL_COD' ? cfg.codShippingFee : 0;
      const totalAmount = Number((itemsSubtotal + shippingFee).toFixed(2));

      const createdOrder = await this.prisma.$transaction(async (tx) => {
        for (const item of itemsList) {
          await this.inventoryService.reserveStockInDbTransaction(
            tx,
            item.productId,
            item.quantity,
          );
        }

        return tx.order.create({
          data: {
            user_id: targetUserId,
            total_amount: totalAmount,
            status: OrderStatus.PENDING,
            idempotency_key: normalizedKey,
            items: {
              create: dbOrderItemRows,
            },
          },
        });
      });

      if (this.redisService.getClient) {
        const minDepositUsd = Number(
          (cfg.minDepositVnd / cfg.usdToVndRate).toFixed(2),
        );
        const depositDueNow =
          paymentPlan === 'PARTIAL_COD'
            ? Number(
                Math.max(
                  totalAmount * (cfg.partialDepositPercent / 100),
                  minDepositUsd,
                ).toFixed(2),
              )
            : totalAmount;
        const codBalance =
          paymentPlan === 'PARTIAL_COD'
            ? Number(Math.max(0, totalAmount - depositDueNow).toFixed(2))
            : 0;

        const metaFields: Record<string, string> = {
          paymentPlan,
          shippingFee: shippingFee.toFixed(2),
          depositDueNow: depositDueNow.toFixed(2),
          depositDueNowVnd: Math.round(
            depositDueNow * cfg.usdToVndRate,
          ).toString(),
          codBalance: codBalance.toFixed(2),
          fulfillmentStatus: 'PENDING',
          trackingNumber: '',
          shippingCarrier: '',
          fulfillmentNote: 'Đơn hàng đã tiếp nhận, đang chờ xác nhận thanh toán',
          fulfillmentUpdatedAt: new Date().toISOString(),
          isDepositPaid: 'false',
          isFullyPaid: 'false',
        };
        metaFields.fullName = recipientFullName;
        metaFields.phone = recipientPhone;
        metaFields.address = recipientAddress;
        if (recipientNotes) metaFields.notes = recipientNotes;

        await this.redisService
          .getClient()
          .hset(`order:meta:${createdOrder.id}`, metaFields);

        const normPhone = this.normalizePhoneNumber(recipientPhone);
        if (normPhone) {
          await this.redisService
            .getClient()
            .sadd(`orders:by_phone:${normPhone}`, createdOrder.id);
          await this.redisService
            .getClient()
            .set(`order:phone:${createdOrder.id}`, normPhone);
        }

        await this.backfillUserProfileFromOrderIfMissing(
          targetUserId,
          recipientFullName,
          recipientPhone,
          recipientAddress,
        );
      }

      const firstItem = itemsList[0];
      if (firstItem) {
        this.kafkaEventService.emitOrderCreated({
          orderId: createdOrder.id,
          userId: targetUserId,
          productId: firstItem.productId,
          quantity: firstItem.quantity,
          totalAmount,
          idempotencyKey: normalizedKey,
          createdAt: createdOrder.created_at.toISOString(),
        });
      }

      const processingTimeMs = Number(
        (performance.now() - startTime).toFixed(2),
      );
      this.logger.log(
        JSON.stringify({
          event: 'MULTI_ITEM_ORDER_CREATED',
          orderId: createdOrder.id,
          userId: targetUserId,
          itemCount: itemsList.length,
          totalAmount,
          processingTimeMs,
        }),
      );

      return this.findOrderById(createdOrder.id);
    } catch (error) {
      for (const item of reservedInRedis) {
        await this.inventoryService.rollbackRedisStock(
          item.productId,
          item.quantity,
        );
      }
      throw error;
    }
  }

  async updateOrderPaymentPlan(
    orderId: string,
    paymentPlan: 'FULL_TRANSFER' | 'PARTIAL_COD',
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const cfg = await this.getCheckoutConfig();
    const itemsSubtotal = order.items.reduce(
      (sum, item) => sum + Number(item.price_at_purchase) * item.quantity,
      0,
    );
    const shippingFee = paymentPlan === 'FULL_TRANSFER' ? 0 : cfg.codShippingFee;
    const totalAmount = Number((itemsSubtotal + shippingFee).toFixed(2));

    const minDepositUsd =
      Math.round((cfg.minDepositVnd / cfg.usdToVndRate) * 100) / 100;
    const rawTenPercentUsd =
      Math.round(totalAmount * (cfg.partialDepositPercent / 100) * 100) / 100;
    const partialDepositUsd = Math.min(
      totalAmount,
      Math.max(rawTenPercentUsd, minDepositUsd),
    );
    const partialDepositVnd = Math.max(
      cfg.minDepositVnd,
      Math.round(partialDepositUsd * cfg.usdToVndRate),
    );

    const depositDueNow =
      paymentPlan === 'FULL_TRANSFER' ? totalAmount : partialDepositUsd;
    const depositDueNowVnd =
      paymentPlan === 'FULL_TRANSFER'
        ? Math.round(totalAmount * cfg.usdToVndRate)
        : partialDepositVnd;
    const codBalance =
      paymentPlan === 'FULL_TRANSFER'
        ? 0
        : Math.max(0, Number((totalAmount - partialDepositUsd).toFixed(2)));

    await this.prisma.order.update({
      where: { id: orderId },
      data: { total_amount: totalAmount },
    });

    await this.redisService.getClient().hset(`order:meta:${order.id}`, {
      paymentPlan,
      shippingFee: shippingFee.toFixed(2),
      depositDueNow: depositDueNow.toFixed(2),
      depositDueNowVnd: depositDueNowVnd.toString(),
      codBalance: codBalance.toFixed(2),
      paymentPlanConfirmed: 'true',
    });

    return this.findOrderById(order.id);
  }

  async findOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                slug: true,
                status: true,
                price: true,
              },
            },
          },
        },
        payments: {
          orderBy: { created_at: 'desc' },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const [rawNotifications, orderMeta, checkoutCfg] = await Promise.all([
      this.redisService
        .getClient()
        .lrange(`notifications:order:${order.id}`, 0, 10),
      this.redisService.getClient().hgetall(`order:meta:${order.id}`),
      this.getCheckoutConfig(),
    ]);

    const notifications = rawNotifications.map(
      (item) => JSON.parse(item) as unknown,
    );

    const expiresAtMs = order.created_at.getTime() + 15 * 60 * 1000;
    const remainingSeconds =
      order.status === OrderStatus.PENDING
        ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
        : 0;

    const totalAmount = Number(order.total_amount);
    const paymentPlan =
      (orderMeta?.paymentPlan as 'FULL_TRANSFER' | 'PARTIAL_COD') ||
      'FULL_TRANSFER';
    const shippingFee = orderMeta?.shippingFee
      ? Number(orderMeta.shippingFee)
      : 0;
    const depositDueNow = orderMeta?.depositDueNow
      ? Number(orderMeta.depositDueNow)
      : totalAmount;
    const depositDueNowVnd = orderMeta?.depositDueNowVnd
      ? Number(orderMeta.depositDueNowVnd)
      : Math.round(depositDueNow * checkoutCfg.usdToVndRate);
    const codBalance = orderMeta?.codBalance
      ? Number(orderMeta.codBalance)
      : 0;

    const fulfillmentStatus =
      (orderMeta?.fulfillmentStatus as string) || 'PENDING';
    const trackingNumber = orderMeta?.trackingNumber || '';
    const shippingCarrier = orderMeta?.shippingCarrier || '';
    const fulfillmentNote = orderMeta?.fulfillmentNote || '';
    const fulfillmentUpdatedAt = orderMeta?.fulfillmentUpdatedAt || null;

    const isDepositPaid =
      order.status === OrderStatus.DEPOSIT_PAID ||
      order.status === OrderStatus.PAID ||
      orderMeta?.isDepositPaid === 'true';
    const isFullyPaid =
      order.status === OrderStatus.PAID || orderMeta?.isFullyPaid === 'true';
    const depositPaidAt = orderMeta?.depositPaidAt || null;
    const fullyPaidAt = orderMeta?.fullyPaidAt || null;

    return {
      id: order.id,
      user_id: order.user_id,
      user: order.user,
      total_amount: totalAmount,
      status: order.status,
      idempotency_key: order.idempotency_key,
      created_at: order.created_at.toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      remaining_seconds: remainingSeconds,
      fulfillment: {
        status: fulfillmentStatus,
        trackingNumber,
        shippingCarrier,
        note: fulfillmentNote,
        updatedAt: fulfillmentUpdatedAt,
      },
      payment_meta: {
        paymentPlan,
        shippingFee,
        depositDueNow,
        depositDueNowVnd,
        codBalance,
        isDepositPaid,
        isFullyPaid,
        depositPaidAt,
        fullyPaidAt,
      },
      customer_info: {
        fullName: orderMeta?.fullName || '',
        phone: orderMeta?.phone || '',
        address: orderMeta?.address || '',
        notes: orderMeta?.notes || '',
      },
      payment_plan_confirmed: orderMeta?.paymentPlanConfirmed === 'true',
      items: order.items.map((item) => ({
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_purchase: Number(item.price_at_purchase),
        is_discounted_unit:
          item.product?.price !== undefined
            ? Number(item.price_at_purchase) <= Number(item.product.price)
            : true,
        product: item.product
          ? {
              id: item.product.id,
              title: item.product.title,
              slug: item.product.slug,
              status: item.product.status,
            }
          : undefined,
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        order_id: p.order_id,
        transaction_id: p.transaction_id,
        provider: p.provider,
        amount: Number(p.amount),
        status: p.status,
        created_at: p.created_at.toISOString(),
      })),
      notifications,
    };
  }

  /**
   * Guest & Public Order Lookup:
   * Enables customers to track and recover orders using their phone number and optional order code (DH... or UUID prefix).
   */
  async lookupOrder(phone: string, orderCode?: string) {
    const normPhone = this.normalizePhoneNumber(phone);
    if (!normPhone || normPhone.length < 8) {
      throw new BadRequestException(
        'Số điện thoại tra cứu không hợp lệ (tối thiểu 8 chữ số)',
      );
    }

    const candidateIds = new Set<string>();

    if (this.redisService.getClient) {
      try {
        const idsFromPhone = await this.redisService
          .getClient()
          .smembers(`orders:by_phone:${normPhone}`);
        for (const id of idsFromPhone) {
          candidateIds.add(id);
        }
      } catch {
        // Redis lookup fallback
      }
    }

    if (orderCode && orderCode.trim()) {
      const cleanCode = orderCode
        .trim()
        .replace(/^(DH|#AURA-|#)/i, '')
        .trim()
        .toLowerCase();

      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          cleanCode,
        )
      ) {
        candidateIds.add(cleanCode);
      } else if (cleanCode.length >= 4) {
        try {
          const matched = await this.prisma.$queryRawUnsafe<
            Array<{ id: string }>
          >(`SELECT id FROM orders WHERE id::text LIKE $1 LIMIT 10`, `${cleanCode}%`);
          for (const row of matched) {
            candidateIds.add(row.id);
          }
        } catch {
          // SQL error fallback
        }
      }
    }

    if (candidateIds.size === 0) {
      const recentOrders = await this.prisma.order.findMany({
        orderBy: { created_at: 'desc' },
        take: 50,
        select: { id: true },
      });
      for (const o of recentOrders) {
        if (this.redisService.getClient) {
          const meta = await this.redisService
            .getClient()
            .hgetall(`order:meta:${o.id}`);
          if (
            meta?.phone &&
            this.normalizePhoneNumber(meta.phone) === normPhone
          ) {
            candidateIds.add(o.id);
          }
        }
      }
    }

    const matchedOrders: Array<Awaited<ReturnType<OrdersService['findOrderById']>>> = [];
    for (const id of candidateIds) {
      try {
        const order = await this.findOrderById(id);
        const orderPhone = this.normalizePhoneNumber(
          order.customer_info?.phone || '',
        );

        if (
          orderPhone === normPhone ||
          (!order.customer_info?.phone && candidateIds.size === 1)
        ) {
          matchedOrders.push(order);
        }
      } catch {
        // Skip invalid order IDs
      }
    }

    matchedOrders.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return matchedOrders;
  }

  /**
   * Update order fulfillment status, carrier, tracking code, and note
   */
  async updateOrderFulfillment(
    orderId: string,
    dto: {
      status: 'PENDING' | 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED';
      trackingNumber?: string;
      shippingCarrier?: string;
      note?: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const updates: Record<string, string> = {
      fulfillmentStatus: dto.status,
      fulfillmentUpdatedAt: new Date().toISOString(),
    };

    if (dto.trackingNumber !== undefined) {
      updates.trackingNumber = dto.trackingNumber.trim();
    }
    if (dto.shippingCarrier !== undefined) {
      updates.shippingCarrier = dto.shippingCarrier.trim();
    }
    if (dto.note !== undefined) {
      updates.fulfillmentNote = dto.note.trim();
    }

    if (this.redisService.getClient) {
      await this.redisService
        .getClient()
        .hset(`order:meta:${order.id}`, updates);

      const statusLabels: Record<string, string> = {
        PENDING: 'Chờ xử lý tại kho',
        PACKING: 'Đang đóng gói tại kho',
        SHIPPING: 'Đang vận chuyển giao hàng',
        DELIVERED: 'Giao hàng thành công',
        RETURNED: 'Hoàn hàng / Giao không thành công',
      };

      const notif = {
        id: randomUUID(),
        title: 'Cập nhật tiến trình vận chuyển',
        message: `Đơn hàng đã được chuyển sang: ${statusLabels[dto.status] || dto.status}${dto.trackingNumber ? ` — Mã vận đơn: ${dto.trackingNumber}` : ''}`,
        createdAt: new Date().toISOString(),
      };
      await this.redisService
        .getClient()
        .lpush(`notifications:order:${order.id}`, JSON.stringify(notif));
    }

    return this.findOrderById(order.id);
  }

  async findUserOrders(
    userId?: string,
    includeAll = false,
    status?: OrderStatus,
  ) {
    const where: { user_id?: string; status?: OrderStatus } = {};
    if (!includeAll && userId) {
      where.user_id = userId;
    }
    if (status) {
      where.status = status;
    }

    const orders = await this.prisma.order.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                slug: true,
                status: true,
                price: true,
              },
            },
          },
        },
        payments: {
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 300,
    });

    return Promise.all(
      orders.map(async (order) => {
        const expiresAtMs = order.created_at.getTime() + 15 * 60 * 1000;
        const remainingSeconds =
          order.status === OrderStatus.PENDING
            ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
            : 0;

        let orderMeta: Record<string, string> | null = null;
        if (this.redisService.getClient) {
          try {
            orderMeta = await this.redisService
              .getClient()
              .hgetall(`order:meta:${order.id}`);
          } catch {
            // ignore
          }
        }

        const fulfillmentStatus =
          (orderMeta?.fulfillmentStatus as string) || 'PENDING';
        const trackingNumber = orderMeta?.trackingNumber || '';
        const shippingCarrier = orderMeta?.shippingCarrier || '';
        const fulfillmentNote = orderMeta?.fulfillmentNote || '';
        const fulfillmentUpdatedAt = orderMeta?.fulfillmentUpdatedAt || null;

        const totalAmount = Number(order.total_amount);
        const paymentPlan =
          (orderMeta?.paymentPlan as 'FULL_TRANSFER' | 'PARTIAL_COD') ||
          'FULL_TRANSFER';
        const shippingFee = orderMeta?.shippingFee
          ? Number(orderMeta.shippingFee)
          : 0;
        const depositDueNow = orderMeta?.depositDueNow
          ? Number(orderMeta.depositDueNow)
          : totalAmount;
        const codBalance = orderMeta?.codBalance
          ? Number(orderMeta.codBalance)
          : 0;

        const isDepositPaid =
          order.status === OrderStatus.DEPOSIT_PAID ||
          order.status === OrderStatus.PAID ||
          orderMeta?.isDepositPaid === 'true';
        const isFullyPaid =
          order.status === OrderStatus.PAID || orderMeta?.isFullyPaid === 'true';

        return {
          id: order.id,
          user_id: order.user_id,
          user: order.user,
          total_amount: totalAmount,
          status: order.status,
          idempotency_key: order.idempotency_key,
          created_at: order.created_at.toISOString(),
          expires_at: new Date(expiresAtMs).toISOString(),
          remaining_seconds: remainingSeconds,
          fulfillment: {
            status: fulfillmentStatus,
            trackingNumber,
            shippingCarrier,
            note: fulfillmentNote,
            updatedAt: fulfillmentUpdatedAt,
          },
          payment_meta: {
            paymentPlan,
            shippingFee,
            depositDueNow,
            depositDueNowVnd: orderMeta?.depositDueNowVnd
              ? Number(orderMeta.depositDueNowVnd)
              : depositDueNow,
            codBalance,
            isDepositPaid,
            isFullyPaid,
            depositPaidAt: orderMeta?.depositPaidAt || null,
            fullyPaidAt: orderMeta?.fullyPaidAt || null,
          },
          customer_info: {
            fullName: orderMeta?.fullName || '',
            phone: orderMeta?.phone || '',
            address: orderMeta?.address || '',
            notes: orderMeta?.notes || '',
          },
          items: order.items.map((item) => ({
            id: item.id,
            order_id: item.order_id,
            product_id: item.product_id,
            quantity: item.quantity,
            price_at_purchase: Number(item.price_at_purchase),
            is_discounted_unit:
              item.product?.price !== undefined
                ? Number(item.price_at_purchase) <= Number(item.product.price)
                : true,
            product: item.product
              ? {
                  id: item.product.id,
                  title: item.product.title,
                  slug: item.product.slug,
                  status: item.product.status,
                }
              : undefined,
          })),
          payments: order.payments.map((p) => ({
            id: p.id,
            order_id: p.order_id,
            transaction_id: p.transaction_id,
            provider: p.provider,
            amount: Number(p.amount),
            status: p.status,
            created_at: p.created_at.toISOString(),
          })),
          notifications: [],
        };
      }),
    );
  }

  async cancelOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        `Cannot cancel order in state ${order.status}; only PENDING orders can be cancelled`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Order state changed concurrently');
      }

      for (const item of order.items) {
        await this.inventoryService.releaseReservedStockOnExpiry(
          tx,
          item.product_id,
          item.quantity,
        );
      }
    });

    await this.orderExpirationWorker.cancelScheduledExpiration(orderId);

    this.logger.log(
      JSON.stringify({
        event: 'ORDER_STATE_TRANSITION',
        orderId,
        from: OrderStatus.PENDING,
        to: OrderStatus.CANCELLED,
      }),
    );

    return this.findOrderById(orderId);
  }

  /**
   * Admin Order Status Manager:
   * Allows transitioning an order between PENDING, PAID, CANCELLED, and EXPIRED
   * while maintaining strict PostgreSQL & Redis stock conservation.
   */
  async adminUpdateOrderStatus(orderId: string, nextStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const prevStatus = order.status;
    if (prevStatus === nextStatus) {
      return this.findOrderById(orderId);
    }

    if (
      prevStatus === OrderStatus.PENDING &&
      nextStatus === OrderStatus.DEPOSIT_PAID
    ) {
      const orderMeta = await this.redisService
        .getClient()
        .hgetall(`order:meta:${order.id}`);
      const depositDueNow = orderMeta?.depositDueNow
        ? Number(orderMeta.depositDueNow)
        : Math.round(Number(order.total_amount) * 0.1);
      const txId = `tx_dep_${order.id.slice(0, 8)}_${randomUUID().slice(0, 6)}`;

      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.DEPOSIT_PAID },
        });
        await tx.payment.create({
          data: {
            order_id: orderId,
            transaction_id: txId,
            provider: 'BANK_QR_DEPOSIT',
            amount: depositDueNow,
            status: PaymentStatus.COMPLETED,
            raw_payload: {
              settledBy: 'ADMIN_DEPOSIT_VERIFICATION',
              type: 'DEPOSIT_10_PERCENT',
              settledAt: new Date().toISOString(),
            },
          },
        });
        for (const item of order.items) {
          await this.inventoryService.commitPermanentStockDecrement(
            tx,
            item.product_id,
            item.quantity,
          );
        }
      });

      await this.orderExpirationWorker.cancelScheduledExpiration(orderId);

      await this.redisService.getClient().hset(`order:meta:${order.id}`, {
        isDepositPaid: 'true',
        depositPaidAt: new Date().toISOString(),
        fulfillmentStatus: 'PACKING',
        fulfillmentNote:
          'Đã nhận cọc 10%. Đơn hàng đang được kho tiến hành đóng gói.',
        fulfillmentUpdatedAt: new Date().toISOString(),
      });
    } else if (
      prevStatus === OrderStatus.DEPOSIT_PAID &&
      nextStatus === OrderStatus.PAID
    ) {
      const orderMeta = await this.redisService
        .getClient()
        .hgetall(`order:meta:${order.id}`);
      const codBalance = orderMeta?.codBalance
        ? Number(orderMeta.codBalance)
        : 0;
      const txId = `tx_cod_${order.id.slice(0, 8)}_${randomUUID().slice(0, 6)}`;

      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAID },
        });
        if (codBalance > 0) {
          await tx.payment.create({
            data: {
              order_id: orderId,
              transaction_id: txId,
              provider: 'COD_CASH_ON_DELIVERY',
              amount: codBalance,
              status: PaymentStatus.COMPLETED,
              raw_payload: {
                settledBy: 'ADMIN_COD_SETTLEMENT',
                type: 'COD_COLLECTED_AT_DELIVERY',
                settledAt: new Date().toISOString(),
              },
            },
          });
        }
      });

      await this.redisService.getClient().hset(`order:meta:${order.id}`, {
        isFullyPaid: 'true',
        fullyPaidAt: new Date().toISOString(),
        fulfillmentStatus: 'DELIVERED',
        fulfillmentNote: 'Đã hoàn tất giao hàng và thu đủ tiền COD.',
        fulfillmentUpdatedAt: new Date().toISOString(),
      });
    } else if (
      (prevStatus === OrderStatus.PENDING ||
        prevStatus === OrderStatus.DEPOSIT_PAID) &&
      nextStatus === OrderStatus.PAID
    ) {
      const txId = `tx_qr_${order.id.slice(0, 8)}_${randomUUID().slice(0, 6)}`;
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAID },
        });
        await tx.payment.create({
          data: {
            order_id: orderId,
            transaction_id: txId,
            provider: 'BANK_QR_TRANSFER',
            amount: order.total_amount,
            status: PaymentStatus.COMPLETED,
            raw_payload: {
              settledBy: 'ADMIN_BANK_VERIFICATION',
              settledAt: new Date().toISOString(),
            },
          },
        });
        if (prevStatus === OrderStatus.PENDING) {
          for (const item of order.items) {
            await this.inventoryService.commitPermanentStockDecrement(
              tx,
              item.product_id,
              item.quantity,
            );
          }
        }
      });

      await this.orderExpirationWorker.cancelScheduledExpiration(orderId);

      await this.redisService.getClient().hset(`order:meta:${order.id}`, {
        isDepositPaid: 'true',
        isFullyPaid: 'true',
        fullyPaidAt: new Date().toISOString(),
      });

      const firstItem = order.items[0];
      this.kafkaEventService.emitOrderPaid({
        orderId: order.id,
        userId: order.user_id,
        productId: firstItem?.product_id ?? '',
        quantity: firstItem?.quantity ?? 1,
        transactionId: txId,
        amount: Number(order.total_amount),
        paidAt: new Date().toISOString(),
      });
    } else if (
      prevStatus === OrderStatus.PENDING &&
      (nextStatus === OrderStatus.CANCELLED ||
        nextStatus === OrderStatus.EXPIRED)
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
        });
        for (const item of order.items) {
          await this.inventoryService.releaseReservedStockOnExpiry(
            tx,
            item.product_id,
            item.quantity,
          );
        }
      });
      await this.orderExpirationWorker.cancelScheduledExpiration(orderId);
    } else if (
      (prevStatus === OrderStatus.PAID ||
        prevStatus === OrderStatus.DEPOSIT_PAID) &&
      (nextStatus === OrderStatus.CANCELLED ||
        nextStatus === OrderStatus.EXPIRED)
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
        });
        await tx.payment.updateMany({
          where: { order_id: orderId },
          data: { status: PaymentStatus.REFUNDED },
        });
        for (const item of order.items) {
          await tx.inventory.update({
            where: { product_id: item.product_id },
            data: {
              total_stock: { increment: item.quantity },
              version: { increment: 1 },
            },
          });
          await this.redisService.atomicReleaseStock(
            item.product_id,
            item.quantity,
          );
        }
      });
    } else if (
      (prevStatus === OrderStatus.CANCELLED ||
        prevStatus === OrderStatus.EXPIRED) &&
      nextStatus === OrderStatus.PENDING
    ) {
      for (const item of order.items) {
        await this.inventoryService.preDecrementRedisStock(
          item.product_id,
          item.quantity,
        );
      }
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await this.inventoryService.reserveStockInDbTransaction(
            tx,
            item.product_id,
            item.quantity,
          );
        }
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PENDING },
        });
      });
    } else {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'ADMIN_ORDER_STATUS_UPDATED',
        orderId,
        from: prevStatus,
        to: nextStatus,
      }),
    );

    return this.findOrderById(orderId);
  }

  async deleteOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      if (order.status === OrderStatus.PENDING) {
        for (const item of order.items) {
          await this.inventoryService.releaseReservedStockOnExpiry(
            tx,
            item.product_id,
            item.quantity,
          );
        }
      }
      await tx.payment.deleteMany({ where: { order_id: orderId } });
      await tx.orderItem.deleteMany({ where: { order_id: orderId } });
      await tx.order.delete({ where: { id: orderId } });
    });

    await this.orderExpirationWorker.cancelScheduledExpiration(orderId);

    return {
      deletedId: orderId,
      previousStatus: order.status,
    };
  }

  async getAdminDashboardOverview() {
    const [orders, products, users] = await Promise.all([
      this.prisma.order.findMany({
        select: {
          id: true,
          status: true,
          total_amount: true,
          created_at: true,
        },
      }),
      this.prisma.product.findMany({
        include: { inventory: true },
      }),
      this.prisma.user.findMany({
        select: { id: true, role: true },
      }),
    ]);

    const paidOrders = orders.filter((o) => o.status === OrderStatus.PAID);
    const pendingOrders = orders.filter(
      (o) => o.status === OrderStatus.PENDING,
    );
    const cancelledOrders = orders.filter(
      (o) => o.status === OrderStatus.CANCELLED,
    );
    const expiredOrders = orders.filter(
      (o) => o.status === OrderStatus.EXPIRED,
    );

    const totalRevenue = paidOrders.reduce(
      (sum, o) => sum + Number(o.total_amount),
      0,
    );
    const pendingRevenue = pendingOrders.reduce(
      (sum, o) => sum + Number(o.total_amount),
      0,
    );

    let totalAvailableUnits = 0;
    let totalReservedUnits = 0;

    for (const p of products) {
      const total = p.inventory?.total_stock ?? 0;
      const reserved = p.inventory?.reserved_stock ?? 0;
      totalAvailableUnits += Math.max(0, total - reserved);
      totalReservedUnits += reserved;
    }

    return {
      revenue: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        pendingRevenue: Number(pendingRevenue.toFixed(2)),
      },
      orders: {
        total: orders.length,
        paid: paidOrders.length,
        pending: pendingOrders.length,
        cancelled: cancelledOrders.length,
        expired: expiredOrders.length,
      },
      products: {
        total: products.length,
        flashSale: products.filter(
          (p) => p.status === ProductStatus.FLASH_SALE,
        ).length,
        active: products.filter((p) => p.status === ProductStatus.ACTIVE)
          .length,
        outOfStock: products.filter(
          (p) =>
            p.status === ProductStatus.OUT_OF_STOCK ||
            (p.inventory?.total_stock ?? 0) -
              (p.inventory?.reserved_stock ?? 0) <=
              0,
        ).length,
        archived: products.filter((p) => p.status === ProductStatus.ARCHIVED)
          .length,
        totalAvailableUnits,
        totalReservedUnits,
      },
      users: {
        total: users.length,
        admins: users.filter((u) => u.role === Role.ADMIN).length,
        customers: users.filter((u) => u.role === Role.CUSTOMER).length,
      },
    };
  }

  private computeRequestHash(dto: FlashCheckoutDto): string {
    return createHash('sha256')
      .update(`${dto.productId}:${dto.quantity}`)
      .digest('hex');
  }
}
