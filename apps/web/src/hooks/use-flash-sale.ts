'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiClient,
  AUTH_CHANGE_EVENT,
  CheckoutPaymentConfig,
  PaginatedCatalogResponse,
  ProductCatalogItem,
  StoredUser,
  tokenStorage,
} from '@/lib/api';

/**
 * Verifies admin credentials against the backend (`/auth/admin-access`).
 * Only returns `isAdmin: true` when a valid access token exists AND the backend confirms ADMIN role.
 */
export function useVerifiedAdmin() {
  const [authSnapshot, setAuthSnapshot] = useState<{
    token: string | null;
    user: StoredUser | null;
  }>({
    token: null,
    user: null,
  });

  useEffect(() => {
    const syncAuth = () => {
      setAuthSnapshot({
        token: tokenStorage.getAccessToken(),
        user: tokenStorage.getUser(),
      });
    };

    syncAuth();
    window.addEventListener(AUTH_CHANGE_EVENT, syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  const hasLocalAdminCandidate = Boolean(
    authSnapshot.token && authSnapshot.user?.role === 'ADMIN',
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-access-verify', authSnapshot.token],
    queryFn: () => apiClient.verifyAdminAccess(),
    enabled: hasLocalAdminCandidate,
    retry: false,
    staleTime: 30_000,
  });

  if (!hasLocalAdminCandidate) {
    return { isAdmin: false, isVerifying: false };
  }

  return {
    isAdmin: Boolean(
      !isError && data?.authorized && data?.user?.role === 'ADMIN',
    ),
    isVerifying: isLoading,
  };
}

export interface ProductFilterState {
  search?: string;
  status?: string;
  tag?: string;
  minPrice?: string;
  maxPrice?: string;
  inStockOnly?: boolean;
  includeArchived?: boolean;
  sort?: string;
}

export function useProductsQuery(filters: ProductFilterState) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => apiClient.getProducts(filters),
    refetchInterval: 4000,
  });
}

export function useProductDetailQuery(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => apiClient.getProductBySlug(slug),
    refetchInterval: 2000,
    enabled: Boolean(slug),
  });
}

export function useLiveInventoryQuery(productId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', productId],
    queryFn: () => apiClient.getLiveInventory(productId as string),
    refetchInterval: 1500,
    enabled: Boolean(productId),
  });
}

export function useInventoryAuditQuery(productId: string | undefined) {
  return useQuery({
    queryKey: ['inventory-audit', productId],
    queryFn: () => apiClient.getInventoryAudit(productId as string),
    refetchInterval: 2500,
    enabled: Boolean(productId),
  });
}

export function useOrderPollingQuery(orderId: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiClient.getOrder(orderId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' ? 1500 : 5000;
    },
    enabled: Boolean(orderId),
  });
}

export function useOrdersListQuery(params?: { all?: boolean; status?: string }) {
  return useQuery({
    queryKey: ['orders-list', params],
    queryFn: () => apiClient.listOrders(params),
    refetchInterval: 4000,
  });
}

export function useProfileQuery() {
  return useQuery({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.getProfile(),
    refetchInterval: 8000,
  });
}

export function useAdminOverviewQuery() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiClient.getAdminOverview(),
    refetchInterval: 4000,
  });
}

export function useAdminUsersQuery() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.listUsers(),
    refetchInterval: 8000,
  });
}

export function useCheckoutConfigQuery() {
  return useQuery({
    queryKey: ['checkout-config'],
    queryFn: () => apiClient.getCheckoutConfig(),
    refetchInterval: 10000,
  });
}

export function useUpdateCheckoutConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<CheckoutPaymentConfig>) =>
      apiClient.updateCheckoutConfig(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checkout-config'] });
    },
  });
}

