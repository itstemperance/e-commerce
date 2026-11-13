'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Terminal,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Truck,
  Save,
  Check,
} from 'lucide-react';
import {
  useOrderPollingQuery,
  useUpdateOrderStatusMutation,
  useDeleteOrderMutation,
  useSimulatePaymentMutation,
  useUpdateFulfillmentMutation,
} from '@/hooks/use-flash-sale';
import { formatCurrency, formatVnd, generateUuidV4 } from '@/lib/utils';

export default function AdminMinimalOrderInspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useOrderPollingQuery(id);
  const updateStatusMutation = useUpdateOrderStatusMutation();
  const deleteOrderMutation = useDeleteOrderMutation();
  const payMutation = useSimulatePaymentMutation(id);
  const updateFulfillmentMutation = useUpdateFulfillmentMutation();

  const [fulfillmentStatus, setFulfillmentStatus] = useState<
    'PENDING' | 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED'
  >('PENDING');
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [fulfillmentNote, setFulfillmentNote] = useState('');
  const [fulfillmentSaved, setFulfillmentSaved] = useState(false);

  useEffect(() => {
    if (order?.fulfillment) {
      setFulfillmentStatus(
        (order.fulfillment.status as
          | 'PENDING'
          | 'PACKING'
          | 'SHIPPING'
          | 'DELIVERED'
          | 'RETURNED') || 'PENDING',
      );
      setShippingCarrier(order.fulfillment.shippingCarrier || '');
      setTrackingNumber(order.fulfillment.trackingNumber || '');
      setFulfillmentNote(order.fulfillment.note || '');
    }
  }, [order?.fulfillment]);

  async function handleStatusChange(nextStatus: string) {
    if (!order) return;
    await updateStatusMutation.mutateAsync({
      orderId: order.id,
      status: nextStatus,
    });
    void refetch();
  }

  async function handleSaveFulfillment(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    await updateFulfillmentMutation.mutateAsync({
      orderId: order.id,
      dto: {
        status: fulfillmentStatus,
        shippingCarrier,
        trackingNumber,
        note: fulfillmentNote,
      },
    });
    setFulfillmentSaved(true);
    setTimeout(() => setFulfillmentSaved(false), 2500);
    void refetch();
  }

  async function handleDelete() {
    if (!order) return;
    await deleteOrderMutation.mutateAsync(order.id);
    router.push('/admin?tab=orders');
  }

  async function handleRecordBankPayment() {
    if (!order) return;
    await payMutation.mutateAsync({
      idempotencyKey: generateUuidV4(),
      provider:
        order.payment_meta?.paymentPlan === 'PARTIAL_COD'
          ? 'ADMIN_VERIFIED_PARTIAL_DEPOSIT'
          : 'ADMIN_VERIFIED_FULL_TRANSFER',
    });
    void refetch();
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900">
      {/* Light-Mode Standalone Admin Top Bar aligned with Storefront */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-md px-4 py-3.5 sm:px-8 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Quay lại Bảng điều khiển Quản trị
            </Link>
            <span className="text-xs text-stone-300">/</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-rose-600">
              <Terminal className="h-3.5 w-3.5" />
              AURA<span className="text-stone-900">.</span> QUẢN_TRỊ_KIỂM_TRA_ĐƠN_HÀNG
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {order && (
              <Link
                href={`/orders/${order.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-stone-400 hover:text-stone-900 transition-colors"
              >
                Xem hóa đơn khách hàng
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
            >
              Cửa hàng chính ↗
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-6">
        {isLoading ? (
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-xs font-medium text-stone-500 shadow-sm">
            Đang tải dữ liệu đơn hàng...
          </div>
        ) : isError || !order ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-xs text-rose-700 space-y-3 shadow-sm">
            <div className="font-bold">
              LỖI: Không tìm thấy dữ liệu đơn hàng ({id}).
            </div>
            <Link
              href="/admin"
              className="inline-block rounded-xl border border-stone-300 bg-white px-4 py-2 font-bold text-stone-800 hover:bg-stone-50"
            >
              ← Quay lại Bảng điều khiển Quản trị
            </Link>
          </div>
        ) : (
          <>
            {/* Compact Header Strip */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-base font-black tracking-tight text-stone-900 font-mono">
                    ĐƠN #{order.id}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] font-bold ${
                      order.status === 'PAID'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : order.status === 'DEPOSIT_PAID'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : order.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {order.status === 'PAID' && (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {order.status === 'DEPOSIT_PAID' && (
                      <CheckCircle2 className="h-3 w-3 text-indigo-600" />
                    )}
                    {order.status === 'PENDING' && (
                      <Clock className="h-3 w-3" />
                    )}
                    {(order.status === 'CANCELLED' ||
                      order.status === 'EXPIRED') && (
                      <XCircle className="h-3 w-3" />
                    )}
                    {order.status === 'PAID'
                      ? 'ĐÃ THANH TOÁN (100%)'
                      : order.status === 'DEPOSIT_PAID'
                        ? 'ĐÃ CỌC 10% (CHỜ THU COD)'
                        : order.status === 'PENDING'
                          ? 'CHỜ THANH TOÁN'
                          : order.status === 'CANCELLED'
                            ? 'ĐÃ HỦY'
                            : order.status === 'EXPIRED'
                              ? 'HẾT HẠN'
                              : order.status}
                  </span>
                  <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-0.5 text-[11px] font-bold text-stone-700">
                    PHƯƠNG ÁN:{' '}
                    {order.payment_meta?.paymentPlan === 'PARTIAL_COD'
                      ? 'CỌC 10% + COD'
                      : 'CHUYỂN KHOẢN 100%'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-stone-500">
                  IDEMPOTENCY_KEY: {order.idempotency_key} • ĐÃ TẠO:{' '}
                  {new Date(order.created_at).toISOString()}
                </div>
              </div>

              {/* Operational Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {order.status === 'PENDING' &&
                  order.payment_meta?.paymentPlan === 'PARTIAL_COD' && (
                    <button
                      type="button"
                      disabled={updateStatusMutation.isPending}
                      onClick={() => void handleStatusChange('DEPOSIT_PAID')}
                      className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
                    >
                      XÁC_NHẬN_NHẬN_CỌC_10%
                    </button>
                  )}

                {order.status === 'DEPOSIT_PAID' && (
                  <button
                    type="button"
                    disabled={updateStatusMutation.isPending}
                    onClick={() => void handleStatusChange('PAID')}
                    className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
                  >
                    XÁC_NHẬN_ĐÃ_THU_ĐỦ_COD_→_PAID
                  </button>
                )}

                {order.status === 'PENDING' && (
                  <button
                    type="button"
                    disabled={updateStatusMutation.isPending}
                    onClick={() => void handleStatusChange('PAID')}
                    className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
                  >
                    XÁC_NHẬN_THANH_TOÁN_100%
                  </button>
                )}

                <select
                  value={order.status}
                  disabled={updateStatusMutation.isPending}
                  onChange={(e) => void handleStatusChange(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900 focus:border-stone-900 focus:outline-none"
                >
                  <option value="PENDING">TRẠNG THÁI: CHỜ THANH TOÁN</option>
                  <option value="DEPOSIT_PAID">
                    TRẠNG THÁI: ĐÃ CỌC 10% (CHỜ THU COD)
                  </option>
                  <option value="PAID">TRẠNG THÁI: ĐÃ THANH TOÁN (100%)</option>
                  <option value="CANCELLED">TRẠNG THÁI: ĐÃ HỦY</option>
                  <option value="EXPIRED">TRẠNG THÁI: HẾT HẠN</option>
                </select>

                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded-xl border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors"
                  title="Tải lại bản ghi"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  disabled={deleteOrderMutation.isPending}
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  XÓA_ĐƠN
                </button>
              </div>
            </div>

            {/* Key-Value Metadata Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-stone-200 bg-white p-5 space-y-2.5 text-xs shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  HỒ_SƠ_KHÁCH_HÀNG
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">USER_ID:</span>
                  <span className="font-mono font-semibold text-stone-900 truncate">
                    {order.user_id}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">EMAIL:</span>
                  <span className="font-bold text-rose-600 truncate">
                    {order.user?.email ?? 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">GIỮ_CHỖ_TTL:</span>
                  <span className="font-semibold text-stone-900">
                    {order.status === 'PENDING'
                      ? `Còn ${order.remaining_seconds}s`
                      : 'Đã hoàn tất / đóng'}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-5 space-y-2.5 text-xs shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  SỔ_CÁI_THANH_TOÁN
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">LOẠI_PHƯƠNG_ÁN:</span>
                  <span className="font-bold text-stone-900">
                    {order.payment_meta?.paymentPlan ?? 'FULL_TRANSFER'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">CẦN_CHUYỂN_KHOẢN:</span>
                  <span className="text-emerald-700 font-extrabold text-right">
                    {formatCurrency(
                      order.payment_meta?.depositDueNow ?? order.total_amount,
                    )}{' '}
                    (
                    {formatVnd(
                      order.payment_meta?.depositDueNowVnd ??
                        order.total_amount * 25500,
                    )}
                    )
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">CÒN_LẠI_THU_COD:</span>
                  <span className="text-amber-700 font-bold">
                    {formatCurrency(order.payment_meta?.codBalance ?? 0)}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-5 space-y-2.5 text-xs shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  TỔNG_KẾT_TÀI_CHÍNH
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">PHÍ_VẬN_CHUYỂN:</span>
                  <span className="font-semibold text-stone-900">
                    {formatCurrency(order.payment_meta?.shippingFee ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">TỔNG_ĐƠN:</span>
                  <span className="text-sm font-black text-stone-900">
                    {formatCurrency(order.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">GIAO_DỊCH_GHI_NHẬN:</span>
                  <span className="font-bold text-stone-900">
                    {order.payments.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Line Items Table (Shows 1st-Unit Discount vs Normal Price) */}
            <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden shadow-sm">
              <div className="border-b border-stone-200 bg-stone-50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-stone-600 flex flex-wrap items-center justify-between gap-2">
                <span>CHI_TIẾT_DÒNG_SẢN_PHẨM ({order.items.length} dòng)</span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                  CƠ_CHẾ_ƯU_ĐÃI_1_SP_ĐẦU_ĐANG_BẬT
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50/70 text-[11px] font-bold uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-3">MÃ_DÒNG</th>
                      <th className="px-4 py-3">TÊN_SẢN_PHẨM / SLUG</th>
                      <th className="px-4 py-3">TẦNG_GIÁ</th>
                      <th className="px-4 py-3 text-right">SL</th>
                      <th className="px-4 py-3 text-right">ĐƠN_GIÁ</th>
                      <th className="px-4 py-3 text-right">THÀNH_TIỀN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {order.items.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50/80">
                        <td className="px-4 py-3 font-mono text-stone-500">
                          {item.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-stone-900">
                            {item.product?.title ?? item.product_id}
                          </div>
                          <div className="font-mono text-[10px] text-stone-500">
                            slug: {item.product?.slug ?? 'n/a'} • prod_id:{' '}
                            {item.product_id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.is_discounted_unit ? (
                            <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                              SP_1_GIẢM_GIÁ
                            </span>
                          ) : (
                            <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold text-stone-700">
                              SP_TIẾP_THEO_GIÁ_GỐC
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-stone-900">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700">
                          {formatCurrency(item.price_at_purchase)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-stone-900">
                          {formatCurrency(
                            item.quantity * item.price_at_purchase,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fulfillment & Courier Operations Console */}
            <div className="rounded-3xl border border-stone-200 bg-white p-6 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3.5">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-stone-900">
                  <Truck className="h-4 w-4 text-rose-600" />
                  <span>QUẢN_LÝ_VẬN_CHUYỂN_&_LOGISTICS</span>
                </div>
                {fulfillmentSaved && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-0.5 text-[11px] font-bold">
                    <Check className="h-3.5 w-3.5" /> ĐÃ_LƯU_CẬP_NHẬT
                  </span>
                )}
              </div>

              <form
                onSubmit={(e) => void handleSaveFulfillment(e)}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs"
              >
                <div>
                  <label className="mb-1.5 block font-bold text-stone-700">
                    TIẾN_TRÌNH_GIAO_HÀNG:
                  </label>
                  <select
                    value={fulfillmentStatus}
                    onChange={(e) =>
                      setFulfillmentStatus(
                        e.target.value as
                          | 'PENDING'
                          | 'PACKING'
                          | 'SHIPPING'
                          | 'DELIVERED'
                          | 'RETURNED',
                      )
                    }
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                  >
                    <option value="PENDING">1. CHỜ_TIẾP_NHẬN / CHỜ_KHO</option>
                    <option value="PACKING">2. ĐANG_ĐÓNG_GÓI_TẠI_KHO</option>
                    <option value="SHIPPING">3. ĐANG_GIAO_HÀNG_BỞI_SHIPPER</option>
                    <option value="DELIVERED">4. GIAO_HÀNG_THÀNH_CÔNG</option>
                    <option value="RETURNED">5. HOÀN_HÀNG / THẤT_BẠI</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block font-bold text-stone-700">
                    HÃNG_VẬN_CHUYỂN:
                  </label>
                  <input
                    type="text"
                    value={shippingCarrier}
                    onChange={(e) => setShippingCarrier(e.target.value)}
                    placeholder="VD: GHTK, Viettel Post, GHN..."
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block font-bold text-stone-700">
                    MÃ_VẬN_ĐƠN (TRACKING):
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="VD: GHTK-HN98234..."
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block font-bold text-stone-700">
                    GHI_CHÚ_VẬN_CHUYỂN:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={fulfillmentNote}
                      onChange={(e) => setFulfillmentNote(e.target.value)}
                      placeholder="VD: Shipper đã nhận kiện..."
                      className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={updateFulfillmentMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-colors shrink-0 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      LƯU
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Payments & Audit Log */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-stone-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  GIAO_DỊCH_THANH_TOÁN ({order.payments.length})
                </div>
                {order.payments.length === 0 ? (
                  <div className="text-xs text-stone-500">
                    Chưa có giao dịch thanh toán nào được ghi nhận.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {order.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-emerald-700">
                            {p.provider} • {p.status}
                          </div>
                          <div className="font-mono text-[10px] text-stone-500">
                            TX: {p.transaction_id}
                          </div>
                        </div>
                        <div className="font-black text-stone-900">
                          {formatCurrency(p.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  SỰ_KIỆN_THÔNG_BÁO ({order.notifications.length})
                </div>
                {order.notifications.length === 0 ? (
                  <div className="text-xs text-stone-500">
                    Chưa có thông báo nào được phát ra.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {order.notifications.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-xs space-y-1"
                      >
                        <div className="flex justify-between text-[10px] text-stone-500">
                          <span className="font-bold text-stone-900">
                            {n.subject}
                          </span>
                          <span>{new Date(n.sentAt).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-[11px] text-stone-600">{n.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
