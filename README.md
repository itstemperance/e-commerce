# AURA — High-Concurrency Flash Sale E-Commerce Platform

Production-grade full-stack e-commerce monorepo built with **NestJS**, **Next.js 15 (React 19)**, **PostgreSQL 16 (Prisma)**, **Redis 7 (Redlock + Lua)**, and **Redpanda (Kafka)**.

Detailed technical documentation is located in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Quick Resume Guide (Next Session)

1. **Start Infrastructure Containers (PostgreSQL, Redis, Redpanda):**
   ```powershell
   pnpm infra:up
   ```
2. **Start API & Web Storefront:**
   ```powershell
   pnpm dev
   ```
   - **Storefront UI:** `http://localhost:3000`
   - **Backend API:** `http://localhost:4000/api/v1`

3. **Run Unit Tests & 500-VU k6 Stress Benchmark:**
   ```powershell
   pnpm test
   pnpm benchmark:flash
   pnpm benchmark:validate
   ```
