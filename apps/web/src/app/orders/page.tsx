'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Trash2,
  QrCode,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  ShoppingBag,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  useProductsQuery,
  useOrdersListQuery,
  useCreateOrderMutation,
  useSimulatePaymentMutation,
  useCancelOrderMutation,
  useProfileQuery,
  useVerifiedAdmin,
} from '@/hooks/use-flash-sale';
import {
  computeTieredPricing,
  formatCurrency,
  generateUuidV4,
} from '@/lib/utils';

interface DraftOrderItem {
  productId: string;
  quantity: number;
}

export default function OrdersHubPage() {
  const router = useRouter();
  const { isAdmin } = useVerifiedAdmin();
  const { data: catalog } = useProductsQuery({ sort: 'flash_first' });
  const products = (catalog?.items ?? []).filter(
    (p) => p.status !== 'ARCHIVED',
  );

  const [showAllOrders, setShowAllOrders] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: orders, isLoading: ordersLoading } = useOrdersListQuery({
    all: isAdmin ? showAllOrders : false,
    status: statusFilter,
  });

  // Create New Order Builder State
  const [isBuilderOpen, setIsBuilderOpen] = useState(true);
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([
    { productId: '11111111-1111-4111-8111-111111111101', quantity: 1 },
  ]);
  const [paymentPlan, setPaymentPlan] = useState<
    'FULL_TRANSFER' | 'PARTIAL_COD'
  >('FULL_TRANSFER');
  const [customerEmail, setCustomerEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [autoPayOnCreate, setAutoPayOnCreate] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderSuccess, setBuilderSuccess] = useState<string | null>(null);

  const { data: profile } = useProfileQuery();

  React.useEffect(() => {
    if (profile) {
      if (!recipientName && profile.fullName) setRecipientName(profile.fullName);
      if (!recipientPhone && profile.phone) setRecipientPhone(profile.phone);
      if (!recipientAddress && profile.address) setRecipientAddress(profile.address);
    }
  }, [profile]);

  const createOrderMutation = useCreateOrderMutation();
  const payMutation = useSimulatePaymentMutation();
  const cancelMutation = useCancelOrderMutation();

  function handleAddLineItem() {
    const usedIds = new Set(draftItems.map((i) => i.productId));
    const nextProduct =
      products.find(
        (p) => !usedIds.has(p.id) && p.inventory.available_stock > 0,
      ) ?? products[0];
    if (!nextProduct) return;

    setDraftItems((prev) => [
      ...prev,
      { productId: nextProduct.id, quantity: 1 },
    ]);
  }

  function handleRemoveLineItem(index: number) {
    if (draftItems.length <= 1) return;
    setDraftItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleUpdateLineItem(
    index: number,
    patch: Partial<DraftOrderItem>,
  ) {
    setDraftItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  const draftItemsSubtotal = draftItems.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return sum;
    const isFlashSale = prod.status === 'FLASH_SALE';
    const tiered = computeTieredPricing(
      item.quantity,
      prod.price,
      isFlashSale ? prod.originalPrice : prod.price,
    );
    return sum + tiered.subtotal;
  }, 0);

  const shippingFee = paymentPlan === 'PARTIAL_COD' ? 30000 : 0;
  const draftTotal = Math.round(draftItemsSubtotal + shippingFee);

  async function handleCreateOrderSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBuilderError(null);
    setBuilderSuccess(null);

    if (draftItems.length === 0) {
      setBuilderError('Vui lòng thêm ít nhất một sản phẩm vào đơn hàng.');
      return;
    }

    if (!recipientName.trim() || !recipientPhone.trim() || !recipientAddress.trim()) {
      setBuilderError(
        'Vui lòng nhập đầy đủ thông tin: Họ tên người nhận, Số điện thoại và Địa chỉ nhận hàng.',
      );
      return;
    }

    try {
      const created = await createOrderMutation.mutateAsync({
        items: draftItems,
        idempotencyKey: generateUuidV4(),
        customerEmail: customerEmail.trim() || undefined,
        fullName: recipientName.trim(),
        phone: recipientPhone.trim(),
        address: recipientAddress.trim(),
        paymentPlan,
      });

      if (autoPayOnCreate) {
        await payMutation.mutateAsync({
          targetOrderId: created.id,
          idempotencyKey: generateUuidV4(),
          provider:
            paymentPlan === 'FULL_TRANSFER'
              ? 'BANK_QR_FULL_TRANSFER'
              : 'BANK_QR_PARTIAL_DEPOSIT_COD',
        });
      }

      setBuilderSuccess(
        `Đơn hàng #AURA-${created.id.slice(0, 8).toUpperCase()} đã được tạo ${
          autoPayOnCreate ? 'và xác nhận thanh toán ' : ''
        }thành công!`,
      );
      router.push(`/orders/${created.id}`);
    } catch (err) {
      setBuilderError((err as Error).message);
    }
  }

  const filteredOrders = (orders ?? []).filter((order) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const idMatch = order.id.toLowerCase().includes(q);
    const emailMatch = order.user?.email.toLowerCase().includes(q) ?? false;
    const itemMatch = order.items.some((i) =>
      (i.product?.title ?? '').toLowerCase().includes(q),
    );
    return idMatch || emailMatch || itemMatch;
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
            Trung tâm quản lý &amp; Giữ chỗ đơn hàng
          </span>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
            Đơn hàng &amp; Tạo đơn tùy chỉnh
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Tạo đơn hàng đơn chiếc hoặc nhiều sản phẩm với cơ chế ưu đãi tầng
            (sản phẩm thứ 1 giảm giá, từ sản phẩm thứ 2 tính giá niêm yết) và
            chuyển khoản qua mã VietQR.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsBuilderOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {isBuilderOpen ? 'Ẩn bộ tạo đơn' : 'Tạo đơn hàng mới'}
          </button>

          <Link
            href="/checkout"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-800 hover:bg-stone-50 transition-colors"
          >
            <ShoppingBag className="h-4 w-4" />
            Trang thanh toán
          </Link>
        </div>
      </div>

      {/* SECTION 1: MULTI-ITEM / CUSTOM ORDER CREATOR */}
      {isBuilderOpen && (
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-rose-600" />
                Tạo đơn hàng mới
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                Khi đặt 2 hoặc nhiều sản phẩm giống nhau, chỉ 1 sản phẩm đầu tiên
                được tính giá ưu đãi, các sản phẩm tiếp theo sẽ áp dụng giá gốc
                niêm yết.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddLineItem}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-3.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm sản phẩm khác
            </button>
          </div>

          {builderError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{builderError}</span>
            </div>
          )}

          {builderSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{builderSuccess}</span>
            </div>
          )}

          <form
            onSubmit={(e) => void handleCreateOrderSubmit(e)}
            className="space-y-5"
          >
            <div className="space-y-3">
              {draftItems.map((item, idx) => {
                const selectedProd = products.find(
                  (p) => p.id === item.productId,
                );
                const avail = selectedProd?.inventory.available_stock ?? 0;
                const tiered = computeTieredPricing(
                  item.quantity,
                  selectedProd?.price ?? 0,
                  selectedProd?.originalPrice,
                );

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-6">
                      <label className="mb-1 block text-[11px] font-bold text-stone-500">
                        Sản phẩm #{idx + 1}
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) =>
                          handleUpdateLineItem(idx, {
                            productId: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                      >
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.status === 'OUT_OF_STOCK'
                              ? `${prod.title} — Liên hệ (Hết hàng)`
                              : prod.status === 'FLASH_SALE'
                                ? `⚡ [Flash] ${prod.title} — Sp 1: ${formatCurrency(prod.price)} / Gốc: ${formatCurrency(prod.originalPrice ?? prod.price)}${isAdmin ? ` (Còn ${prod.inventory.available_stock} máy)` : ''}`
                                : `${prod.title} — ${formatCurrency(prod.price)}${isAdmin ? ` (Còn ${prod.inventory.available_stock} máy)` : ''}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-bold text-stone-500">
                        Số lượng
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={isAdmin ? Math.max(1, avail) : 50}
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateLineItem(idx, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <div className="text-[11px] font-bold text-stone-500">
                        Tạm tính dòng
                      </div>
                      <div className="mt-0.5 text-sm font-black text-stone-900">
                        {formatCurrency(tiered.subtotal)}
                      </div>
                      {item.quantity >= 2 && tiered.hasDiscount && (
                        <div className="text-[10px] font-semibold text-amber-800">
                          1× {formatCurrency(tiered.discountedUnitPrice)} +{' '}
                          {tiered.additionalUnitsCount}×{' '}
                          {formatCurrency(tiered.normalUnitPrice)}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end sm:col-span-1">
                      <button
                        type="button"
                        disabled={draftItems.length <= 1}
                        onClick={() => handleRemoveLineItem(idx)}
                        title="Xóa sản phẩm"
                        className="rounded-xl p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recipient Information Row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-stone-100 pt-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Họ tên người nhận *
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Họ tên người nhận"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Số điện thoại *
                </label>
                <input
                  type="tel"
                  required
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="Số điện thoại nhận hàng"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Địa chỉ nhận hàng *
                </label>
                <input
                  type="text"
                  required
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Địa chỉ giao hàng đầy đủ"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-stone-100 pt-4 sm:grid-cols-12 items-end">
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Phương thức thanh toán
                </label>
                <select
                  value={paymentPlan}
                  onChange={(e) =>
                    setPaymentPlan(
                      e.target.value as 'FULL_TRANSFER' | 'PARTIAL_COD',
                    )
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                >
                  <option value="FULL_TRANSFER">
                    Thanh toán toàn bộ (100%) — Miễn phí ship
                  </option>
                  <option value="PARTIAL_COD">
                    Cọc 10% (Tối thiểu 200.000 ₫) + Thu hộ COD (+30.000 ₫)
                  </option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Email khách hàng (Tùy chọn)
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Mặc định theo tài khoản đã đăng nhập"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 cursor-pointer w-full">
                  <input
                    type="checkbox"
                    checked={autoPayOnCreate}
                    onChange={(e) => setAutoPayOnCreate(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Xác nhận đã chuyển VietQR ngay</span>
                </label>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 sm:col-span-3">
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-stone-500">
                    Tổng tiền đơn hàng
                  </div>
                  <div className="text-lg font-black text-stone-900">
                    {formatCurrency(draftTotal)}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    createOrderMutation.isPending || payMutation.isPending
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-bold text-white shadow-md hover:bg-stone-800 disabled:opacity-50 transition-all"
                >
                  {createOrderMutation.isPending || payMutation.isPending
                    ? 'Đang tạo đơn...'
                    : 'Tạo đơn hàng'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* SECTION 2: EXISTING ORDERS DIRECTORY */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'PENDING', 'PAID', 'CANCELLED', 'EXPIRED'] as const).map(
              (st) => {
                const labelMap: Record<string, string> = {
                  ALL: 'Tất cả trạng thái',
                  PENDING: 'Chờ thanh toán',
                  PAID: 'Đã thanh toán',
                  CANCELLED: 'Đã hủy',
                  EXPIRED: 'Hết hạn',
                };
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      statusFilter === st
                        ? 'bg-stone-900 text-white'
                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {labelMap[st] ?? st}
                  </button>
                );
              },
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllOrders}
                  onChange={(e) => setShowAllOrders(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-rose-600"
                />
                Xem toàn bộ đơn hàng của hệ thống
              </label>
            )}

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã đơn, tên sản phẩm, email..."
                className="w-full rounded-full border border-stone-300 bg-white py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {ordersLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-stone-200 bg-white"
              />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center shadow-sm">
            <Package className="mx-auto h-8 w-8 text-stone-400" />
            <h3 className="mt-3 text-sm font-bold text-stone-900">
              Không tìm thấy đơn hàng phù hợp
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              Sử dụng bộ tạo đơn ở trên để tiến hành đặt đơn hàng mới.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const minutesLeft = Math.floor(order.remaining_seconds / 60);
              const secondsLeft = order.remaining_seconds % 60;

              return (
                <div
                  key={order.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:border-stone-300 md:flex-row md:items-center"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-sm font-black text-stone-900 hover:text-rose-600"
                      >
                        #AURA-{order.id.slice(0, 8).toUpperCase()}
                      </Link>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          order.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : order.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-stone-100 text-stone-600 border border-stone-200'
                        }`}
                      >
                        {order.status === 'PAID' && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {order.status === 'PENDING' && (
                          <Clock className="h-3 w-3" />
                        )}
                        {(order.status === 'CANCELLED' ||
                          order.status === 'EXPIRED') && (
                          <XCircle className="h-3 w-3" />
                        )}
                        {order.status === 'PAID'
                          ? 'Đã thanh toán'
                          : order.status === 'PENDING'
                            ? 'Chờ thanh toán'
                            : order.status === 'CANCELLED'
                              ? 'Đã hủy'
                              : order.status === 'EXPIRED'
                                ? 'Hết hạn'
                                : order.status}
                      </span>

                      {order.payment_meta && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                          {order.payment_meta.paymentPlan === 'PARTIAL_COD'
                            ? 'Cọc 10% + COD'
                            : 'Chuyển khoản 100%'}
                        </span>
                      )}

                      {order.status === 'PENDING' &&
                        order.remaining_seconds > 0 && (
                          <span className="text-[11px] font-semibold text-amber-700">
                            • Giữ chỗ còn {minutesLeft}:
                            {secondsLeft.toString().padStart(2, '0')}
                          </span>
                        )}

                      {order.user?.email && (
                        <span className="text-xs text-stone-400">
                          • {order.user.email}
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-medium text-stone-700">
                      {order.items.map((item, i) => (
                        <span key={item.id}>
                          {i > 0 && ' + '}
                          <strong>{item.quantity}×</strong>{' '}
                          {item.product?.title ?? 'Sản phẩm'} (
                          {formatCurrency(item.price_at_purchase)}
                          {item.is_discounted_unit ? ' [Ưu đãi]' : ''})
                        </span>
                      ))}
                    </div>

                    <div className="text-[11px] text-stone-400">
                      Đặt lúc {new Date(order.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right mr-2">
                      <div className="text-[11px] text-stone-400">Tổng cộng</div>
                      <div className="text-base font-black text-stone-900">
                        {formatCurrency(order.total_amount)}
                      </div>
                    </div>

                    {order.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          disabled={payMutation.isPending}
                          onClick={() =>
                            payMutation.mutate({
                              targetOrderId: order.id,
                              idempotencyKey: generateUuidV4(),
                              provider: 'BANK_QR_TRANSFER',
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Xác nhận chuyển VietQR
                        </button>

                        <button
                          type="button"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(order.id)}
                          className="rounded-full border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                        >
                          Hủy đơn
                        </button>
                      </>
                    )}

                    <Link
                      href={`/orders/${order.id}`}
                      className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
                    >
                      Xem đơn &amp; Mã QR →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
