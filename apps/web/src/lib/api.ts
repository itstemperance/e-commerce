import {
  FlashCheckoutRequestDto,
  FlashCheckoutResponseDto,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
} from '@repo/types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const ACCESS_TOKEN_KEY = 'flashsale_access_token';
const REFRESH_TOKEN_KEY = 'flashsale_refresh_token';
const USER_INFO_KEY = 'flashsale_user_info';
export const AUTH_CHANGE_EVENT = 'aura-auth-changed';

export interface StoredUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'CUSTOMER';
  fullName?: string;
  phone?: string;
  address?: string;
}

export interface UserProfileDetail {
  id: string;
  email: string;
  role: 'ADMIN' | 'CUSTOMER';
  fullName: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
  stats: {
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    totalSpent: number;
  };
}

export interface AdminUserItem {
  id: string;
  email: string;
  role: 'ADMIN' | 'CUSTOMER';
  fullName: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
  totalOrders: number;
  paidOrders: number;
  expiredOrders?: number;
  pendingOrders?: number;
  cancelledOrders?: number;
  isFlagged?: boolean;
  flagReason?: string | null;
  totalSpent: number;
}

export interface ProductCatalogItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  originalPrice: number;
  images: string[];
  tags: string[];
  status: ProductStatus;
  created_at: string;
  inventory: {
    product_id: string;
    total_stock: number;
    reserved_stock: number;
    available_stock: number;
    version: number;
  };
}

export interface PaginatedCatalogResponse {
  items: ProductCatalogItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CheckoutPaymentConfig {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  bankBranch: string;
  qrTemplateUrl: string;
  checkoutGuidance: string;
  minDepositVnd: number;
  usdToVndRate: number;
  partialDepositPercent: number;
  codShippingFee: number;
  updatedAt?: string;
}

export interface OrderDetailResponse {
  id: string;
  user_id: string;
  user?: {
    id: string;
    email: string;
  };
  total_amount: number;
  status: OrderStatus;
  idempotency_key: string;
  created_at: string;
  expires_at: string;
  remaining_seconds: number;
  fulfillment?: {
    status: 'PENDING' | 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED';
    trackingNumber: string;
    shippingCarrier: string;
    note: string;
    updatedAt: string | null;
  };
  payment_meta?: {
    paymentPlan: 'FULL_TRANSFER' | 'PARTIAL_COD';
    shippingFee: number;
    depositDueNow: number;
    depositDueNowVnd: number;
    codBalance: number;
    isDepositPaid?: boolean;
    isFullyPaid?: boolean;
    depositPaidAt?: string | null;
    fullyPaidAt?: string | null;
  };
  customer_info?: {
    fullName: string;
    phone: string;
    address: string;
    notes?: string;
  };
  payment_plan_confirmed?: boolean;
  items: Array<{
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    price_at_purchase: number;
    is_discounted_unit?: boolean;
    product?: {
      id: string;
      title: string;
      slug: string;
      status: ProductStatus;
      images?: string[];
    };
  }>;
  payments: Array<{
    id: string;
    order_id: string;
    transaction_id: string;
    provider: string;
    amount: number;
    status: PaymentStatus;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    subject: string;
    body: string;
    sentAt: string;
  }>;
}

export interface InventoryAuditResponse {
  productId: string;
  title: string;
  initialTotalStock: number;
  dbTotalStock: number;
  dbReservedStock: number;
  remainingStock: number;
  soldItems: number;
  redisAvailableStock: number;
  invariantHolds: boolean;
  formula: string;
}

export interface AdminOverviewResponse {
  revenue: {
    totalRevenue: number;
    pendingRevenue: number;
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    cancelled: number;
    expired: number;
  };
  products: {
    total: number;
    flashSale: number;
    active: number;
    outOfStock: number;
    archived: number;
    totalAvailableUnits: number;
    totalReservedUnits: number;
  };
  users: {
    total: number;
    admins: number;
    customers: number;
  };
}

export const tokenStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getUser(): StoredUser | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(USER_INFO_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  },
  setSession(
    accessToken: string,
    refreshToken: string,
    user: StoredUser,
  ): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  },
  clearSession(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(USER_INFO_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  },
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = tokenStorage.getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const rawMsg = data.message;
    const message = Array.isArray(rawMsg)
      ? rawMsg.join(', ')
      : typeof rawMsg === 'string'
        ? rawMsg
        : `Request failed with status ${response.status}`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data as T;
}

