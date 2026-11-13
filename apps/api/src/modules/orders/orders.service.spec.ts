import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { KafkaEventService } from '../../workers/kafka-event.service';
import { OrderExpirationWorker } from '../../workers/order-expiration.worker';

describe('OrdersService - Flash Checkout Atomicity & Idempotency Tests', () => {
  let ordersService: OrdersService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockRedis: jest.Mocked<Partial<RedisService>>;
  let mockInventory: jest.Mocked<Partial<InventoryService>>;
  let mockProducts: jest.Mocked<Partial<ProductsService>>;
  let mockKafka: jest.Mocked<Partial<KafkaEventService>>;
  let mockExpiration: jest.Mocked<Partial<OrderExpirationWorker>>;

  const USER_ID = '00000000-0000-4000-8000-000000000002';
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111101';

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: USER_ID }),
        findFirst: jest.fn().mockResolvedValue({ id: USER_ID }),
      } as unknown as PrismaService['user'],
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
      } as unknown as PrismaService['order'],
      $transaction: jest.fn(),
    };

    mockRedis = {
      getIdempotencyRecord: jest.fn().mockResolvedValue(null),
      acquireIdempotencyLock: jest.fn().mockResolvedValue(true),
      saveIdempotencyResponse: jest.fn().mockResolvedValue(undefined),
      clearIdempotencyRecord: jest.fn().mockResolvedValue(undefined),
    };

    mockInventory = {
      preDecrementRedisStock: jest.fn().mockResolvedValue(49),
      rollbackRedisStock: jest.fn().mockResolvedValue(undefined),
      acquireProductWriteLock: jest.fn().mockResolvedValue({
        lockKey: `lock:inventory:${PRODUCT_ID}`,
        token: 'lock-token-1',
        ttlMs: 3000,
        acquiredAt: Date.now(),
      }),
      releaseProductWriteLock: jest.fn().mockResolvedValue(true),
      reserveStockInDbTransaction: jest.fn().mockResolvedValue({
        id: 'inv-1',
        product_id: PRODUCT_ID,
        total_stock: 50,
        reserved_stock: 1,
        version: 2,
      }),
    };

    mockProducts = {
      getProductPriceAndStatusFast: jest.fn().mockResolvedValue({
        id: PRODUCT_ID,
        price: 50990000,
        title: 'RTX 5090',
        status: 'FLASH_SALE',
      }),
    };

    mockKafka = {
      emitOrderCreated: jest.fn(),
    };

    mockExpiration = {
      cancelScheduledExpiration: jest.fn(),
    };

    ordersService = new OrdersService(
      mockPrisma as PrismaService,
      mockRedis as RedisService,
      mockInventory as InventoryService,
      mockProducts as ProductsService,
      mockKafka as KafkaEventService,
      mockExpiration as OrderExpirationWorker,
    );
  });

  it('rejects requests missing X-Idempotency-Key', async () => {
    await expect(
      ordersService.executeFlashCheckout(USER_ID, '', {
        productId: PRODUCT_ID,
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('executes full atomic flow: Redis decrement -> Lock -> DB tx -> Kafka event -> Release lock', async () => {
    const fakeCreatedAt = new Date('2026-11-05T07:00:00.000Z');
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        order: {
          create: jest.fn().mockResolvedValue({
            id: 'order-uuid-1',
            user_id: USER_ID,
            total_amount: 50990000,
            status: OrderStatus.PENDING,
            idempotency_key: 'idem-key-001',
            created_at: fakeCreatedAt,
          }),
        },
      }),
    );

    const res = await ordersService.executeFlashCheckout(
      USER_ID,
      'idem-key-001',
      { productId: PRODUCT_ID, quantity: 1 },
    );

    expect(res.orderId).toBe('order-uuid-1');
    expect(res.status).toBe(OrderStatus.PENDING);
    expect(res.totalAmount).toBe(50990000);
    expect(mockInventory.preDecrementRedisStock).toHaveBeenCalledWith(
      PRODUCT_ID,
      1,
    );
    expect(mockInventory.acquireProductWriteLock).toHaveBeenCalledWith(
      PRODUCT_ID,
      5000,
    );
    expect(mockInventory.releaseProductWriteLock).toHaveBeenCalledTimes(1);
    expect(mockKafka.emitOrderCreated).toHaveBeenCalledTimes(1);
    expect(mockInventory.rollbackRedisStock).not.toHaveBeenCalled();
  });

  it('rolls back Redis stock and clears idempotency lock if DB transaction fails', async () => {
    (mockPrisma.$transaction as jest.Mock).mockRejectedValue(
      new ConflictException('DB optimistic lock conflict'),
    );

    await expect(
      ordersService.executeFlashCheckout(USER_ID, 'idem-key-002', {
        productId: PRODUCT_ID,
        quantity: 2,
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockInventory.rollbackRedisStock).toHaveBeenCalledWith(PRODUCT_ID, 2);
    expect(mockRedis.clearIdempotencyRecord).toHaveBeenCalledWith(
      'checkout',
      'idem-key-002',
    );
    expect(mockInventory.releaseProductWriteLock).toHaveBeenCalledTimes(1);
  });

  it('throws UnprocessableEntityException when X-Idempotency-Key is reused with a different payload', async () => {
    (mockRedis.getIdempotencyRecord as jest.Mock).mockResolvedValue({
      key: 'idem-key-003',
      requestHash: 'different-sha256-hash',
      status: 'COMPLETED',
    });

    await expect(
      ordersService.executeFlashCheckout(USER_ID, 'idem-key-003', {
        productId: PRODUCT_ID,
        quantity: 1,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
