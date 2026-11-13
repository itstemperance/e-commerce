# System Architecture & High-Concurrency Engineering Documentation

## 1. Overview
This platform powers **AURA**, a high-concurrency e-commerce storefront engineered to handle extreme Flash Sale traffic bursts (500+ simultaneous requests targeting a 50-unit inventory allocation) with **strictly zero overselling**, **sub-100ms checkout latency**, and **end-to-end idempotency**.

While the customer-facing Next.js storefront (`apps/web`) presents a clean, retail shopping experience free of technical jargon, every action is backed by the distributed concurrency and event-driven primitives documented below.

---

## 2. Three-Layer Concurrency Control & Flash Sale Engine

When a shopper clicks **Buy Now** or **Place Order**, the request hits `POST /api/v1/orders/flash-checkout` (`OrdersService.executeFlashCheckout`) and passes through three sequential defense layers:

### Layer 1: In-Memory Redis 7 Lua Atomic Pre-Check (`< 1ms`)
- **Implementation:** `RedisService.atomicReserveStock` (`apps/api/src/common/redis/redis.service.ts`) & `InventoryService.preDecrementRedisStock`.
- **Mechanism:** Executes an atomic server-side Lua script (`RESERVE_STOCK_LUA`) against `inventory:stock:<productId>`:
  ```lua
  local current = redis.call("get", KEYS[1])
  if not current then return -1 end
  local stock = tonumber(current)
  local requested = tonumber(ARGV[1])
  if stock < requested then return -2 end
  return redis.call("decrby", KEYS[1], requested)
  ```
- **Why it matters:** When 500 concurrent users try to buy a 50-item product, **450 excess requests are fast-rejected in `< 1ms` directly from Redis memory** with `409 Conflict` before acquiring a distributed lock or opening a single PostgreSQL database transaction.
- **Compensating Rollback:** If any downstream lock or database step fails, `InventoryService.rollbackRedisStock` atomically increments (`INCRBY`) the Redis counter so stock is never leaked.

### Layer 2: Distributed Redis Lock (Redlock Token-Verified Primitive)
- **Implementation:** `RedisService.acquireLock` & `RedisService.releaseLock` (`apps/api/src/common/redis/redis.service.ts`).
- **Mechanism:**
  - Acquires `lock:inventory:<productId>` using `SET lockKey <uuidToken> PX 5000 NX` with jittered backoff retries.
  - Releases the lock using a token-verified Lua script (`RELEASE_LOCK_LUA`) that checks `redis.call("get", KEYS[1]) == ARGV[1]` before calling `DEL`, guaranteeing that an expired lock can never accidentally delete another worker's lock.

### Layer 3: PostgreSQL 16 Pessimistic Row Lock + Optimistic Version Control
- **Implementation:** `InventoryService.reserveStockInDbTransaction` (`apps/api/src/modules/inventory/inventory.service.ts`).
- **Mechanism:** Inside an interactive Prisma transaction:
  1. **Pessimistic Row Lock:** Executes `SELECT id, product_id, total_stock, reserved_stock, version FROM inventory WHERE product_id = $1::uuid FOR UPDATE` to serialize row-level mutations.
  2. **Optimistic Concurrency Control:** Executes `UPDATE inventory SET reserved_stock = reserved_stock + $1, version = version + 1 WHERE product_id = $2::uuid AND version = $3 AND (total_stock - reserved_stock) >= $1`, verifying that `version` has not drifted and available stock remains non-negative.

---

## 3. Idempotency & Cryptographic Payment Settlement

### 3.1. `X-Idempotency-Key` Deduplication
- **Endpoints Protected:**
  - `POST /api/v1/orders/flash-checkout`
  - `POST /api/v1/payments/webhook`
  - `POST /api/v1/payments/simulate/:orderId`
- **Mechanism:**
  - Computes a SHA-256 digest of the canonical request payload (`productId:quantity` for checkout; `orderId:transactionId:provider:amount:status` for payments).
  - Stores the idempotency state (`IN_PROGRESS` -> `COMPLETED`) and response payload in Redis (`idempotency:<scope>:<key>`) as well as a `@unique` constraint on `orders.idempotency_key` in PostgreSQL.
  - **Network Retries:** Re-sending the same `X-Idempotency-Key` with the identical payload replays the original response in `~2ms` without creating a second order or double-decrementing inventory.
  - **Payload Tampering:** Re-using the same `X-Idempotency-Key` with different parameters throws `422 Unprocessable Entity`.

### 3.2. Cryptographic HMAC-SHA256 Payment Webhooks
- **Implementation:** `PaymentsService.computeHmacSignature` & `PaymentsService.verifyHmacSignature` (`apps/api/src/modules/payments/payments.service.ts`).
- **Mechanism:**
  - Computes `HMAC-SHA256(canonicalPayload, PAYMENT_WEBHOOK_SECRET)` and validates `X-Webhook-Signature` using `crypto.timingSafeEqual` to prevent timing side-channel attacks.
  - Upon verification, transitions the order from `PENDING -> PAID` and permanently decrements `total_stock` and `reserved_stock` in PostgreSQL.

---

## 4. Event-Driven Asynchronous Workers (Redpanda / Kafka)

- **Broker:** Redpanda (`v24.2.8`, Kafka-compatible on port `9092`).
- **Producer & Consumer (`apps/api/src/workers/kafka-event.service.ts`):**
  - Emits `orders.created` and `orders.paid` events non-blockingly (`setImmediate`) so HTTP checkout latency stays well below the `100ms` SLA.
- **Dedicated Workers:**
  1. **`StockSettlementWorker` (`stock-settlement.worker.ts`):** Synchronizes Redis hash metadata (`inventory:meta:<productId>`) with PostgreSQL reservation and settlement states.
  2. **`NotificationWorker` (`notification.worker.ts`):** Dispatches customer order confirmation, payment receipt, and expiration notifications stored in `notifications:order:<orderId>`.
  3. **`OrderExpirationWorker` (`order-expiration.worker.ts`):** Implements a **15-minute Delayed Queue / TTL pattern** using a Redis Sorted Set (`orders:delayed_expiration`). Unpaid `PENDING` orders are automatically transitioned to `EXPIRED` after 15 minutes and their reserved stock is atomically returned to both PostgreSQL and Redis.

---

## 5. Stress Testing & Stock Conservation Verification

- **500-VU Flash Sale Benchmark (`benchmark/flash-sale.js`):**
  ```bash
  pnpm benchmark:flash
  ```
  Simulates `500` concurrent virtual users attempting to purchase a `50`-stock Flash Sale item:
  - `50` requests return `201 Created` (`flash_orders_created_201 == 50`)
  - `450` requests fast-reject with `409 Conflict` (`flash_orders_rejected_409 == 450`)
  - `0` unexpected errors (`100%` check pass rate)
- **Stock Conservation Invariant Validator (`benchmark/validate-stock.ts`):**
  ```bash
  pnpm benchmark:validate
  ```
  Verifies that across PostgreSQL and Redis:
  $$\text{sold\_items} + \text{remaining\_stock} = 50$$
