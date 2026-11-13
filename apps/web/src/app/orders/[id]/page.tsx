'use client';

import React, { use, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  QrCode,
  XCircle,
  ChevronLeft,
  Copy,
  Check,
  Building2,
  ShieldCheck,
  FileText,
  AlertCircle,
  Truck,
  Banknote,
} from 'lucide-react';
import {
  useOrderPollingQuery,
  useSimulatePaymentMutation,
  useCancelOrderMutation,
  useCheckoutConfigQuery,
  useUpdatePaymentPlanMutation,
} from '@/hooks/use-flash-sale';
import { formatCurrency, formatVnd, generateUuidV4 } from '@/lib/utils';
import { AUTH_CHANGE_EVENT, StoredUser, tokenStorage } from '@/lib/api';

const FALLBACK_CONFIG = {
  bankName: 'Vietcombank (VCB) — Corporate Priority',
  accountNumber: '0071001298899',
  accountHolder: 'AURA FLAGSHIP COMMERCE CO., LTD',
  bankBranch: 'Ho Chi Minh City Operations Center',
  qrTemplateUrl: '',
  checkoutGuidance:
    '1. Mở ứng dụng ngân hàng và quét mã QR ở trên (hoặc chuyển khoản theo thông tin tài khoản bên dưới).\n' +
    '2. Nhập chính xác số tiền cần chuyển và điền Mã số đơn hàng vào Nội dung chuyển khoản.\n' +
    '3. Sau khi bấm chuyển khoản thành công, nhấn nút "Tôi đã chuyển khoản thành công" bên dưới để hệ thống đối soát.',
  usdToVndRate: 25500,
  minDepositVnd: 200000,
  partialDepositPercent: 10,
  codShippingFee: 15,
  updatedAt: new Date().toISOString(),
};

/**
 * Deterministic QR matrix fallback in case admin has not uploaded a custom QR image.
 */
function buildDeterministicQrMatrix(payload: string): boolean[][] {
  const size = 25;
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rr][cc] = isBorder || isInner;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let seed = hash >>> 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      seed = (Math.imul(seed, 1664525) + 1013904223 + r * 31 + c * 17) >>> 0;
      grid[r][c] = (seed & 3) !== 0 && ((seed >>> 2) & 1) === 1;
    }
  }

  return grid;
}