export function useFlashCheckoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      quantity,
      idempotencyKey,
      paymentPlan,
      fullName,
      phone,
      address,
      notes,
    }: {
      productId: string;
      quantity: number;
      idempotencyKey: string;
      slug?: string;
      paymentPlan?: 'FULL_TRANSFER' | 'PARTIAL_COD';
      fullName?: string;
      phone?: string;
      address?: string;
      notes?: string;
    }) =>
      apiClient.flashCheckout(
        { productId, quantity, paymentPlan, fullName, phone, address, notes },
        idempotencyKey,
      ),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['products'] });
      if (variables.slug) {
        await queryClient.cancelQueries({
          queryKey: ['product', variables.slug],
        });
      }

      const previousDetail = variables.slug
        ? queryClient.getQueryData<ProductCatalogItem>([
            'product',
            variables.slug,
          ])
        : undefined;

      if (variables.slug && previousDetail) {
        queryClient.setQueryData<ProductCatalogItem>(
          ['product', variables.slug],
          {
            ...previousDetail,
            inventory: {
              ...previousDetail.inventory,
              available_stock: Math.max(
                0,
                previousDetail.inventory.available_stock - variables.quantity,
              ),
              reserved_stock:
                previousDetail.inventory.reserved_stock + variables.quantity,
            },
          },
        );
      }

      queryClient.setQueriesData<PaginatedCatalogResponse>(
        { queryKey: ['products'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === variables.productId
                ? {
                    ...item,
                    inventory: {
                      ...item.inventory,
                      available_stock: Math.max(
                        0,
                        item.inventory.available_stock - variables.quantity,
                      ),
                      reserved_stock:
                        item.inventory.reserved_stock + variables.quantity,
                    },
                  }
                : item,
            ),
          };
        },
      );

      return { previousDetail };
    },

    onError: (_err, variables, context) => {
      if (variables.slug && context?.previousDetail) {
        queryClient.setQueryData(
          ['product', variables.slug],
          context.previousDetail,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },

    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({
        queryKey: ['inventory', variables.productId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['inventory-audit', variables.productId],
      });
      if (variables.slug) {
        void queryClient.invalidateQueries({
          queryKey: ['product', variables.slug],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      items,
      idempotencyKey,
      customerEmail,
      fullName,
      phone,
      address,
      notes,
      paymentPlan,
    }: {
      items: Array<{ productId: string; quantity: number }>;
      idempotencyKey: string;
      customerEmail?: string;
      fullName?: string;
      phone?: string;
      address?: string;
      notes?: string;
      paymentPlan?: 'FULL_TRANSFER' | 'PARTIAL_COD';
    }) =>
      apiClient.createOrder(
        {
          items,
          customerEmail,
          fullName,
          phone,
          address,
          notes,
          paymentPlan,
        },
        idempotencyKey,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useSimulatePaymentMutation(orderId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      targetOrderId,
      idempotencyKey,
      provider,
    }: {
      targetOrderId?: string;
      idempotencyKey: string;
      provider?: string;
    }) => {
      const id = targetOrderId ?? orderId;
      if (!id) throw new Error('Order ID is required');
      return apiClient.simulatePayment(
        id,
        idempotencyKey,
        provider ?? 'BANK_QR_TRANSFER',
      );
    },
    onSuccess: (_data, variables) => {
      const id = variables.targetOrderId ?? orderId;
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ['order', id] });
      }
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useCancelOrderMutation(orderId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetOrderId?: string) => {
      const id = targetOrderId ?? orderId;
      if (!id) throw new Error('Order ID is required');
      return apiClient.cancelOrder(id);
    },
    onSuccess: (_data, targetOrderId) => {
      const id = targetOrderId ?? orderId;
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ['order', id] });
      }
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiClient.updateOrderStatus(orderId, status),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['order', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useUpdatePaymentPlanMutation(orderId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      targetOrderId,
      paymentPlan,
    }: {
      targetOrderId?: string;
      paymentPlan: 'FULL_TRANSFER' | 'PARTIAL_COD';
    }) => {
      const id = targetOrderId ?? orderId;
      if (!id) throw new Error('Order ID is required');
      return apiClient.updatePaymentPlan(id, paymentPlan);
    },
    onSuccess: (_data, variables) => {
      const id = variables.targetOrderId ?? orderId;
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ['order', id] });
      }
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useDeleteOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => apiClient.deleteOrder(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useUpdateFulfillmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      dto,
    }: {
      orderId: string;
      dto: {
        status: 'PENDING' | 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED';
        trackingNumber?: string;
        shippingCarrier?: string;
        note?: string;
      };
    }) => apiClient.updateOrderFulfillment(orderId, dto),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['order', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useLookupOrdersMutation() {
  return useMutation({
    mutationFn: (params: { phone: string; orderCode?: string }) =>
      apiClient.lookupOrders(params),
  });
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      title: string;
      slug?: string;
      description: string;
      price: number;
      originalPrice?: number;
      status: string;
      totalStock: number;
      images?: string[];
      tags?: string[];
    }) => apiClient.createProduct(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
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
      };
    }) => apiClient.updateProduct(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product'] });
      void queryClient.invalidateQueries({
        queryKey: ['inventory', variables.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteProduct(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useResetInventoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      stock,
    }: {
      productId: string;
      stock?: number;
    }) => apiClient.resetInventoryStock(productId, stock ?? 50),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({
        queryKey: ['inventory', variables.productId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['inventory-audit', variables.productId],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
    },
  });
}
