'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { AdminAuthGuard } from '@/components/admin-auth-guard';

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-[#faf9f6] text-stone-900">
        <AdminAuthGuard>{children}</AdminAuthGuard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f6] text-stone-900">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="mt-16 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="space-y-3">
              <div className="text-xl font-black tracking-tight text-stone-900">
                AURA<span className="text-rose-600">.</span>
              </div>
              <p className="text-xs leading-relaxed text-stone-500">
                Nhà phân phối ủy quyền thiết bị công nghệ flagship, âm thanh studio
                và giải pháp góc làm việc cao cấp. Mọi đơn hàng đều đi kèm chính sách
                bảo hành chính hãng 2 năm.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                Danh mục sản phẩm
              </h4>
              <ul className="mt-3 space-y-2 text-xs text-stone-600">
                <li>
                  <Link
                    href="/products?status=FLASH_SALE"
                    className="hover:text-rose-600"
                  >
                    ⚡ Flash Deals Giới hạn
                  </Link>
                </li>
                <li>
                  <Link href="/products" className="hover:text-rose-600">
                    Tất cả thiết bị Flagship
                  </Link>
                </li>
                <li>
                  <Link href="/checkout" className="hover:text-rose-600">
                    Thanh toán nhanh
                  </Link>
                </li>
                <li>
                  <Link href="/orders/lookup" className="hover:text-rose-600 font-bold text-stone-900">
                    Tra cứu đơn hàng
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                Chính sách &amp; Dịch vụ
              </h4>
              <ul className="mt-3 space-y-2 text-xs text-stone-600">
                <li>Miễn phí vận chuyển khi chuyển khoản 100%</li>
                <li>Tùy chọn cọc 10% (tối thiểu 200.000 ₫) + COD</li>
                <li>Bảo hành chính hãng nhà sản xuất 2 năm</li>
                <li>Ưu đãi giá giảm cho sản phẩm đầu tiên</li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                Giữ hàng an toàn
              </h4>
              <p className="mt-3 text-xs leading-relaxed text-stone-500">
                Hệ thống khóa tồn kho nguyên tử tự động giữ hàng trong 15 phút tại
                bước thanh toán trong khi bạn quét mã QR chuyển khoản ngân hàng.
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-stone-100 pt-6 text-xs text-stone-400 sm:flex-row">
            <span>
              © {new Date().getFullYear()} Aura Retail Inc. Bảo lưu mọi quyền.
            </span>
            <span>Chuyển khoản QR trực tiếp • Đặt cọc 10% + Thu hộ COD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
