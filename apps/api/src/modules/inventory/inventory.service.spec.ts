import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

describe('InventoryService - Concurrency & Distributed Lock Unit Tests', () => {
  let inventoryService: InventoryService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockRedis: jest.Mocked<Partial<RedisService>>;

  const PRODUCT_ID = '11111111-1111-4111-8111-111111111101';

  beforeEach(() => {
    mockPrisma = {
      inventory: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      } as unknown as PrismaService['inventory'],
    };

    mockRedis = {
      atomicReserveStock: jest.fn(),
      atomicReleaseStock: jest.fn(),
      setStock: jest.fn(),
      getStock: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
    };

    inventoryService = new InventoryService(
      mockPrisma as PrismaService,
      mockRedis as RedisService,
    );
  });

  describe('preDecrementRedisStock (Fast In-Memory Pre-Check)', () => {
    it('atomically decrements stock in Redis when sufficient stock exists', async () => {
      (mockRedis.atomicReserveStock as jest.Mock).mockResolvedValue(49);

      const remaining = await inventoryService.preDecrementRedisStock(PRODUCT_ID, 1);

      expect(remaining).toBe(49);
      expect(mockRedis.atomicReserveStock).toHaveBeenCalledWith(PRODUCT_ID, 1);
    });

    it('fast-rejects with ConflictException when Redis stock is depleted (-2) without hitting DB', async () => {
      (mockRedis.atomicReserveStock as jest.Mock).mockResolvedValue(-2);

      await expect(
        inventoryService.preDecrementRedisStock(PRODUCT_ID, 1),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.inventory?.findUnique).not.toHaveBeenCalled();
    });

    it('hydrates Redis from PostgreSQL on cache miss (-1) and then decrements', async () => {
      (mockRedis.atomicReserveStock as jest.Mock)
        .mockResolvedValueOnce(-1)
        .mockResolvedValueOnce(49);

      (mockPrisma.inventory?.findUnique as jest.Mock).mockResolvedValue({
        id: 'inv-1',
        product_id: PRODUCT_ID,
        total_stock: 50,
        reserved_stock: 0,
        version: 1,
      });

      const remaining = await inventoryService.preDecrementRedisStock(PRODUCT_ID, 1);

      expect(mockRedis.setStock).toHaveBeenCalledWith(PRODUCT_ID, 50);
      expect(remaining).toBe(49);
    });
  });

  describe('acquireProductWriteLock & releaseProductWriteLock (Distributed Lock)', () => {
    it('acquires a token-verified Redis Redlock handle and releases it cleanly', async () => {
      const fakeHandle = {
        lockKey: `lock:inventory:${PRODUCT_ID}`,
        token: 'token-uuid-1234',
        ttlMs: 3000,
        acquiredAt: Date.now(),
      };
      (mockRedis.acquireLock as jest.Mock).mockResolvedValue(fakeHandle);
      (mockRedis.releaseLock as jest.Mock).mockResolvedValue(true);

      const handle = await inventoryService.acquireProductWriteLock(PRODUCT_ID, 3000);
      expect(handle).toEqual(fakeHandle);

      const released = await inventoryService.releaseProductWriteLock(handle);
      expect(released).toBe(true);
      expect(mockRedis.releaseLock).toHaveBeenCalledWith(fakeHandle);
    });

    it('throws ServiceUnavailableException when lock contention exceeds retry budget', async () => {
      (mockRedis.acquireLock as jest.Mock).mockResolvedValue(null);

      await expect(
        inventoryService.acquireProductWriteLock(PRODUCT_ID, 3000),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('reserveStockInDbTransaction (Pessimistic FOR UPDATE + Optimistic Version Lock)', () => {
    it('locks inventory row FOR UPDATE and increments reserved_stock and version', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            product_id: PRODUCT_ID,
            total_stock: 50,
            reserved_stock: 10,
            version: 11,
          },
        ]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      const updated = await inventoryService.reserveStockInDbTransaction(
        mockTx as never,
        PRODUCT_ID,
        2,
      );

      expect(updated.reserved_stock).toBe(12);
      expect(updated.version).toBe(12);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException if DB available stock is less than requested quantity', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            product_id: PRODUCT_ID,
            total_stock: 50,
            reserved_stock: 50,
            version: 51,
          },
        ]),
        $executeRaw: jest.fn(),
      };

      await expect(
        inventoryService.reserveStockInDbTransaction(mockTx as never, PRODUCT_ID, 1),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });

    it('throws ConflictException if optimistic lock version check fails (concurrent modification)', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            product_id: PRODUCT_ID,
            total_stock: 50,
            reserved_stock: 0,
            version: 1,
          },
        ]),
        $executeRaw: jest.fn().mockResolvedValue(0),
      };

      await expect(
        inventoryService.reserveStockInDbTransaction(mockTx as never, PRODUCT_ID, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when product inventory row does not exist', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn(),
      };

      await expect(
        inventoryService.reserveStockInDbTransaction(mockTx as never, PRODUCT_ID, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
