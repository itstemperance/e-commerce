export enum UserRole {
  ADMIN = 'ADMIN',
  CUSTOMER = 'CUSTOMER',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  FLASH_SALE = 'FLASH_SALE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  ARCHIVED = 'ARCHIVED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  DEPOSIT_PAID = 'DEPOSIT_PAID',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum FulfillmentStatus {
  PENDING = 'PENDING',
  PACKING = 'PACKING',
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

export interface UserDto {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface InventoryDto {
  product_id: string;
  total_stock: number;
  reserved_stock: number;
  available_stock: number;
  version: number;
}

export interface ProductDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  status: ProductStatus;
  created_at: string;
  inventory?: InventoryDto;
}

export interface OrderItemDto {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price_at_purchase: number;
  product?: Pick<ProductDto, 'id' | 'title' | 'slug'>;
}

export interface OrderDto {
  id: string;
  user_id: string;
  total_amount: number;
  status: OrderStatus;
  idempotency_key: string;
  created_at: string;
  items: OrderItemDto[];
}

export interface PaymentDto {
  id: string;
  order_id: string;
  transaction_id: string;
  provider: string;
  amount: number;
  status: PaymentStatus;
  raw_payload: Record<string, unknown>;
}

export interface FlashCheckoutRequestDto {
  productId: string;
  quantity: number;
}

export interface FlashCheckoutResponseDto {
  orderId: string;
  status: OrderStatus;
  totalAmount: number;
  idempotencyKey: string;
  processingTimeMs: number;
  createdAt: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
}

export interface OrderCreatedEventPayload {
  orderId: string;
  userId: string;
  productId: string;
  quantity: number;
  totalAmount: number;
  idempotencyKey: string;
  createdAt: string;
}