export default function OrderLiveStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: order, isLoading, isError } = useOrderPollingQuery(id);
  const { data: checkoutConfigData } = useCheckoutConfigQuery();
  const config = checkoutConfigData ?? FALLBACK_CONFIG;

  const payMutation = useSimulatePaymentMutation(id);
  const cancelMutation = useCancelOrderMutation(id);
  const updatePlanMutation = useUpdatePaymentPlanMutation(id);

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'FULL_TRANSFER' | 'PARTIAL_COD'>('FULL_TRANSFER');
  const [hasConfirmedPlan, setHasConfirmedPlan] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  useEffect(() => {
    const syncUser = () => {
      setCurrentUser(tokenStorage.getUser());
    };
    syncUser();
    window.addEventListener(AUTH_CHANGE_EVENT, syncUser);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, syncUser);
  }, []);

  useEffect(() => {
    if (order?.payment_meta?.paymentPlan) {
      setSelectedPlan(order.payment_meta.paymentPlan);
    }
    if (order?.payment_plan_confirmed) {
      setHasConfirmedPlan(true);
    }
  }, [order?.payment_meta?.paymentPlan, order?.payment_plan_confirmed]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-stone-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-white border border-stone-200" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h2 className="mt-3 text-lg font-bold text-stone-900">Không tìm thấy đơn hàng</h2>
          <p className="mt-1 text-xs text-stone-500">
            Mã đơn hàng không hợp lệ hoặc đã bị xóa khỏi hệ thống.
          </p>
          <Link
            href="/products"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-stone-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Quay lại Cửa hàng
          </Link>
        </div>
      </div>
    );
  }

  const minutesLeft = Math.floor(order.remaining_seconds / 60);
  const secondsLeft = order.remaining_seconds % 60;

  // Order reference code DH... or #AURA-...
  const rawOrderCode = order.id.slice(0, 8).toUpperCase();
  const displayOrderCode = `DH${rawOrderCode}`;
  const displayOrderNumber = `#AURA-${rawOrderCode}`;

  const currentPaymentPlan = order.payment_meta?.paymentPlan ?? selectedPlan;
  const depositDueNowUsd =
    order.payment_meta?.depositDueNow ?? order.total_amount;
  const depositDueNowVnd =
    order.payment_meta?.depositDueNowVnd ??
    Math.round(depositDueNowUsd * config.usdToVndRate);
  const codBalanceUsd = order.payment_meta?.codBalance ?? 0;
  const codBalanceVnd = Math.round(codBalanceUsd * config.usdToVndRate);

  const referenceMemo = `${displayOrderCode} - ${displayOrderNumber}`;

  // Customer Contact Info
  const customerName = order.customer_info?.fullName || order.user?.email || 'Quý khách';
  const customerAddress = order.customer_info?.address || 'Tại cửa hàng / Địa chỉ giao hàng';
  const rawPhone = order.customer_info?.phone || '';
  const maskedPhone =
    rawPhone.length >= 7
      ? `${rawPhone.slice(0, 4)}******`
      : rawPhone || '098*******';
  const customerNotes = order.customer_info?.notes || '';

  // Fallback QR Matrix
  const qrPayload = `${config.bankName}|ACC:${config.accountNumber}|HOLDER:${config.accountHolder}|VND:${depositDueNowVnd}|REF:${displayOrderCode}`;
  const fallbackMatrix = buildDeterministicQrMatrix(qrPayload);

  function copyText(text: string, target: 'account' | 'memo' | 'amount') {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    if (target === 'account') {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 1800);
    } else if (target === 'memo') {
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 1800);
    } else {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 1800);
    }
  }

  async function handleConfirmPaymentPlan() {
    await updatePlanMutation.mutateAsync({ paymentPlan: selectedPlan });
    setHasConfirmedPlan(true);
  }

  function handleConfirmBankTransfer() {
    payMutation.mutate({
      idempotencyKey: generateUuidV4(),
      provider:
        currentPaymentPlan === 'FULL_TRANSFER'
          ? 'BANK_QR_FULL_TRANSFER'
          : 'BANK_QR_PARTIAL_DEPOSIT_COD',
    });
  }

  const guidanceLines = config.checkoutGuidance
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between text-xs">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 font-semibold text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Đơn hàng của tôi
        </Link>
        <span className="text-stone-400">
          Đặt lúc {new Date(order.created_at).toLocaleString('vi-VN')}
        </span>
      </div>

      {/* 1. Header Banner: Green Order Success (Mockup 2) */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2 text-emerald-700 font-extrabold text-lg sm:text-xl">
          <span className="text-xl">🛍</span>
          <span>ĐẶT HÀNG THÀNH CÔNG</span>
        </div>
        <p className="mt-1 text-xs sm:text-sm font-semibold text-stone-800">
          Cảm ơn quý khách đã mua hàng tại AURA Flagship
        </p>
        <p className="mt-0.5 text-xs text-stone-500">
          Tư vấn viên sẽ liên hệ đến quý khách trong vòng 10 phút (8h - 21h)
        </p>
      </div>

      {/* Logged-Out Guest Prompt: Only shown when user is not logged in */}
      {!currentUser && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800 font-bold">
              ℹ️
            </div>
            <div className="flex-1 space-y-1 text-xs">
              <div className="font-bold text-sky-950">
                Lưu ý dành cho khách mua hàng (chưa đăng nhập)
              </div>
              <p className="text-sky-800 leading-relaxed">
                Bạn vừa đặt đơn hàng thành công với tư cách <strong>Khách vãng lai</strong>. Hãy lưu lại hoặc chụp màn hình <strong>Mã số đơn hàng: {displayOrderCode}</strong> và số điện thoại liên hệ để thuận tiện đối soát.
              </p>
              <p className="text-sky-800 leading-relaxed pt-0.5">
                Khuyến khích bạn{' '}
                <Link
                  href="/account"
                  className="font-bold underline text-stone-900 hover:text-rose-600"
                >
                  Tạo tài khoản hoặc Đăng nhập
                </Link>{' '}
                với cùng số điện thoại/email để hệ thống tự động lưu trữ và đồng bộ toàn bộ lịch sử đơn hàng của bạn.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Customer Order Details Section: Thông tin đặt hàng */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-stone-100/90 px-4 py-2.5 border-b border-stone-200 text-xs font-extrabold uppercase tracking-wide text-stone-800">
          Thông tin đặt hàng
        </div>
        <div className="p-4 space-y-2.5 text-xs">
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-4 sm:col-span-3 text-stone-500 font-medium">Họ tên:</span>
            <span className="col-span-8 sm:col-span-9 font-bold text-stone-900">{customerName}</span>
          </div>
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-4 sm:col-span-3 text-stone-500 font-medium">Địa chỉ:</span>
            <span className="col-span-8 sm:col-span-9 font-bold text-stone-900">{customerAddress}</span>
          </div>
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-4 sm:col-span-3 text-stone-500 font-medium">Số điện thoại:</span>
            <span className="col-span-8 sm:col-span-9 font-bold text-stone-900">{maskedPhone}</span>
          </div>
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-4 sm:col-span-3 text-stone-500 font-medium">Lưu ý trước khi giao hàng:</span>
            <span className="col-span-8 sm:col-span-9 font-medium text-stone-800">
              {customerNotes || 'Không có yêu cầu đặc biệt'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Order Items Section: Thông tin đơn hàng */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-stone-100/90 px-4 py-2.5 border-b border-stone-200 text-xs font-extrabold uppercase tracking-wide text-stone-800">
          Thông tin đơn hàng
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50/50 text-[11px] font-bold text-stone-500">
              <tr>
                <th className="py-2.5 px-4 w-16">Ảnh</th>
                <th className="py-2.5 px-3">Tên sản phẩm</th>
                <th className="py-2.5 px-3 text-right">Đơn giá</th>
                <th className="py-2.5 px-4 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {order.items.map((item) => {
                const itemVnd = Math.round(item.price_at_purchase * config.usdToVndRate);
                const lineTotalVnd = Math.round(item.quantity * item.price_at_purchase * config.usdToVndRate);
                const photo = item.product?.images?.[0];

                return (
                  <tr key={item.id} className="hover:bg-stone-50/50">
                    <td className="py-3 px-4">
                      <div className="h-12 w-12 overflow-hidden rounded-lg border border-stone-200 bg-stone-50 flex items-center justify-center">
                        {photo ? (
                          <img
                            src={photo}
                            alt={item.product?.title || 'Sản phẩm'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-stone-100" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-stone-900">
                        {item.product?.title ?? 'Thiết bị phần cứng'}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Số lượng: {item.quantity} chiếc
                      </div>
                      {item.is_discounted_unit ? (
                        <span className="mt-0.5 inline-block rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-bold text-rose-600 border border-rose-200">
                          Sản phẩm 1: Ưu đãi Flash Deal
                        </span>
                      ) : (
                        <span className="mt-0.5 inline-block rounded bg-stone-100 px-1.5 py-0.2 text-[10px] font-bold text-stone-600 border border-stone-200">
                          Sản phẩm tiếp theo: Giá gốc
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-stone-800">
                      {formatVnd(itemVnd)}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-rose-600">
                      {formatVnd(lineTotalVnd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Prominent Order Number & Financial Totals (Mockup 2 Highlight) */}
        <div className="border-t border-stone-200 bg-stone-50/50 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-700">Mã số đơn hàng:</span>
            <span className="text-base font-black text-rose-600 tracking-wider">
              {displayOrderCode}
            </span>
            <span className="text-xs font-bold text-stone-400">
              ({displayOrderNumber})
            </span>
          </div>

          <div className="text-right space-y-1">
            <div className="flex items-baseline justify-end gap-3 text-xs">
              <span className="text-stone-600 font-semibold">Tổng cộng:</span>
              <span className="text-sm font-extrabold text-rose-600">
                {formatVnd(order.total_amount * config.usdToVndRate)}
              </span>
            </div>
            <div className="flex items-baseline justify-end gap-3 text-xs">
              <span className="text-stone-600 font-semibold">Cần thanh toán:</span>
              <span className="text-base font-black text-rose-600">
                {formatVnd(depositDueNowVnd)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Payment Status Alert Box (Dashed style from Mockup 2) */}
      <div
        className={`rounded-xl border-2 border-dashed p-3.5 text-center text-xs font-extrabold transition-all ${
          order.status === 'PAID'
            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
            : order.status === 'DEPOSIT_PAID'
              ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
              : order.status === 'PENDING'
                ? 'border-amber-300 bg-amber-50/70 text-amber-900'
                : 'border-rose-300 bg-rose-50 text-rose-800'
        }`}
      >
        {order.status === 'PAID' && (
          <div className="flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Đơn hàng đã được thanh toán toàn bộ (100%)</span>
          </div>
        )}
        {order.status === 'DEPOSIT_PAID' && (
          <div className="flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
            <span>
              Đã thanh toán tiền cọc 10% ({formatVnd(depositDueNowVnd)}) — Còn thu COD {formatVnd(codBalanceVnd)} khi nhận hàng
            </span>
          </div>
        )}
        {order.status === 'PENDING' && (
          <div className="flex items-center justify-center gap-1.5">
            <Clock className="h-4 w-4 text-amber-600 animate-pulse" />
            <span>
              {currentPaymentPlan === 'PARTIAL_COD'
                ? `Đơn hàng đang chờ thanh toán tiền cọc 10% (Giữ hàng còn ${minutesLeft}:${secondsLeft.toString().padStart(2, '0')})`
                : `Đơn hàng đang chờ thanh toán 100% (Giữ hàng còn ${minutesLeft}:${secondsLeft.toString().padStart(2, '0')})`}
            </span>
          </div>
        )}
        {(order.status === 'CANCELLED' || order.status === 'EXPIRED') && (
          <div className="flex items-center justify-center gap-1.5">
            <XCircle className="h-4 w-4 text-rose-600" />
            <span>Đơn hàng đã ở trạng thái {order.status === 'CANCELLED' ? 'đã hủy' : 'hết hạn'}</span>
          </div>
        )}
      </div>

      {/* Fulfillment Status Progress Stepper */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-900 flex items-center gap-2">
            <Truck className="h-4 w-4 text-orange-600" />
            Tiến trình vận chuyển &amp; Giao nhận
          </h3>
          <span className="text-[11px] font-bold text-stone-500">
            {order.fulfillment?.status === 'DELIVERED'
              ? 'Đã giao thành công'
              : order.fulfillment?.status === 'SHIPPING'
                ? 'Đang vận chuyển'
                : order.fulfillment?.status === 'PACKING'
                  ? 'Đang đóng gói'
                  : 'Đã tiếp nhận'}
          </span>
        </div>

        {/* 4 Steps Stepper */}
        <div className="relative pt-2">
          <div className="absolute top-6 left-6 right-6 h-0.5 bg-stone-200 -z-0" />
          <div
            className="absolute top-6 left-6 h-0.5 bg-orange-500 transition-all duration-500 -z-0"
            style={{
              width:
                order.fulfillment?.status === 'DELIVERED'
                  ? '100%'
                  : order.fulfillment?.status === 'SHIPPING'
                    ? '66%'
                    : order.fulfillment?.status === 'PACKING'
                      ? '33%'
                      : '0%',
            }}
          />

          <div className="relative z-10 grid grid-cols-4 text-center">
            <div className="flex flex-col items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500 text-xs font-bold text-white">
                1
              </div>
              <span className="mt-1.5 text-[11px] font-bold text-stone-800">
                Đã tiếp nhận
              </span>
            </div>

            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  ['PACKING', 'SHIPPING', 'DELIVERED'].includes(
                    order.fulfillment?.status || '',
                  )
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-stone-300 bg-white text-stone-400'
                }`}
              >
                2
              </div>
              <span className="mt-1.5 text-[11px] font-bold text-stone-800">
                Đang đóng gói
              </span>
            </div>

            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  ['SHIPPING', 'DELIVERED'].includes(
                    order.fulfillment?.status || '',
                  )
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-stone-300 bg-white text-stone-400'
                }`}
              >
                3
              </div>
              <span className="mt-1.5 text-[11px] font-bold text-stone-800">
                Đang giao hàng
              </span>
            </div>

            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  order.fulfillment?.status === 'DELIVERED'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-stone-300 bg-white text-stone-400'
                }`}
              >
                4
              </div>
              <span className="mt-1.5 text-[11px] font-bold text-stone-800">
                Đã giao
              </span>
            </div>
          </div>
        </div>

        {/* Carrier Details Box if present */}
        {(order.fulfillment?.shippingCarrier ||
          order.fulfillment?.trackingNumber ||
          order.fulfillment?.note) && (
          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-700 space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              {order.fulfillment?.shippingCarrier && (
                <div className="font-bold text-stone-900">
                  Hãng vận chuyển: {order.fulfillment.shippingCarrier}
                </div>
              )}
              {order.fulfillment?.trackingNumber && (
                <div className="font-mono text-xs font-bold text-stone-800 bg-white px-2 py-0.5 rounded border border-stone-200">
                  Mã vận đơn: {order.fulfillment.trackingNumber}
                </div>
              )}
            </div>
            {order.fulfillment?.note && (
              <p className="text-[11px] text-stone-500 italic">
                Cập nhật từ kho: {order.fulfillment.note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 5. Payment Method Selection (Mockup 2) */}
      {order.status === 'PENDING' && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
              Chọn hình thức thanh toán:
            </h3>
            {hasConfirmedPlan && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> Đã xác nhận phương thức
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* Option 1: 100% Bank Transfer + Free Shipping */}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                selectedPlan === 'FULL_TRANSFER'
                  ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <input
                type="radio"
                name="paymentPlan"
                value="FULL_TRANSFER"
                checked={selectedPlan === 'FULL_TRANSFER'}
                onChange={() => setSelectedPlan('FULL_TRANSFER')}
                className="mt-0.5 h-4 w-4 text-stone-900 focus:ring-stone-900"
              />
              <div className="flex-1 text-xs space-y-0.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-extrabold text-stone-900">
                    Thanh toán toàn bộ (100%) chuyển khoản ngân hàng
                  </span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    Miễn phí vận chuyển
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Chuyển khoản toàn bộ qua mã VietQR ngay bây giờ. Không phát sinh thanh toán tiền mặt khi nhận hàng.
                </p>
                <div className="text-[11px] font-bold text-stone-800 pt-1">
                  Số tiền chuyển ngay: {formatVnd(order.total_amount * config.usdToVndRate)} ({formatCurrency(order.total_amount)})
                </div>
              </div>
            </label>

            {/* Option 2: 10% Deposit (min 200k) + Cash on Delivery */}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                selectedPlan === 'PARTIAL_COD'
                  ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <input
                type="radio"
                name="paymentPlan"
                value="PARTIAL_COD"
                checked={selectedPlan === 'PARTIAL_COD'}
                onChange={() => setSelectedPlan('PARTIAL_COD')}
                className="mt-0.5 h-4 w-4 text-stone-900 focus:ring-stone-900"
              />
              <div className="flex-1 text-xs space-y-0.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-extrabold text-stone-900">
                    Thanh toán một phần (Đặt cọc 10%, tối thiểu 200.000 ₫) + Thu hộ COD
                  </span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">
                    Cọc 10% + Thu COD
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Đặt cọc trước {config.partialDepositPercent}% giá trị đơn hàng (tối thiểu {formatVnd(config.minDepositVnd)}). Số tiền còn lại thu COD khi bưu tá giao hàng.
                </p>
                <div className="text-[11px] font-bold text-stone-800 pt-1">
                  Cọc ngay: {formatVnd(depositDueNowVnd)} • Thu khi nhận hàng: {formatVnd(codBalanceVnd)}
                </div>
              </div>
            </label>
          </div>

          {/* Blue XÁC NHẬN CTA Button (Mockup 2) */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              disabled={updatePlanMutation.isPending}
              onClick={handleConfirmPaymentPlan}
              className="rounded-lg bg-blue-600 px-12 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {updatePlanMutation.isPending ? 'Đang cập nhật...' : 'XÁC NHẬN'}
            </button>
          </div>
        </div>
      )}

      {/* 6. Admin-Uploaded Bank QR Code Image & Auto-Generated Bank Details Below */}
      {order.status === 'PENDING' && (
        <div className="rounded-2xl border-2 border-stone-900/10 bg-gradient-to-b from-stone-50 to-white p-5 sm:p-6 shadow-sm space-y-5">
          <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-stone-800" />
              <h3 className="text-sm font-black text-stone-900">
                MÃ QR NGÂN HÀNG CHỦ SHOP &amp; THÔNG TIN CHUYỂN KHOẢN
              </h3>
            </div>
            <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-bold text-white">
              {currentPaymentPlan === 'FULL_TRANSFER' ? 'Thanh toán 100%' : 'Đặt cọc 10%'}
            </span>
          </div>

          {/* QR Image Frame: Display Admin-Uploaded Image */}
          <div className="flex flex-col items-center">
            <div className="rounded-2xl border-2 border-stone-900 bg-white p-3.5 shadow-md flex flex-col items-center">
              {config.qrTemplateUrl ? (
                <img
                  src={config.qrTemplateUrl}
                  alt="Ảnh QR Ngân hàng do Admin tải lên"
                  className="h-56 w-56 object-contain rounded-lg"
                />
              ) : (
                <svg
                  viewBox="0 0 27 27"
                  className="h-52 w-52"
                  role="img"
                  aria-label={`Mã QR tài khoản ${config.accountNumber}`}
                >
                  <rect width="27" height="27" fill="#ffffff" rx="1.5" />
                  {fallbackMatrix.map((row, rIdx) =>
                    row.map((cell, cIdx) =>
                      cell ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx + 1}
                          y={rIdx + 1}
                          width={1}
                          height={1}
                          fill="#0c0a09"
                          rx={0.12}
                        />
                      ) : null,
                    ),
                  )}
                </svg>
              )}
              <div className="mt-2 border-t border-stone-100 pt-1.5 text-center">
                <span className="text-[10px] font-extrabold uppercase text-stone-500">
                  Quét mã để thanh toán tự động
                </span>
              </div>
            </div>
          </div>

          {/* Auto-Populated Bank Transfer Information Underneath */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl bg-stone-50 p-3 border border-stone-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Ngân hàng thụ hưởng
                </div>
                <div className="mt-0.5 font-extrabold text-stone-900 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-stone-500" />
                  {config.bankName}
                </div>
                {config.bankBranch && (
                  <div className="text-[11px] text-stone-500">{config.bankBranch}</div>
                )}
              </div>

              <div className="rounded-xl bg-stone-50 p-3 border border-stone-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Chủ tài khoản
                </div>
                <div className="mt-0.5 font-black text-stone-900">
                  {config.accountHolder}
                </div>
              </div>
            </div>

            {/* Account Number with Copy */}
            <div className="flex w-full items-center justify-between rounded-xl bg-stone-100/80 px-3.5 py-2.5 overflow-hidden">
              <div className="min-w-0 pr-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Số tài khoản ngân hàng
                </div>
                <div className="font-mono text-sm font-black tracking-wider text-stone-900 break-all">
                  {config.accountNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(config.accountNumber, 'account')}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 shrink-0 shadow-sm"
              >
                {copiedAccount ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép
                  </>
                )}
              </button>
            </div>

            {/* Amount Due with Copy */}
            <div className="flex w-full items-center justify-between rounded-xl bg-stone-100/80 px-3.5 py-2.5 overflow-hidden">
              <div className="min-w-0 pr-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Số tiền cần chuyển
                </div>
                <div className="font-mono text-sm font-black tracking-wider text-rose-600 break-all">
                  {formatVnd(depositDueNowVnd)}{' '}
                  <span className="text-xs font-normal text-stone-500">
                    ({formatCurrency(depositDueNowUsd)})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(String(depositDueNowVnd), 'amount')}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 shrink-0 shadow-sm"
              >
                {copiedAmount ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép
                  </>
                )}
              </button>
            </div>

            {/* Reference Memo with Copy (Includes Order ID DH...) */}
            <div className="flex w-full items-center justify-between rounded-xl bg-stone-100/80 px-3.5 py-2.5 overflow-hidden">
              <div className="min-w-0 pr-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Nội dung chuyển khoản (Memo)
                </div>
                <div className="font-mono text-xs font-black tracking-wider text-rose-600 break-all">
                  {referenceMemo}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(referenceMemo, 'memo')}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 shrink-0 shadow-sm"
              >
                {copiedMemo ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép
                  </>
                )}
              </button>
            </div>

            {/* Guidance Lines */}
            <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-stone-800 text-xs">
                <FileText className="h-3.5 w-3.5 text-rose-600" />
                <span>Hướng dẫn chuyển khoản</span>
              </div>
              {guidanceLines.map((line, idx) => (
                <p key={idx} className="flex items-start gap-1.5 text-[11px] text-stone-600 leading-relaxed">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{line}</span>
                </p>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-2 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-stone-100">
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
                className="w-full sm:w-auto rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
              >
                Hủy đơn hàng
              </button>

              <button
                type="button"
                disabled={payMutation.isPending}
                onClick={handleConfirmBankTransfer}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                <QrCode className="h-4 w-4" />
                {payMutation.isPending
                  ? 'Đang kiểm tra giao dịch...'
                  : currentPaymentPlan === 'PARTIAL_COD'
                    ? `Tôi đã chuyển khoản cọc 10% (${formatVnd(depositDueNowVnd)})`
                    : `Tôi đã chuyển khoản thành công (${formatVnd(depositDueNowVnd)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Paid Receipt Confirmation Panel */}
      {order.status === 'DEPOSIT_PAID' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-indigo-900">
              <CheckCircle2 className="h-4 w-4 text-indigo-600" />
              <span>Tiền đặt cọc (10%) đã được xác nhận thành công</span>
            </div>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800 border border-indigo-200">
              Đã cọc: {formatVnd(depositDueNowVnd)}
            </span>
          </div>

          <p className="text-xs text-stone-600 leading-relaxed">
            Hệ thống đã nhận thành công tiền đặt cọc cho đơn hàng <strong>{displayOrderCode}</strong>. Sản phẩm đã được giữ chỗ an toàn và đang được kho tiến hành đóng gói để giao đến địa chỉ của bạn.
          </p>

          <div className="rounded-xl bg-white border border-indigo-100 p-4 space-y-2 text-xs">
            <div className="flex justify-between text-stone-600">
              <span>Tiền cọc đã thanh toán (10%):</span>
              <span className="font-bold text-emerald-600">
                {formatVnd(depositDueNowVnd)} (Đã nhận ✓)
              </span>
            </div>
            <div className="flex justify-between text-stone-600 border-t border-stone-100 pt-2">
              <span className="font-semibold text-stone-800">
                Số tiền còn lại cần thu khi nhận hàng (COD):
              </span>
              <span className="font-black text-rose-600 text-sm">
                {formatVnd(codBalanceVnd)}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 italic pt-1">
              * Quý khách sẽ thanh toán tiền mặt {formatVnd(codBalanceVnd)} trực tiếp cho nhân viên giao hàng sau khi kiểm tra kiện hàng.
            </p>
          </div>

          {order.payments.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                Lịch sử giao dịch:
              </span>
              {order.payments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-indigo-100 bg-white p-3 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-stone-900">
                      Mã giao dịch: {p.transaction_id}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      Thời gian: {new Date(p.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                    {formatVnd(p.amount * config.usdToVndRate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Paid Receipt Confirmation Panel */}
      {order.status === 'PAID' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Biên lai thanh toán đã được xác nhận</span>
          </div>
          <p className="text-xs text-stone-600">
            Giao dịch chuyển khoản của bạn cho đơn hàng <strong>{displayOrderCode}</strong> đã được hệ thống ghi nhận thành công. Đội ngũ nhân viên đang đóng gói sản phẩm và chuyển giao cho đơn vị vận chuyển.
          </p>
          {order.payments.length > 0 && (
            <div className="space-y-2 pt-2">
              {order.payments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-emerald-200 bg-white p-3 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-stone-900">
                      Mã giao dịch: {p.transaction_id}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      Thời gian: {new Date(p.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    {formatVnd(p.amount * config.usdToVndRate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
