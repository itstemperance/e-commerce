import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PaymentWebhookResponse, PaymentsService } from './payments.service';
import { PaymentWebhookDto, SimulatePaymentDto } from './dto/payment-webhook.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ): Promise<PaymentWebhookResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.paymentsService.handlePaymentWebhook(
      idempotencyKey,
      signature,
      dto,
    );
  }

  @Post('simulate/:orderId')
  @HttpCode(HttpStatus.OK)
  async simulatePayment(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SimulatePaymentDto,
  ): Promise<PaymentWebhookResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.paymentsService.simulatePaymentForOrder(
      orderId,
      idempotencyKey,
      dto.provider ?? 'STRIPE_MOCK',
    );
  }
}
