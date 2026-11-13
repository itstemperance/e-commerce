'use client';

import React from 'react';
import Link from 'next/link';
import { Star, Images, ArrowRight } from 'lucide-react';
import { ProductCatalogItem } from '@/lib/api';
import { useVerifiedAdmin } from '@/hooks/use-flash-sale';
import { formatCurrency } from '@/lib/utils';
import { getProductRetailMeta } from '@/lib/product-visuals';
import { ProductVisual } from '@/components/product-visual';

export function ProductCard({ product }: { product: ProductCatalogItem }) {
  const { isAdmin } = useVerifiedAdmin();

  const isFlashSale = product.status === 'FLASH_SALE';
  const meta = getProductRetailMeta(product.slug, isFlashSale);
  const available = product.inventory.available_stock;
  const total = Math.max(product.inventory.total_stock, available, 1);
  const claimedPercent = Math.min(
    100,
    Math.max(8, Math.round(((total - available) / total) * 100)),
  );
  const isStatusOutOfStock = product.status === 'OUT_OF_STOCK';
  const isOutOfStock = isStatusOutOfStock || available <= 0;

  const primaryPhoto = product.images?.[0];
  const photoCount = product.images?.length ?? 0;
  const normalPrice =
    product.originalPrice && product.originalPrice > product.price
      ? product.originalPrice
      : meta.originalPrice && meta.originalPrice > product.price
        ? meta.originalPrice
        : undefined;

  return (
    <div
      className={`group flex flex-col justify-between rounded-2xl border bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        isFlashSale
          ? 'border-rose-200 ring-1 ring-rose-500/10'
          : 'border-stone-200/90 hover:border-stone-300'
      }`}
    >
      <div>
        <Link
          href={`/products/${product.slug}`}
          className="relative block overflow-hidden rounded-2xl bg-stone-950"
        >
          {primaryPhoto ? (
            <div className="relative h-48 w-full overflow-hidden">
              <img
                src={primaryPhoto}
                alt={product.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {isFlashSale && (
                <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                  ⚡ Flash Deal
                </span>
              )}
              {photoCount > 1 && (
                <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  <Images className="h-3 w-3" />
                  {photoCount} ảnh
                </span>
              )}
            </div>
          ) : (
            <ProductVisual meta={meta} isFlashSale={isFlashSale} size="card" />
          )}
        </Link>

        <div className="mt-4 space-y-2 px-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-stone-500">
              {meta.brand}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-stone-700">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {meta.rating.toFixed(1)}
              <span className="text-stone-400">({meta.reviewCount})</span>
            </span>
          </div>

          <Link href={`/products/${product.slug}`} className="block">
            <h3 className="text-base font-bold text-stone-900 group-hover:text-rose-600 transition-colors line-clamp-2">
              {product.title}
            </h3>
          </Link>

          <p className="text-xs leading-relaxed text-stone-500 line-clamp-2">
            {product.description}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-stone-100 px-1 pt-3">
        {/* Flash Deal Urgency Bar or Standard Availability */}
        {isFlashSale ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span
                className={isOutOfStock ? 'text-stone-400' : 'text-rose-600'}
              >
                {isOutOfStock
                  ? 'Đã hết suất ưu đãi'
                  : isAdmin
                    ? `Quản trị kho: Còn ${available} / ${total}`
                    : 'Nhanh tay — Flash Deal đang diễn ra'}
              </span>
              {isAdmin && (
                <span className="text-stone-500">Đã bán {claimedPercent}%</span>
              )}
            </div>
            {isAdmin && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-500"
                  style={{ width: `${isOutOfStock ? 100 : claimedPercent}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs">
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                isOutOfStock ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isOutOfStock ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
              />
              {isOutOfStock
                ? 'Tạm hết hàng'
                : isAdmin
                  ? `Quản trị kho: Còn ${available} / ${total}`
                  : 'Còn hàng • Giao nhanh trong ngày'}
            </span>
          </div>
        )}

        {/* Pricing & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div>
            {isStatusOutOfStock ? (
              <span className="text-lg font-extrabold text-rose-600">
                Liên hệ
              </span>
            ) : (
              <>
                {isFlashSale && normalPrice && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-stone-400 line-through">
                      {formatCurrency(normalPrice)}
                    </span>
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">
                      Giá ưu đãi sp 1
                    </span>
                  </div>
                )}
                <span className="text-lg font-extrabold text-stone-900">
                  {formatCurrency(product.price)}
                </span>
              </>
            )}
          </div>

          <Link
            href={`/products/${product.slug}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-colors shadow-sm"
          >
            <span>Xem chi tiết</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
