'use client';

import React from 'react';
import Link from 'next/link';
import {
  Flame,
  ArrowRight,
  Truck,
  ShieldCheck,
  RotateCcw,
  Headphones,
  Cpu,
  Monitor,
  Laptop,
} from 'lucide-react';
import { useProductsQuery, useVerifiedAdmin } from '@/hooks/use-flash-sale';
import { ProductCard } from '@/components/product-card';

const FEATURED_CATEGORIES = [
  {
    name: 'Card đồ họa & CPU',
    subtitle: 'RTX 50-Series, Ryzen 9 X3D & Bo mạch chủ Flagship',
    icon: Cpu,
    href: `/products?category=${encodeURIComponent('Card đồ họa & CPU')}`,
  },
  {
    name: 'Laptop & Máy cầm tay',
    subtitle: 'MacBook Pro M4 Max & Steam Deck OLED',
    icon: Laptop,
    href: `/products?category=${encodeURIComponent('Laptop & Máy cầm tay')}`,
  },
  {
    name: 'Âm thanh & Microphone',
    subtitle: 'Sony XM6, Sennheiser HD 800 S & Shure SM7dB',
    icon: Headphones,
    href: `/products?category=${encodeURIComponent('Âm thanh & Microphone')}`,
  },
  {
    name: 'Màn hình & Bàn ghế',
    subtitle: '240Hz 4K OLEDs, Herman Miller & Secretlab',
    icon: Monitor,
    href: `/products?category=${encodeURIComponent('Màn hình & Đèn bàn')}`,
  },
];

export default function HomePage() {
  const { isAdmin } = useVerifiedAdmin();
  const { data: catalogData, isLoading } = useProductsQuery({
    sort: 'flash_first',
  });

  const allItems = (catalogData?.items ?? []).filter(
    (item) => item.status !== 'ARCHIVED',
  );
  const flashDeals = allItems.filter((item) => item.status === 'FLASH_SALE');

  const regularItems = allItems.filter((item) => item.status !== 'FLASH_SALE');
  const featuredCatalog = regularItems.slice(0, 6);

  return (
    <div className="space-y-14">
      {/* Editorial Retail Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-stone-900 px-6 py-12 text-white shadow-xl sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(225,29,72,0.28),transparent_55%)]" />
        <div className="relative z-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
              <Flame className="h-3.5 w-3.5 fill-current" />
              Sự kiện Flash Deal • Ưu đãi sản phẩm đầu tiên
            </div>

            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
              Phần Cứng Đỉnh Cao. Giá Trị Vượt Bậc.
            </h1>

            <p className="max-w-xl text-sm leading-relaxed text-stone-300 sm:text-base">
              Khám phá bộ sưu tập chọn lọc các dòng card đồ họa cao cấp, máy trạm
              làm việc, tai nghe tham chiếu studio và giải pháp bàn ghế công thái học.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/products?tier=FLASH_SALE"
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500 transition-all"
              >
                Săn Flash Deals
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800/80 px-6 py-3.5 text-sm font-semibold text-white hover:bg-stone-800 transition-colors"
              >
                {isAdmin
                  ? `Xem tất cả ${allItems.length || 22} sản phẩm`
                  : 'Xem tất cả sản phẩm'}
              </Link>
            </div>
          </div>

                </div>
      </section>

      {/* Storefront Trust & Perks Strip */}
      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-3">
        <div className="flex items-center gap-3.5 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-800">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-900">
              Giao hàng hỏa tốc miễn phí
            </div>
            <div className="text-xs text-stone-500">
              Miễn phí giao hàng khi chuyển khoản đủ 100%
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-800">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-900">
              Bảo hành chính hãng 2 năm
            </div>
            <div className="text-xs text-stone-500">
              100% sản phẩm nguyên seal phân phối chính thức
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-800">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-900">
              Đổi trả linh hoạt 30 ngày
            </div>
            <div className="text-xs text-stone-500">
              Hỗ trợ đổi mới hoặc hoàn tiền nhanh chóng
            </div>
          </div>
        </div>
      </section>

      {/* Limited-Time Flash Deals Section */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-600">
              <Flame className="h-4 w-4 fill-rose-600" />
              Phát hành giới hạn
            </div>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-stone-900">
              Flash Deals Hôm Nay
            </h2>
          </div>
          <Link
            href="/products?tier=FLASH_SALE"
            className="inline-flex items-center gap-1 text-xs font-bold text-stone-700 hover:text-rose-600"
          >
            Xem tất cả deals <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-2xl border border-stone-200 bg-white"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {flashDeals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Shop by Category */}
      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">
            Danh mục sản phẩm
          </h2>
          <p className="text-xs text-stone-500">
            Khám phá các phân khúc phần cứng máy tính và thiết bị âm thanh studio được quan tâm nhất.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.name}
                href={cat.href}
                className="group flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-white group-hover:bg-rose-600 transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-stone-900 group-hover:text-rose-600">
                    {cat.name}
                  </h3>
                  <p className="mt-1 text-xs text-stone-500">{cat.subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bestselling Flagship Products */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">
              Danh mục Flagship Thịnh Hành
            </h2>
            <p className="text-xs text-stone-500">
              {isAdmin
                ? 'Duyệt toàn bộ danh mục phần cứng tuyển chọn. Mọi thay đổi trong trang Admin sẽ hiển thị trực tiếp tại đây.'
                : 'Duyệt toàn bộ danh mục phần cứng chính hãng tuyển chọn với chế độ bảo hành 2 năm.'}
            </p>
          </div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-xs font-bold text-stone-700 hover:text-rose-600"
          >
            {isAdmin
              ? `Xem tất cả ${allItems.length} sản phẩm`
              : 'Xem tất cả sản phẩm'}{' '}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredCatalog.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
