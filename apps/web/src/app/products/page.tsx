'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useProductsQuery, useVerifiedAdmin } from '@/hooks/use-flash-sale';
import { ProductCard } from '@/components/product-card';
import {
  getProductRetailMeta,
  RETAIL_CATEGORIES,
} from '@/lib/product-visuals';

function CatalogContent() {
  const searchParams = useSearchParams();
  const { isAdmin } = useVerifiedAdmin();
  const initialTier =
    (searchParams.get('tier') as 'ALL' | 'FLASH_SALE' | 'ACTIVE') ||
    (searchParams.get('status') as 'ALL' | 'FLASH_SALE' | 'ACTIVE') ||
    'ALL';
  const initialCat = searchParams.get('category') || 'All Categories';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | 'FLASH_SALE' | 'ACTIVE'>(
    initialTier,
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCat);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<
    'flash_first' | 'price_asc' | 'price_desc' | 'newest'
  >('flash_first');

  useEffect(() => {
    const tierParam = searchParams.get('tier') || searchParams.get('status');
    if (
      tierParam === 'FLASH_SALE' ||
      tierParam === 'ACTIVE' ||
      tierParam === 'ALL'
    ) {
      setStatus(tierParam);
    }
    const catParam = searchParams.get('category');
    if (catParam) {
      setSelectedCategory(catParam);
    }
  }, [searchParams]);

  const { data, isLoading } = useProductsQuery({
    search: search || undefined,
    status,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    inStockOnly,
    sort,
  });

  function handleResetFilters() {
    setSearch('');
    setStatus('ALL');
    setSelectedCategory('All Categories');
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setSort('flash_first');
  }

  const rawItems = (data?.items ?? []).filter(
    (item) => item.status !== 'ARCHIVED',
  );

  const filteredItems = rawItems.filter((item) => {
    if (selectedCategory !== 'All Categories') {
      const cat = getProductRetailMeta(
        item.slug,
        item.status === 'FLASH_SALE',
      ).category;
      if (cat !== selectedCategory) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Page Title & Search Bar */}
      <div className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-6 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
            {status === 'FLASH_SALE'
              ? '⚡ Flash Deals Giới Hạn'
              : selectedCategory !== 'All Categories'
                ? selectedCategory
                : 'Tất cả thiết bị Flagship'}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {isAdmin
              ? `Hiển thị ${filteredItems.length} sản phẩm tuyển chọn với tồn kho thời gian thực và chính sách giảm giá sản phẩm đầu tiên.`
              : 'Khám phá bộ sưu tập phần cứng chính hãng tuyển chọn với chính sách giảm giá cho sản phẩm đầu tiên.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm thương hiệu, model hoặc cấu hình..."
              className="w-full rounded-full border border-stone-300 bg-white py-2 pl-9 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
            />
          </div>

          <select
            aria-label="Sắp xếp sản phẩm"
            value={sort}
            onChange={(e) =>
              setSort(
                e.target.value as
                  | 'flash_first'
                  | 'price_asc'
                  | 'price_desc'
                  | 'newest',
              )
            }
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 focus:border-stone-900 focus:outline-none"
          >
            <option value="flash_first">Nổi bật &amp; Flash Deals</option>
            <option value="price_asc">Giá: Thấp đến Cao</option>
            <option value="price_desc">Giá: Cao đến Thấp</option>
            <option value="newest">Sản phẩm mới nhất</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Retail Filter Sidebar */}
        <aside className="space-y-6 lg:col-span-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-900">
                Bộ lọc
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                Xóa tất cả
              </button>
            </div>

            {/* Collection / Deal Filter */}
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <label className="block text-xs font-bold text-stone-800">
                Bộ sưu tập
              </label>
              <div className="space-y-1">
                {[
                  { id: 'ALL', label: 'Tất cả sản phẩm' },
                  { id: 'FLASH_SALE', label: '⚡ Flash Deals Giới hạn' },
                  { id: 'ACTIVE', label: 'Danh mục tiêu chuẩn' },
                ].map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() =>
                      setStatus(tier.id as 'ALL' | 'FLASH_SALE' | 'ACTIVE')
                    }
                    className={`w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      status === tier.id
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <label className="block text-xs font-bold text-stone-800">
                Phân loại
              </label>
              <div className="space-y-1">
                {RETAIL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-rose-50 font-bold text-rose-700'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range Filter */}
            <div className="space-y-3 border-t border-stone-100 pt-4">
              <label className="block text-xs font-bold text-stone-800">
                Khoảng giá (₫)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="Từ"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                />
                <span className="text-stone-400">–</span>
                <input
                  type="number"
                  min={0}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Đến"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Availability Checkbox */}
            <div className="border-t border-stone-100 pt-4">
              <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                Chỉ hiển thị hàng có sẵn
              </label>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="lg:col-span-9">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-80 animate-pulse rounded-2xl border border-stone-200 bg-white"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center shadow-sm">
              <SlidersHorizontal className="mx-auto h-8 w-8 text-stone-400" />
              <h3 className="mt-3 text-base font-bold text-stone-900">
                Không tìm thấy sản phẩm phù hợp
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                Hãy thử xóa bớt bộ lọc thẻ hoặc giá tiền.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 rounded-full bg-stone-900 px-5 py-2 text-xs font-bold text-white"
              >
                Đặt lại tất cả bộ lọc
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductsCatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-2xl border border-stone-200 bg-white" />
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
