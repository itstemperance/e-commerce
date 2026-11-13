'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  MapPin,
  Calendar,
  CreditCard,
  Building2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { useLookupOrdersMutation } from '@/hooks/use-flash-sale';
import { formatCurrency, formatVnd } from '@/lib/utils';
import { OrderDetailResponse } from '@/lib/api';

export default function OrderLookupPage() {
  const [phone, setPhone] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [orders, setOrders] = useState<OrderDetailResponse[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const lookupMutation = useLookupOrdersMutation();

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();

    if (!cleanPhone) {
      setFieldError('Vui lòng nhập số điện thoại để tra cứu.');
      return;
    }

    if (!/^[0-9+() -]{8,15}$/.test(cleanPhone)) {
      setFieldError('Số điện thoại không hợp lệ (từ 8 đến 15 chữ số).');
      return;
    }

    setFieldError(null);
    setHasSearched(true);

    try {
      const data = await lookupMutation.mutateAsync({
        phone: cleanPhone,
        orderCode: orderCode.trim() || undefined,
      });
      setOrders(data || []);
    } catch {
      setOrders([]);
    }
  };

  const renderStatusBadge = (status: string, paymentPlan?: string) => {
    switch (status) {
      case 'DEPOSIT_PAID':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
            ĐÃ THANH TOÁN CỌC 10% (CHỜ GIAO & THU COD)
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ĐÃ THANH TOÁN TOÀN BỘ (100%)
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-xs font-bold text-stone-600">
            <AlertCircle className="h-3.5 w-3.5 text-stone-500" />
            ĐÃ HỦY ĐƠN HÀNG
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700">
            <Clock className="h-3.5 w-3.5 text-rose-600" />
            ĐÃ HẾT HẠN GIỮ HÀNG
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            {paymentPlan === 'PARTIAL_COD'
              ? 'CHỜ THANH TOÁN TIỀN CỌC 10%'
              : 'CHỜ THANH TOÁN (100%)'}
          </span>
        );
    }
  };

  const getFulfillmentStep = (fulfillmentStatus?: string) => {
    switch (fulfillmentStatus) {
      case 'DELIVERED':
        return 4;
      case 'SHIPPING':
        return 3;
      case 'PACKING':
        return 2;
      default:
        return 1;
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
          <Package className="h-3.5 w-3.5 text-orange-600" />
          Dịch vụ hậu mãi & Theo dõi đơn hàng
        </div>
        <h1 className="text-2xl font-black text-stone-900 sm:text-3xl tracking-tight">
          Tra Cứu Đơn Hàng AURA
        </h1>
        <p className="mx-auto max-w-xl text-xs sm:text-sm text-stone-500 leading-relaxed">
          Kiểm tra tiến độ đóng gói, thông tin đơn vị vận chuyển và chi tiết đối soát công nợ bằng Số điện thoại hoặc Mã đơn hàng của bạn.
        </p>
      </div>

      {/* Lookup Search Box */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <form onSubmit={(e) => void handleSearch(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                Số điện thoại người nhận <span className="text-rose-600 font-bold">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                placeholder="VD: 0982351080"
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-stone-900 transition-all focus:outline-none ${
                  fieldError
                    ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20'
                    : 'border-stone-300 bg-white focus:border-stone-900'
                }`}
              />
              {fieldError && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {fieldError}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                Mã đơn hàng (Tùy chọn)
              </label>
              <input
                type="text"
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
                placeholder="VD: DH64948 hoặc #AURA-..."
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={lookupMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:bg-stone-300 transition-all active:scale-[0.99] shadow-sm"
            >
              {lookupMutation.isPending ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Đang tra cứu dữ liệu...</span>
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  <span>Tra cứu đơn hàng</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Search Results */}
      {hasSearched && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <span>Kết quả tra cứu</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-extrabold text-stone-700">
                {orders.length} đơn hàng
              </span>
            </h2>
            <button
              type="button"
              onClick={() => {
                setPhone('');
                setOrderCode('');
                setHasSearched(false);
                setOrders([]);
              }}
              className="text-xs font-semibold text-stone-500 hover:text-stone-900 inline-flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Xóa tìm kiếm
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center space-y-3">
              <Package className="mx-auto h-12 w-12 text-stone-300" />
              <h3 className="text-sm font-bold text-stone-900">
                Không tìm thấy đơn hàng phù hợp
              </h3>
              <p className="mx-auto max-w-sm text-xs text-stone-500 leading-relaxed">
                Không có đơn hàng nào khớp với số điện thoại <strong className="text-stone-800">{phone}</strong>. Vui lòng kiểm tra lại số điện thoại hoặc mã đơn hàng đã nhập.
              </p>
              <div className="pt-2">
                <Link
                  href="/products"
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-colors"
                >
                  Khám phá sản phẩm <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => {
                const rawCode = order.id.slice(0, 8).toUpperCase();
                const displayCode = `DH${rawCode}`;
                const currentStep = getFulfillmentStep(order.fulfillment?.status);
                const paymentPlan = order.payment_meta?.paymentPlan || 'FULL_TRANSFER';
                const totalAmountVnd = order.total_amount;
                const depositDueVnd = order.payment_meta?.depositDueNowVnd || Math.round(totalAmountVnd * 0.1);
                const codBalanceVnd = order.payment_meta?.codBalance || 0;

                return (
                  <div
                    key={order.id}
                    className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-all hover:border-stone-300"
                  >
                    {/* Order Card Header */}
                    <div className="border-b border-stone-100 bg-stone-50/70 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-stone-400">
                              MÃ ĐƠN HÀNG:
                            </span>
                            <span className="text-sm font-black text-rose-600 tracking-wider">
                              {displayCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(displayCode, order.id)}
                              className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                              title="Sao chép mã đơn"
                            >
                              {copiedCode === order.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="flex items-center gap-1.5 text-xs text-stone-500">
                            <Calendar className="h-3.5 w-3.5 text-stone-400" />
                            Ngày đặt: {new Date(order.created_at).toLocaleString('vi-VN')}
                          </p>
                        </div>

                        <div>{renderStatusBadge(order.status, paymentPlan)}</div>
                      </div>
                    </div>

                    {/* Fulfillment Progress Timeline */}
                    <div className="border-b border-stone-100 p-5 bg-white">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-4">
                        Tiến trình xử lý & Vận chuyển
                      </h4>

                      <div className="relative">
                        {/* Connecting Line */}
                        <div className="absolute top-4 left-6 right-6 h-0.5 bg-stone-200 -z-0" />
                        <div
                          className="absolute top-4 left-6 h-0.5 bg-orange-500 transition-all duration-500 -z-0"
                          style={{
                            width:
                              currentStep === 1
                                ? '0%'
                                : currentStep === 2
                                  ? '33%'
                                  : currentStep === 3
                                    ? '66%'
                                    : '100%',
                          }}
                        />

                        {/* 4 Steps */}
                        <div className="relative z-10 grid grid-cols-4 text-center">
                          {/* Step 1 */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                                currentStep >= 1
                                  ? 'border-orange-500 bg-orange-500 text-white'
                                  : 'border-stone-300 bg-white text-stone-400'
                              }`}
                            >
                              1
                            </div>
                            <span className="mt-2 text-[11px] font-bold text-stone-800">
                              Đã tiếp nhận
                            </span>
                            <span className="text-[10px] text-stone-400">
                              Hệ thống ghi nhận
                            </span>
                          </div>

                          {/* Step 2 */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                                currentStep >= 2
                                  ? 'border-orange-500 bg-orange-500 text-white'
                                  : 'border-stone-300 bg-white text-stone-400'
                              }`}
                            >
                              2
                            </div>
                            <span className="mt-2 text-[11px] font-bold text-stone-800">
                              Đang đóng gói
                            </span>
                            <span className="text-[10px] text-stone-400">
                              Kho chuẩn bị hàng
                            </span>
                          </div>

                          {/* Step 3 */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                                currentStep >= 3
                                  ? 'border-orange-500 bg-orange-500 text-white'
                                  : 'border-stone-300 bg-white text-stone-400'
                              }`}
                            >
                              3
                            </div>
                            <span className="mt-2 text-[11px] font-bold text-stone-800">
                              Đang vận chuyển
                            </span>
                            <span className="text-[10px] text-stone-400">
                              Bàn giao Shipper
                            </span>
                          </div>

                          {/* Step 4 */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                                currentStep >= 4
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-stone-300 bg-white text-stone-400'
                              }`}
                            >
                              4
                            </div>
                            <span className="mt-2 text-[11px] font-bold text-stone-800">
                              Giao thành công
                            </span>
                            <span className="text-[10px] text-stone-400">
                              Khách đã nhận
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Carrier and Tracking Code Box */}
                      {(order.fulfillment?.shippingCarrier ||
                        order.fulfillment?.trackingNumber ||
                        order.fulfillment?.note) && (
                        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-stone-700 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-3">
                            {order.fulfillment?.shippingCarrier && (
                              <div className="flex items-center gap-1.5 font-bold text-stone-900">
                                <Truck className="h-4 w-4 text-orange-600" />
                                <span>Đơn vị vận chuyển: {order.fulfillment.shippingCarrier}</span>
                              </div>
                            )}
                            {order.fulfillment?.trackingNumber && (
                              <div className="flex items-center gap-1.5 rounded-lg bg-white border border-stone-200 px-2 py-0.5 text-stone-800 font-mono text-[11px] font-bold">
                                <span>Mã vận đơn: {order.fulfillment.trackingNumber}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(
                                      order.fulfillment?.trackingNumber || '',
                                      `track_${order.id}`,
                                    )
                                  }
                                  className="text-stone-400 hover:text-stone-800"
                                >
                                  {copiedCode === `track_${order.id}` ? (
                                    <Check className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          {order.fulfillment?.note && (
                            <p className="text-[11px] text-stone-600 italic">
                              Ghi chú từ kho: {order.fulfillment.note}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Order Details Body */}
                    <div className="p-5 space-y-4">
                      {/* Customer & Address Details */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs bg-stone-50 rounded-xl p-3.5 border border-stone-100">
                        <div>
                          <span className="font-bold text-stone-500 uppercase text-[10px] block">
                            Người nhận hàng:
                          </span>
                          <p className="font-bold text-stone-900 mt-0.5">
                            {order.customer_info?.fullName || 'Khách hàng'} — {order.customer_info?.phone}
                          </p>
                        </div>
                        <div>
                          <span className="font-bold text-stone-500 uppercase text-[10px] block">
                            Địa chỉ giao hàng:
                          </span>
                          <p className="font-medium text-stone-800 mt-0.5 flex items-start gap-1">
                            <MapPin className="h-3.5 w-3.5 text-stone-400 shrink-0 mt-0.5" />
                            <span>{order.customer_info?.address || 'Địa chỉ nhận hàng'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                          Sản phẩm trong đơn:
                        </span>
                        <div className="divide-y divide-stone-100 border border-stone-100 rounded-xl overflow-hidden">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between p-3 bg-white text-xs"
                            >
                              <div className="space-y-0.5">
                                <p className="font-bold text-stone-900">
                                  {item.product?.title || 'Sản phẩm AURA'}
                                </p>
                                <p className="text-[11px] text-stone-500">
                                  Số lượng: <span className="font-bold text-stone-800">{item.quantity}</span> × {formatCurrency(item.price_at_purchase)}
                                </p>
                              </div>
                              <span className="font-black text-stone-900">
                                {formatCurrency(item.price_at_purchase * item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Financial Breakdown & Split Payment */}
                      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-2 text-xs">
                        <div className="flex justify-between text-stone-600">
                          <span>Hình thức thanh toán đã chọn:</span>
                          <span className="font-bold text-stone-900">
                            {paymentPlan === 'PARTIAL_COD'
                              ? 'Cọc 10% + COD khi nhận hàng'
                              : 'Chuyển khoản 100% (Freeship)'}
                          </span>
                        </div>
                        <div className="flex justify-between text-stone-600">
                          <span>Tổng giá trị đơn hàng:</span>
                          <span className="font-black text-stone-900 text-sm">
                            {formatCurrency(totalAmountVnd)}
                          </span>
                        </div>

                        {paymentPlan === 'PARTIAL_COD' && (
                          <div className="pt-2 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-2.5">
                              <span className="text-[10px] font-bold uppercase text-indigo-700 block">
                                Tiền cọc trước (10%):
                              </span>
                              <span className="font-black text-indigo-900 text-sm">
                                {formatCurrency(depositDueVnd)}
                              </span>
                              <p className="text-[10px] text-indigo-600 mt-0.5">
                                {order.status === 'DEPOSIT_PAID' || order.status === 'PAID'
                                  ? '✓ Đã thanh toán thành công'
                                  : 'Chưa thanh toán'}
                              </p>
                            </div>

                            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                              <span className="text-[10px] font-bold uppercase text-amber-700 block">
                                Tiền COD cần thu khi nhận hàng:
                              </span>
                              <span className="font-black text-amber-900 text-sm">
                                {formatCurrency(codBalanceVnd)}
                              </span>
                              <p className="text-[10px] text-amber-600 mt-0.5">
                                Shipper sẽ thu tiền mặt khi giao
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <span className="text-[11px] text-stone-400">
                          ID: <span className="font-mono">{order.id}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/orders/${order.id}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-colors shadow-sm"
                          >
                            <span>Xem chi tiết & QR Thanh toán</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
