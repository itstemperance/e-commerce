import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentWebhookDto {
  @IsUUID()
  orderId: string;

  @IsString()
  transactionId: string;

  @IsString()
  provider: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsIn(['COMPLETED', 'FAILED'])
  status: 'COMPLETED' | 'FAILED';
}

export class SimulatePaymentDto {
  @IsOptional()
  @IsString()
  provider?: string;
}
