.PHONY: help install infra-up infra-down infra-ps db-generate db-migrate db-seed db-reset dev build test lint benchmark-flash benchmark-catalog

help:
	@echo "Flash Sale E-Commerce Monorepo Commands:"
	@echo "  make install            - Install all monorepo dependencies via pnpm"
	@echo "  make infra-up           - Start PostgreSQL, Redis, and Redpanda (Kafka) containers"
	@echo "  make infra-down         - Stop all Docker containers"
	@echo "  make db-generate        - Generate Prisma Client"
	@echo "  make db-migrate         - Apply Prisma database migrations"
	@echo "  make db-seed            - Seed initial Users, Products, Inventory, and Redis stock"
	@echo "  make dev                - Start API and Web apps in development mode"
	@echo "  make test               - Run unit and integration tests"
	@echo "  make benchmark-flash    - Run k6 500-VU flash sale stress test"

install:
	pnpm install

infra-up:
	docker compose up -d postgres redis redpanda

infra-down:
	docker compose down

infra-ps:
	docker compose ps

db-generate:
	pnpm --filter @repo/api prisma:generate

db-migrate:
	pnpm --filter @repo/api prisma:migrate

db-seed:
	pnpm --filter @repo/api prisma:seed

db-reset:
	pnpm --filter @repo/api prisma:reset

dev:
	pnpm run dev

build:
	pnpm run build

test:
	pnpm run test

lint:
	pnpm run lint

benchmark-flash:
	k6 run benchmark/flash-sale.js

benchmark-catalog:
	k6 run benchmark/read-catalog.js

benchmark-validate:
	pnpm benchmark:validate
