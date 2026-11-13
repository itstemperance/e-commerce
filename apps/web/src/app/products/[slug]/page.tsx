'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Star,
  Truck,
  ShieldCheck,
  RotateCcw,
  Check,
  ShoppingCart,
  CreditCard,
  Plus,
  Minus,
  Flame,
  RefreshCw,
  Images,
  Info,
} from 'lucide-react';
import {
  useProductDetailQuery,
  useResetInventoryMutation,
  useVerifiedAdmin,
} from '@/hooks/use-flash-sale';
import { useCart } from '@/hooks/use-cart';
import {
  computeTieredPricing,
  formatCurrency,
} from '@/lib/utils';
import { getProductRetailMeta } from '@/lib/product-visuals';
import { ProductVisual } from '@/components/product-visual';

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [addedToast, setAddedToast] = useState(false);
  const { isAdmin } = useVerifiedAdmin();
  const { addItem } = useCart();

  const { data: product, isLoading, isError } = useProductDetailQuery(slug);
  const resetMutation = useResetInventoryMutation();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-56 animate-pulse rounded bg-stone-200" />
        <div className="h-96 animate-pulse rounded-3xl border border-stone-200 bg-white" />
      </div>
    );
  }

  if (isError || !product || product.status === 'ARCHIVED') {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">
          Không tìm thấy sản phẩm (Link không hợp lệ)
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Link không hợp lệ hoặc sản phẩm bạn tìm kiếm không tồn tại trên hệ thống.
        </p>
        <Link
          href="/products"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-xs font-bold text-white"
        >
          Quay lại danh mục sản phẩm
        </Link>
      </div>
    );
  }

  const isFlashSale = product.status === 'FLASH_SALE';
  const meta = getProductRetailMeta(product.slug, isFlashSale);
  const available = product.inventory.available_stock;
  const total = Math.max(product.inventory.total_stock, available, 1);
  const claimedPercent = Math.min(
    100,
    Math.max(6, Math.round(((total - available) / total) * 100)),
  );
  const isStatusOutOfStock = product.status === 'OUT_OF_STOCK';
  const isOutOfStock = isStatusOutOfStock || available <= 0;

  const photos = product.images ?? [];
  const activePhoto = photos[selectedPhotoIdx] ?? photos[0];

  const normalPrice =
    isFlashSale && product.originalPrice && product.originalPrice > product.price
      ? product.originalPrice
      : isFlashSale && meta.originalPrice && meta.originalPrice > product.price
        ? meta.originalPrice
        : product.price;

  const pricing = computeTieredPricing(
    quantity,
    product.price,
    isFlashSale ? normalPrice : product.price,
  );

  function handleAddToCart() {
    if (!product || isOutOfStock) return;
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        title: product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        image: photos[0],
        status: product.status,
        tags: product.tags,
      },
      quantity,
    );
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 3500);
  }

  function handleCheckoutNow() {
    if (!product || isOutOfStock) return;
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        title: product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        image: photos[0],
        status: product.status,
        tags: product.tags,
      },
      quantity,
    );
    router.push(`/checkout?productId=${product.id}&quantity=${quantity}`);
  }

  return (
    <div className="space-y-10">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
        <Link href="/" className="hover:text-stone-900">
          Trang chủ
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        <Link href="/products" className="hover:text-stone-900">
          Tất cả sản phẩm
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        <Link
          href={`/products?category=${encodeURIComponent(meta.category)}`}
          className="hover:text-stone-900"
        >
          {meta.category}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        <span className="font-semibold text-stone-900 truncate max-w-xs">
          {product.title}
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Left: Multi-Photo Gallery & Product Details */}
        <div className="space-y-8 lg:col-span-7">
          <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 space-y-4">
            {activePhoto ? (
              <div className="relative overflow-hidden rounded-2xl bg-stone-950">
                <img
                  src={activePhoto}
                  alt={`${product.title} — Ảnh ${selectedPhotoIdx + 1}`}
                  className="h-80 sm:h-96 w-full object-cover"
                />
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                  <Images className="h-3.5 w-3.5" />
                  Ảnh {selectedPhotoIdx + 1} / {photos.length}
                </span>
              </div>
            ) : (
              <ProductVisual
                meta={meta}
                isFlashSale={isFlashSale}
                size="detail"
              />
            )}

            {/* Thumbnail Strip */}
            {photos.length > 1 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {photos.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPhotoIdx(idx)}
                    className={`relative h-20 overflow-hidden rounded-xl border-2 transition-all ${
                      selectedPhotoIdx === idx
                        ? 'border-rose-600 ring-2 ring-rose-500/20'
                        : 'border-stone-200 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`Ảnh thu nhỏ ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Key Highlights & Specifications */}
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">
                Tổng quan sản phẩm
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {product.description}
              </p>
            </div>

            <div className="border-t border-stone-100 pt-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                Đặc điểm nổi bật &amp; Thông số
              </h3>
              <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {meta.highlights.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-center gap-2.5 rounded-xl bg-stone-50 px-3.5 py-2.5 text-xs font-medium text-stone-800"
                  >
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2.5 rounded-xl bg-stone-50 px-3.5 py-2.5 text-xs font-medium text-stone-800">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Bao gồm bảo hành chính hãng 2 năm</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right: Sticky Retail Buy Box with Tiered Pricing Breakdown */}
        <div className="lg:col-span-5">
          <div className="sticky top-28 rounded-3xl border border-stone-200 bg-white p-6 shadow-lg sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  {meta.brand}
                </span>
                <div className="flex items-center gap-1 text-xs font-semibold text-stone-800">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>{meta.rating.toFixed(1)}</span>
                  <span className="text-stone-400">
                    ({meta.reviewCount} đánh giá)
                  </span>
                </div>
              </div>

              <h1 className="text-2xl font-black tracking-tight text-stone-900">
                {product.title}
              </h1>
            </div>

            {/* Pricing Block */}
            <div className="border-y border-stone-100 py-4 space-y-1.5">
              {isStatusOutOfStock ? (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-black text-rose-600">
                      Liên hệ
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-stone-500">
                    Sản phẩm hiện đang hết hàng. Vui lòng liên hệ cửa hàng để được tư vấn và báo giá.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-black text-stone-900">
                      {formatCurrency(product.price)}
                    </span>
                    {pricing.hasDiscount && (
                      <>
                        <span className="text-sm text-stone-400 line-through">
                          {formatCurrency(pricing.normalPrice)}
                        </span>
                        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600">
                          Tiết kiệm {formatCurrency(pricing.savingsOnFirstUnit)}
                        </span>
                      </>
                    )}
                  </div>
                  {pricing.hasDiscount && (
                    <p className="text-[11px] font-medium text-stone-500">
                      Ưu đãi giảm giá áp dụng cho 1 sản phẩm đầu tiên.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Real-Time Availability Indicator */}
            {isFlashSale ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-rose-700">
                    <Flame className="h-4 w-4 fill-rose-600 text-rose-600" />
                    {isOutOfStock
                      ? 'Đã hết suất Flash Deal'
                      : isAdmin
                        ? `Quản trị kho: Còn ${available} / ${total}`
                        : 'Flash Deal giới hạn — Sắp hết suất'}
                  </span>
                  {isAdmin && (
                    <span className="font-semibold text-stone-600">
                      Đã bán {claimedPercent}%
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-600 to-orange-500 transition-all duration-300"
                      style={{ width: `${isOutOfStock ? 100 : claimedPercent}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 text-xs">
                <span className="inline-flex items-center gap-2 font-semibold text-emerald-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {isOutOfStock
                    ? 'Hiện đang tạm hết hàng'
                    : isAdmin
                      ? `Quản trị kho: Còn ${available} / ${total}`
                      : 'Còn hàng • Giao nhanh trong ngày'}
                </span>
                <span className="font-medium text-stone-500">
                  Freeship khi chuyển khoản đủ
                </span>
              </div>
            )}

            {/* Quantity Input Field with +/- Stepper */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-800">Số lượng mua</span>
                <span className="text-stone-400">
                  {isFlashSale && pricing.hasDiscount
                    ? 'Sp 1 giảm giá • Sp 2+ theo giá niêm yết'
                    : 'Giao hàng nhanh toàn quốc'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-2xl border border-stone-300 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100 disabled:opacity-30 transition-colors"
                    aria-label="Giảm số lượng"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={isAdmin ? Math.max(1, available) : 50}
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const maxAllowed = isAdmin ? Math.max(1, available) : 50;
                      if (!isNaN(val)) {
                        setQuantity(Math.max(1, Math.min(maxAllowed, val)));
                      }
                    }}
                    className="w-16 text-center text-sm font-black text-stone-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    disabled={
                      isOutOfStock || quantity >= (isAdmin ? available : 50)
                    }
                    onClick={() => {
                      const maxAllowed = isAdmin ? Math.max(1, available) : 50;
                      setQuantity((q) => Math.min(maxAllowed, q + 1));
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100 disabled:opacity-30 transition-colors"
                    aria-label="Tăng số lượng"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {isAdmin ? (
                  <span className="text-xs text-stone-500">
                    (Quản trị kho: Còn {available} / {total})
                  </span>
                ) : (
                  <span className="text-xs text-stone-500">
                    {isOutOfStock ? 'Tạm hết hàng' : 'Còn hàng sẵn sàng giao'}
                  </span>
                )}
              </div>
            </div>

            {/* Multi-Unit Tiered Pricing Breakdown Notice */}
            {!isStatusOutOfStock && pricing.hasMultiUnitRevert && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Info className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Chi tiết áp dụng ưu đãi khi mua số lượng nhiều</span>
                </div>
                <div className="flex justify-between text-stone-700">
                  <span>Sản phẩm thứ 1 (Giá ưu đãi Flash Deal):</span>
                  <span className="font-bold text-emerald-700">
                    1 × {formatCurrency(product.price)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-700">
                  <span>
                    Các sản phẩm tiếp theo ({pricing.normalQty} chiếc theo giá niêm yết):
                  </span>
                  <span className="font-bold text-stone-900">
                    {pricing.normalQty} × {formatCurrency(pricing.normalPrice)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-amber-200/70 pt-1.5 font-extrabold text-stone-900">
                  <span>Tổng tiền hàng ({quantity} chiếc):</span>
                  <span>{formatCurrency(pricing.subtotal)}</span>
                </div>
              </div>
            )}

            {/* Feedback Toast when added to cart */}
            {addedToast && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Đã thêm {quantity} sản phẩm vào giỏ hàng!</span>
                </div>
                <Link
                  href="/cart"
                  className="font-bold underline text-emerald-900 hover:text-emerald-950"
                >
                  Xem giỏ hàng →
                </Link>
              </div>
            )}

            {/* Product Actions: "Thêm vào giỏ hàng" và "Thanh toán ngay" */}
            <div className="space-y-3">
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={handleAddToCart}
                className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-stone-900 bg-white py-3.5 text-sm font-bold text-stone-900 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
              >
                <ShoppingCart className="h-4 w-4 text-stone-900" />
                Thêm vào giỏ hàng
              </button>

              <button
                type="button"
                disabled={isOutOfStock}
                onClick={handleCheckoutNow}
                className={`flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-bold text-white shadow-lg transition-all ${
                  isOutOfStock
                    ? 'cursor-not-allowed bg-stone-300 text-stone-500 shadow-none'
                    : isFlashSale
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                      : 'bg-stone-900 hover:bg-stone-800'
                }`}
              >
                <CreditCard className="h-4 w-4" />
                Thanh toán ngay
              </button>
            </div>

            {/* Storefront Perks */}
            <div className="space-y-2.5 border-t border-stone-100 pt-4 text-xs text-stone-600">
              <div className="flex items-center gap-2.5">
                <Truck className="h-4 w-4 text-stone-800 shrink-0" />
                <span>
                  <strong>Chuyển khoản 100%</strong> — Nhận miễn phí giao hàng hỏa tốc
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <RotateCcw className="h-4 w-4 text-stone-800 shrink-0" />
                <span>
                  <strong>Tùy chọn cọc 10%</strong> — Tối thiểu 200.000 ₫, số còn lại thu COD
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-stone-800 shrink-0" />
                <span>
                  <strong>Bảo hành Aura 2 năm</strong> — Bảo hành ủy quyền chính hãng
                </span>
              </div>
            </div>

            {isAdmin && isOutOfStock && (
              <div className="border-t border-stone-100 pt-3 text-center">
                <button
                  type="button"
                  onClick={() =>
                    resetMutation.mutate({
                      productId: product.id,
                      stock: isFlashSale ? 50 : 200,
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Nạp thêm tồn kho (50 sản phẩm)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
