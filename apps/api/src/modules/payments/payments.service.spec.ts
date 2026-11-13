import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { KafkaEventService } from '../../workers/kafka-event.service';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

describe('PaymentsService - Cryptographic HMAC Webhook Verification Tests', () => {
  let paymentsService: PaymentsService;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn().mockReturnValue('whsec_test_secret_2026'),
    } as unknown as ConfigService;

    paymentsService = new PaymentsService(
      {} as PrismaService,
      {} as RedisService,
      mockConfig,
      {} as InventoryService,
      {} as KafkaEventService,
    );
  });

  it('computes and verifies a valid HMAC-SHA256 webhook signature', () => {
    const dto: PaymentWebhookDto = {
      orderId: '11111111-1111-4111-8111-111111111101',
      transactionId: 'tx_123456',
      provider: 'STRIPE_MOCK',
      amount: 1999.99,
      status: 'COMPLETED',
    };

    const sig = paymentsService.computeHmacSignature(dto);
    expect(paymentsService.verifyHmacSignature(dto, sig)).toBe(true);
  });

  it('rejects tampered webhook payloads or invalid HMAC signatures with UnauthorizedException', async () => {
    const dto: PaymentWebhookDto = {
      orderId: '11111111-1111-4111-8111-111111111101',
      transactionId: 'tx_123456',
      provider: 'STRIPE_MOCK',
      amount: 1999.99,
      status: 'COMPLETED',
    };

    await expect(
      paymentsService.handlePaymentWebhook(
        'idem-pay-001',
        'invalid_hmac_signature_hex',
        dto,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
