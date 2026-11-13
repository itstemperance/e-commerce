import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

export interface DistributedLockHandle {
  lockKey: string;
  token: string;
  ttlMs: number;
  acquiredAt: number;
}

export interface IdempotencyRecord<T = unknown> {
  key: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  statusCode?: number;
  response?: T;
  createdAt: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  /**
   * Lua script for safe distributed lock release (Redlock token verification).
   * Only deletes the lock key if its value matches the caller's unique lock token.
   */
  private readonly RELEASE_LOCK_LUA = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  /**
   * Lua script for atomic flash-sale stock pre-check and decrement.
   * Returns:
   *  -1 if key does not exist (cache miss)
   *  -2 if available stock < requested quantity (insufficient stock -> fast reject)
   *  >= 0 remaining stock after atomic decrement
   */
  private readonly RESERVE_STOCK_LUA = `
    local current = redis.call("get", KEYS[1])
    if not current then
      return -1
    end
    local stock = tonumber(current)
    local requested = tonumber(ARGV[1])
    if stock < requested then
      return -2
    end
    return redis.call("decrby", KEYS[1], requested)
  `;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.configService.get<number>('REDIS_PORT', 6379));

    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    this.logger.log('Connected to Redis 7 cache & distributed lock engine');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Acquire a distributed lock in Redis using SET NX PX (Redlock single-instance / quorum primitive)
   * with short retries and jitter to handle burst contention cleanly.
   */
  async acquireLock(
    resource: string,
    ttlMs = 3000,
    maxRetries = 25,
    retryDelayMs = 15,
  ): Promise<DistributedLockHandle | null> {
    const lockKey = `lock:${resource}`;
    const token = randomUUID();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.client.set(lockKey, token, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        this.logger.debug(
          JSON.stringify({
            event: 'REDIS_LOCK_ACQUIRED',
            lockKey,
            token,
            ttlMs,
            attempt,
          }),
        );
        return {
          lockKey,
          token,
          ttlMs,
          acquiredAt: Date.now(),
        };
      }

      if (attempt < maxRetries) {
        const jitter = retryDelayMs <= 3 ? (attempt % 3) : Math.floor(Math.random() * 10);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs + jitter));
      }
    }

    this.logger.warn(
      JSON.stringify({
        event: 'REDIS_LOCK_TIMEOUT',
        lockKey,
        maxRetries,
      }),
    );
    return null;
  }

  /**
   * Release a distributed lock atomically using Lua verification so an expired lock
   * cannot accidentally delete another worker's lock.
   */
  async releaseLock(handle: DistributedLockHandle): Promise<boolean> {
    try {
      const result = await this.client.eval(
        this.RELEASE_LOCK_LUA,
        1,
        handle.lockKey,
        handle.token,
      );
      const released = Number(result) === 1;
      this.logger.debug(
        JSON.stringify({
          event: 'REDIS_LOCK_RELEASED',
          lockKey: handle.lockKey,
          token: handle.token,
          released,
          heldMs: Date.now() - handle.acquiredAt,
        }),
      );
      return released;
    } catch (error) {
      this.logger.error(
        `Failed to release Redis lock ${handle.lockKey}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Helper that acquires a distributed lock, executes the critical section, and guarantees release.
   */
  async withLock<T>(
    resource: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const handle = await this.acquireLock(resource, ttlMs);
    if (!handle) {
      throw new Error(`LOCK_ACQUISITION_FAILED:${resource}`);
    }
    try {
      return await fn();
    } finally {
      await this.releaseLock(handle);
    }
  }

  /**
   * Atomic stock check-and-decrement in Redis.
   * Returns:
   *  -1: key missing in Redis
   *  -2: insufficient stock (fast-reject before DB)
   *  >= 0: new remaining stock in Redis
   */
  async atomicReserveStock(productId: string, quantity: number): Promise<number> {
    const stockKey = `inventory:stock:${productId}`;
    const res = await this.client.eval(
      this.RESERVE_STOCK_LUA,
      1,
      stockKey,
      quantity.toString(),
    );
    return Number(res);
  }

  /**
   * Compensating atomic stock increment when a downstream DB step fails or an order expires.
   */
  async atomicReleaseStock(productId: string, quantity: number): Promise<number> {
    const stockKey = `inventory:stock:${productId}`;
    const res = await this.client.incrby(stockKey, quantity);
    return Number(res);
  }

  async setStock(productId: string, availableStock: number): Promise<void> {
    const stockKey = `inventory:stock:${productId}`;
    await this.client.set(stockKey, Math.max(0, availableStock).toString());
  }

  async getStock(productId: string): Promise<number | null> {
    const stockKey = `inventory:stock:${productId}`;
    const raw = await this.client.get(stockKey);
    return raw !== null ? Number(raw) : null;
  }

  /**
   * Idempotency key locking & storage in Redis.
   */
  async getIdempotencyRecord<T = unknown>(
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord<T> | null> {
    const redisKey = `idempotency:${scope}:${key}`;
    const raw = await this.client.get(redisKey);
    if (!raw) return null;
    return JSON.parse(raw) as IdempotencyRecord<T>;
  }

  async acquireIdempotencyLock(
    scope: string,
    key: string,
    requestHash: string,
    ttlSeconds = 86400,
  ): Promise<boolean> {
    const redisKey = `idempotency:${scope}:${key}`;
    const record: IdempotencyRecord = {
      key,
      requestHash,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
    };
    const res = await this.client.set(
      redisKey,
      JSON.stringify(record),
      'EX',
      ttlSeconds,
      'NX',
    );
    return res === 'OK';
  }

  async saveIdempotencyResponse<T = unknown>(
    scope: string,
    key: string,
    requestHash: string,
    statusCode: number,
    response: T,
    ttlSeconds = 86400,
  ): Promise<void> {
    const redisKey = `idempotency:${scope}:${key}`;
    const record: IdempotencyRecord<T> = {
      key,
      requestHash,
      status: 'COMPLETED',
      statusCode,
      response,
      createdAt: new Date().toISOString(),
    };
    await this.client.set(redisKey, JSON.stringify(record), 'EX', ttlSeconds);
  }

  async clearIdempotencyRecord(scope: string, key: string): Promise<void> {
    const redisKey = `idempotency:${scope}:${key}`;
    await this.client.del(redisKey);
  }

  /**
   * Generic JSON cache helpers for catalog & product queries
   */
  async getCache<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  }

  async setCache<T>(key: string, value: T, ttlSeconds = 30): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