export const apiClient = {
  // Auth & Accounts
  register(
    email: string,
    password: string,
    extra?: { fullName?: string; phone?: string; address?: string },
  ) {
    return apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: StoredUser;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...extra }),
    });
  },

  login(email: string, password = 'Password123!') {
    return apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: StoredUser;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return apiRequest<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  },

  getProfile() {
    return apiRequest<UserProfileDetail>('/auth/me');
  },

  verifyAdminAccess() {
    return apiRequest<{
      authorized: boolean;
      user: { id: string; email: string; role: 'ADMIN' | 'CUSTOMER' };
      message: string;
    }>('/auth/admin-access');
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: StoredUser;
      message: string;
    }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  updateProfile(payload: {
    email?: string;
    fullName?: string;
    phone?: string;
    address?: string;
  }) {
    return apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: StoredUser;
      message: string;
    }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  listUsers() {
    return apiRequest<AdminUserItem[]>('/auth/users');
  },

  adminCreateUser(payload: {
    email: string;
    password: string;
    role: 'ADMIN' | 'CUSTOMER';
    fullName?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }) {
    return apiRequest<AdminUserItem>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  adminUpdateUser(
    userId: string,
    payload: {
      email?: string;
      role?: 'ADMIN' | 'CUSTOMER';
      fullName?: string;
      phone?: string;
      address?: string;
      notes?: string;
      newPassword?: string;
    },
  ) {
    return apiRequest<{
      id: string;
      email: string;
      role: 'ADMIN' | 'CUSTOMER';
      fullName: string;
      phone: string;
      address: string;
      notes: string;
      message: string;
    }>(`/auth/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  adminUpdateUserRole(userId: string, role: 'ADMIN' | 'CUSTOMER') {
    return apiRequest<{ id: string; email: string; role: 'ADMIN' | 'CUSTOMER' }>(
      `/auth/users/${userId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      },
    );
  },

  adminResetUserPassword(userId: string, newPassword: string) {
    return apiRequest<{ id: string; email: string; message: string }>(
      `/auth/users/${userId}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      },
    );
  },

  adminDeleteUser(userId: string) {
    return apiRequest<{ deletedId: string; email: string }>(
      `/auth/users/${userId}`,
      {
        method: 'DELETE',
      },
    );
  },

  // Products Catalog & Admin CRUD
  getProducts(params: {
    search?: string;
    status?: string;
    tag?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: boolean;
    includeArchived?: boolean;
    sort?: string;
  }) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'ALL')
      query.set('status', params.status);
    if (params.tag && params.tag !== 'ALL') query.set('tag', params.tag);
    if (params.minPrice) query.set('minPrice', params.minPrice);
    if (params.maxPrice) query.set('maxPrice', params.maxPrice);
    if (params.inStockOnly) query.set('inStockOnly', 'true');
    if (params.includeArchived) query.set('includeArchived', 'true');
    if (params.sort) query.set('sort', params.sort);
    query.set('limit', '100');
    const qs = query.toString();
    return apiRequest<PaginatedCatalogResponse>(
      `/products${qs ? `?${qs}` : ''}`,
    );
  },

  getProductBySlug(slug: string) {
    return apiRequest<ProductCatalogItem>(
      `/products/slug/${encodeURIComponent(slug)}`,
    );
  },

  getProductById(id: string) {
    return apiRequest<ProductCatalogItem>(`/products/${id}`);
  },

  createProduct(payload: {
    title: string;
    slug?: string;
    description: string;
    price: number;
    originalPrice?: number;
    status: string;
    totalStock: number;
    images?: string[];
    tags?: string[];
  }) {
    return apiRequest<ProductCatalogItem>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateProduct(
    id: string,
    payload: {
      title?: string;
      slug?: string;
      description?: string;
      price?: number;
      originalPrice?: number;
      status?: string;
      totalStock?: number;
      images?: string[];
      tags?: string[];
    },
  ) {
    return apiRequest<ProductCatalogItem>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteProduct(id: string) {
    return apiRequest<{ deletedId: string; title: string }>(`/products/${id}`, {
      method: 'DELETE',
    });
  },

  uploadProductImage(payload: { fileName: string; dataUrl: string }) {
    return apiRequest<{
      url: string;
      fileName: string;
      savedPaths: string[];
    }>('/products/upload-image', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Inventory & Stock Conservation Audit
  getLiveInventory(productId: string) {
    return apiRequest<{
      product_id: string;
      total_stock: number;
      reserved_stock: number;
      available_stock: number;
      db_available_stock: number;
      version: number;
    }>(`/inventory/${productId}`);
  },

  getInventoryAudit(productId: string) {
    return apiRequest<InventoryAuditResponse>(`/inventory/${productId}/audit`);
  },

  resetInventoryStock(productId: string, stock = 50) {
    return apiRequest<InventoryAuditResponse>(`/inventory/${productId}/reset`, {
      method: 'POST',
      body: JSON.stringify({ stock }),
    });
  },

  // Checkout Bank QR & Payment Config
  getCheckoutConfig() {
    return apiRequest<CheckoutPaymentConfig>('/orders/checkout-config');
  },

  updateCheckoutConfig(payload: Partial<CheckoutPaymentConfig>) {
    return apiRequest<CheckoutPaymentConfig>('/orders/checkout-config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Orders & Checkout
  flashCheckout(
    payload: FlashCheckoutRequestDto & {
      paymentPlan?: 'FULL_TRANSFER' | 'PARTIAL_COD';
      fullName?: string;
      phone?: string;
      address?: string;
      notes?: string;
    },
    idempotencyKey: string,
  ) {
    return apiRequest<FlashCheckoutResponseDto>('/orders/flash-checkout', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  },

  createOrder(
    payload: {
      items: Array<{ productId: string; quantity: number }>;
      customerEmail?: string;
      paymentPlan?: 'FULL_TRANSFER' | 'PARTIAL_COD';
      fullName?: string;
      phone?: string;
      address?: string;
      notes?: string;
    },
    idempotencyKey: string,
  ) {
    return apiRequest<OrderDetailResponse>('/orders', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  },

  updatePaymentPlan(
    orderId: string,
    paymentPlan: 'FULL_TRANSFER' | 'PARTIAL_COD',
  ) {
    return apiRequest<OrderDetailResponse>(`/orders/${orderId}/payment-plan`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentPlan }),
    });
  },

  getOrder(orderId: string) {
    return apiRequest<OrderDetailResponse>(`/orders/${orderId}`);
  },

  listOrders(params?: { all?: boolean; status?: string }) {
    const query = new URLSearchParams();
    if (params?.all) query.set('all', 'true');
    if (params?.status && params.status !== 'ALL')
      query.set('status', params.status);
    const qs = query.toString();
    return apiRequest<OrderDetailResponse[]>(`/orders${qs ? `?${qs}` : ''}`);
  },

  lookupOrders(params: { phone: string; orderCode?: string }) {
    const query = new URLSearchParams();
    query.set('phone', params.phone);
    if (params.orderCode) query.set('orderCode', params.orderCode);
    return apiRequest<OrderDetailResponse[]>(`/orders/lookup?${query.toString()}`);
  },

  updateOrderFulfillment(
    orderId: string,
    dto: {
      status: 'PENDING' | 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED';
      trackingNumber?: string;
      shippingCarrier?: string;
      note?: string;
    },
  ) {
    return apiRequest<OrderDetailResponse>(`/orders/${orderId}/fulfillment`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  getAdminOverview() {
    return apiRequest<AdminOverviewResponse>('/orders/admin/overview');
  },

  cancelOrder(orderId: string) {
    return apiRequest<OrderDetailResponse>(`/orders/${orderId}/cancel`, {
      method: 'POST',
    });
  },

  updateOrderStatus(orderId: string, status: string) {
    return apiRequest<OrderDetailResponse>(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  deleteOrder(orderId: string) {
    return apiRequest<{ deletedId: string; previousStatus: string }>(
      `/orders/${orderId}`,
      {
        method: 'DELETE',
      },
    );
  },

  simulatePayment(
    orderId: string,
    idempotencyKey: string,
    provider = 'BANK_QR_TRANSFER',
  ) {
    return apiRequest<{
      paymentId: string;
      orderId: string;
      transactionId: string;
      orderStatus: OrderStatus;
      paymentStatus: PaymentStatus;
      amount: number;
      processedAt: string;
    }>(`/payments/simulate/${orderId}`, {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ provider }),
    });
  },
};
