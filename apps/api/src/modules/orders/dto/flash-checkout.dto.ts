import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class FlashCheckoutDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @IsOptional()
  @IsIn(['FULL_TRANSFER', 'PARTIAL_COD'])
  paymentPlan?: 'FULL_TRANSFER' | 'PARTIAL_COD';

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OrderItemInputDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsIn(['FULL_TRANSFER', 'PARTIAL_COD'])
  paymentPlan?: 'FULL_TRANSFER' | 'PARTIAL_COD';

  @IsString()
  @MinLength(2, { message: 'Họ tên người nhận phải có ít nhất 2 ký tự' })
  fullName: string;

  @IsString()
  @MinLength(8, { message: 'Số điện thoại nhận hàng phải có ít nhất 8 số' })
  phone: string;

  @IsString()
  @MinLength(5, { message: 'Địa chỉ nhận hàng phải có ít nhất 5 ký tự' })
  address: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePaymentPlanDto {
  @IsIn(['FULL_TRANSFER', 'PARTIAL_COD'])
  paymentPlan: 'FULL_TRANSFER' | 'PARTIAL_COD';
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class UpdateCheckoutConfigDto {
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  qrTemplateUrl?: string;

  @IsOptional()
  @IsString()
  checkoutGuidance?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1000)
  minDepositVnd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  usdToVndRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  partialDepositPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  codShippingFee?: number;
}

export class LookupOrderDto {
  @IsString()
  @MinLength(8, { message: 'Số điện thoại phải có ít nhất 8 số' })
  phone: string;

  @IsOptional()
  @IsString()
  orderCode?: string;
}

export class UpdateFulfillmentDto {
  @IsIn(['PENDING', 'PACKING', 'SHIPPING', 'DELIVERED', 'RETURNED'])
  status: 'PENDING' | 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED';

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  shippingCarrier?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
