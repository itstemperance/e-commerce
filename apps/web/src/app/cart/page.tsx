'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ShoppingBag,
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  Info,
  ShieldCheck,
  Truck,
  ArrowRight,
  PackageCheck,
} from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { useProductsQuery } from '@/hooks/use-flash-sale';
import { computeTieredPricing, formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const router = useRouter();
  const cart = useCart();
  const { data: catalogData } = useProductsQuery({ sort: 'flash_first' });
  const products = catalogData?.items ?? [];

  // Compute pricing across all items in cart
  const lineCalculations = useMemo(() => {
    return cart.items.map((item) => {
      const prodInCatalog = products.find((p) => p.id === item.productId);
      const isFlashSale =
        (item.status ?? prodInCatalog?.status) === 'FLASH_SALE';
      const discountedUnitPrice = item.price;
      const normalUnitPrice = isFlashSale
        ? (item.originalPrice ??
          prodInCatalog?.originalPrice ??
          discountedUnitPrice)
        : discountedUnitPrice;

      const tiered = computeTieredPricing(
        item.quantity,
        discountedUnitPrice,
        isFlashSale ? normalUnitPrice : discountedUnitPrice,
      );

      return {
        item,
        prodInCatalog,
        isFlashSale,
        discountedUnitPrice,
        normalUnitPrice,
        tiered,
      };
    });
  }, [cart.items, products]);

  const totalItemCount = useMemo(() => {
    return cart.items.reduce((sum, i) => sum + i.quantity, 0);
  }, [cart.items]);

  const totalSubtotalVnd = useMemo(() => {
    return lineCalculations.reduce(
      (sum, line) => sum + line.tiered.subtotal,
      0,
    );
  }, [lineCalculations]);

  const totalSavingsVnd = useMemo(() => {
    return lineCalculations.reduce((sum, line) => {
      if (line.isFlashSale && line.normalUnitPrice > line.discountedUnitPrice) {
        return sum + (line.normalUnitPrice - line.discountedUnitPrice);
      }
      return sum;
    }, 0);
  }, [lineCalculations]);

  const handleQuantityChange = (productId: string, newQty: number) => {
    cart.updateQuantity(productId, Math.max(0, newQty));
  };

  const handleProceedToCheckout = () => {
    if (cart.items.length === 0) return;
    router.push('/checkout');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-4">
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600 hover:text-rose-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Mua thêm sản phẩm khác</span>
        </Link>
        <h1 className="text-sm font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
          <span>GIỎ HÀNG CỦA BẠN</span>
          {cart.mounted && totalItemCount > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
              {totalItemCount}
            </span>
          )}
        </h1>
      </div>

      {/* Cart Content */}
      {cart.items.length > 0 ? (
        <div className="mt-6 space-y-6">
          {/* Cart Items List */}
          <div className="space-y-4">
            {lineCalculations.map(
              ({
                item,
                isFlashSale,
                discountedUnitPrice,
                normalUnitPrice,
                tiered,
              }) => (
                <div
                  key={item.productId}
                  className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start gap-4">
                    {/* Thumbnail & Remove button */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="h-20 w-20 overflow-hidden rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-center">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-stone-300 font-bold text-xs">
                            AURA
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.removeItem(item.productId)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-rose-600 transition-colors"
                        title="Xóa khỏi giỏ hàng"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Xóa</span>
                      </button>
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/products/${item.slug}`}
                            className="text-sm font-bold text-stone-900 hover:text-rose-600 transition-colors line-clamp-2 leading-snug"
                          >
                            {item.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            <span>Màu: Titan Tự Nhiên / Đen</span>
                            {item.status === 'FLASH_SALE' && (
                              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-200">
                                ⚡ Flash Deal
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price on right */}
                        <div className="text-right shrink-0">
                          <div className="text-base font-black text-rose-600">
                            {formatCurrency(discountedUnitPrice)}
                          </div>
                          {isFlashSale && normalUnitPrice > discountedUnitPrice && (
                            <div className="text-[11px] text-stone-400 line-through">
                              {formatCurrency(normalUnitPrice)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantity Stepper with 0-to-delete support */}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs text-stone-500">
                          {isFlashSale && normalUnitPrice > discountedUnitPrice ? (
                            <span>
                              Đơn giá niêm yết: {formatCurrency(normalUnitPrice)}
                            </span>
                          ) : (
                            <span className="text-stone-400">
                              Chỉnh về 0 để xóa sản phẩm
                            </span>
                          )}
                        </div>

                        <div className="flex items-center rounded-xl border border-stone-300 bg-white shadow-xs">
                          <button
                            type="button"
                            onClick={() =>
                              handleQuantityChange(
                                item.productId,
                                item.quantity - 1,
                              )
                            }
                            className="px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 rounded-l-xl transition-colors"
                            aria-label="Giảm số lượng (về 0 để xóa)"
                            title={
                              item.quantity === 1
                                ? 'Bấm để xóa sản phẩm'
                                : 'Giảm 1 sản phẩm'
                            }
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) {
                                handleQuantityChange(item.productId, val);
                              }
                            }}
                            className="w-12 text-center text-xs font-black text-stone-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            aria-label="Số lượng sản phẩm"
                          />
                          <button
                            type="button"
                            disabled={item.quantity >= 50}
                            onClick={() =>
                              handleQuantityChange(
                                item.productId,
                                item.quantity + 1,
                              )
                            }
                            className="px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-30 rounded-r-xl transition-colors"
                            aria-label="Tăng số lượng"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Single-unit discount notice if quantity >= 2 */}
                  {isFlashSale && item.quantity >= 2 && tiered.hasDiscount && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-2.5 text-[11px] text-amber-900 space-y-1">
                      <div className="flex items-center gap-1 font-bold">
                        <Info className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>Quy định ưu đãi 1 sản phẩm đầu tiên:</span>
                      </div>
                      <p className="text-amber-800 leading-relaxed">
                        Sản phẩm 1: {formatCurrency(discountedUnitPrice)} • Các
                        sản phẩm tiếp theo:{' '}
                        {formatCurrency(normalUnitPrice)} / chiếc.
                      </p>
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          {/* Subtotal & Financial Breakdown */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-2.5 text-xs">
            <div className="flex justify-between text-stone-600">
              <span>Tạm tính ({totalItemCount} sản phẩm):</span>
              <span className="font-bold text-stone-900">
                {formatCurrency(totalSubtotalVnd)}
              </span>
            </div>

            {totalSavingsVnd > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Tiết kiệm từ Flash Deal:</span>
                <span>-{formatCurrency(totalSavingsVnd)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-bold text-stone-900 border-t border-stone-100 pt-2.5">
              <span>Thanh toán tạm tính:</span>
              <span className="text-lg font-black text-rose-600">
                {formatCurrency(totalSubtotalVnd)}
              </span>
            </div>
          </div>

          {/* Confirmation & Proceed to Checkout Button */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleProceedToCheckout}
              className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 py-3.5 px-6 text-center text-white shadow-md hover:from-orange-600 hover:to-amber-600 active:scale-[0.99] transition-all font-bold"
            >
              <div className="flex items-center justify-center gap-2 text-base font-extrabold uppercase tracking-wide">
                <span>XÁC NHẬN GIỎ HÀNG &amp; TIẾP TỤC ĐẶT HÀNG</span>
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="mt-0.5 text-xs font-normal opacity-90">
                Chuyển sang trang điền thông tin người nhận &amp; hình thức thanh toán
              </div>
            </button>

            {/* Service commitments */}
            <div className="rounded-2xl bg-stone-50 p-4 border border-stone-200/80 space-y-2 text-xs text-stone-600">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Ship hỏa tốc 1h trong nội thành Hà Nội &amp; TP.HCM</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Ship COD toàn quốc nhận hàng kiểm tra mới thanh toán</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty Cart State */
        <div className="mt-12 rounded-3xl border border-stone-200 bg-white p-12 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-stone-100 text-stone-400">
            <ShoppingCart className="h-10 w-10" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-stone-900">
              Giỏ hàng của bạn đang trống
            </h2>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Chưa có sản phẩm nào được chọn. Hãy tham khảo các sản phẩm Flagship
              và Flash Deals hấp dẫn nhất hôm nay!
            </p>
          </div>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-xs font-bold text-white hover:bg-stone-800 transition-colors shadow"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Khám phá sản phẩm ngay</span>
          </Link>
        </div>
      )}
    </div>
  );
}
