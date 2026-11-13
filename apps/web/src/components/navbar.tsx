'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag,
  ShoppingCart,
  Flame,
  User,
  Truck,
  ShieldCheck,
  Sparkles,
  LayoutDashboard,
  Package,
  ChevronDown,
  KeyRound,
  LogOut,
  LogIn,
  Check,
  Search,
} from 'lucide-react';
import {
  apiClient,
  AUTH_CHANGE_EVENT,
  StoredUser,
  tokenStorage,
} from '@/lib/api';
import { useCart } from '@/hooks/use-cart';
import { useVerifiedAdmin } from '@/hooks/use-flash-sale';
import { cn } from '@/lib/utils';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { totalCount, mounted } = useCart();
  const { isAdmin } = useVerifiedAdmin();
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncUser = () => {
      setCurrentUser(tokenStorage.getUser());
    };

    setCurrentUser(tokenStorage.getUser());

    window.addEventListener(AUTH_CHANGE_EVENT, syncUser);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUser);
    };
  }, []);

  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSignOut() {
    try {
      await apiClient.logout();
    } catch {
      // Ignore
    }
    tokenStorage.clearSession();
    setCurrentUser(null);
    setDropdownOpen(false);
    router.push('/account');
  }

  const displayLabel = currentUser
    ? currentUser.fullName || currentUser.email.split('@')[0]
    : 'Tài khoản';

  return (
    <div className="sticky top-0 z-50">
      {/* Top retail utility bar */}
      <div className="bg-stone-900 px-4 py-1.5 text-xs text-stone-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-rose-400" />
            <span>
              <strong>Sự kiện Flash Deal đang diễn ra:</strong> 1 sản phẩm đầu tiên
              hưởng giá ưu đãi — Chuyển khoản 100% nhận Miễn phí giao hàng hỏa tốc.
            </span>
          </div>
          <div className="hidden items-center gap-6 text-[11px] text-stone-300 md:flex">
            <span className="flex items-center gap-1">
              <Truck className="h-3.5 w-3.5 text-emerald-400" />
              Freeship khi chuyển khoản đủ
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Hỗ trợ cọc 10% + Thanh toán khi nhận hàng (COD)
            </span>
          </div>
        </div>
      </div>

      {/* Compact Main Storefront Header */}
      <header className="border-b border-stone-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-stone-900">
                AURA<span className="text-rose-600">.</span>
              </span>
              <span className="hidden rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-stone-600 sm:inline-block">
                Công nghệ Flagship
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  pathname === '/'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                )}
              >
                Trang chủ
              </Link>
              <Link
                href="/products"
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  pathname?.startsWith('/products')
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                )}
              >
                Sản phẩm
              </Link>
              <Link
                href="/products?tier=FLASH_SALE"
                className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Flame className="h-3.5 w-3.5 fill-rose-600" />
                Flash Deals
              </Link>
              <Link
                href="/orders/lookup"
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  pathname === '/orders/lookup'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                )}
              >
                Tra cứu đơn
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Compact User Account Dropdown Box */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-bold text-stone-800 hover:border-stone-300 hover:bg-stone-100 transition-all"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white">
                  {currentUser ? (
                    displayLabel.slice(0, 1).toUpperCase()
                  ) : (
                    <User className="h-3 w-3 text-stone-200" />
                  )}
                </span>
                <span className="max-w-[130px] truncate">{displayLabel}</span>
                {isAdmin && (
                  <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[9px] font-black text-amber-950">
                    QUẢN TRỊ
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-stone-500 transition-transform',
                    dropdownOpen && 'rotate-180',
                  )}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl border border-stone-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50 space-y-1.5">
                  {/* Current User Info */}
                  <div className="rounded-xl bg-stone-50 px-3 py-2.5">
                    {currentUser ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-stone-900 truncate">
                            {displayLabel}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold',
                              currentUser.role === 'ADMIN'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-stone-200 text-stone-700',
                            )}
                          >
                            {currentUser.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-stone-500 truncate">
                          {currentUser.email}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs font-bold text-stone-700">
                        Phiên khách (Chưa đăng nhập)
                      </div>
                    )}
                  </div>

                  {/* Account Actions */}
                  <div className="space-y-0.5 py-1">
                    {currentUser ? (
                      <>
                        <Link
                          href="/account"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <User className="h-3.5 w-3.5 text-stone-500" />
                          Tài khoản &amp; Hồ sơ
                        </Link>

                        <Link
                          href="/orders"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Package className="h-3.5 w-3.5 text-stone-500" />
                          Lịch sử đơn hàng
                        </Link>

                        <Link
                          href="/orders/lookup"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Search className="h-3.5 w-3.5 text-stone-500" />
                          Tra cứu theo SĐT / Mã
                        </Link>

                        <Link
                          href="/account?tab=security"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <KeyRound className="h-3.5 w-3.5 text-stone-500" />
                          Đổi mật khẩu
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/account"
                          className="flex items-center gap-2.5 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-800"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Đăng nhập / Đăng ký
                        </Link>

                        <Link
                          href="/orders/lookup"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Search className="h-3.5 w-3.5 text-stone-500" />
                          Tra cứu đơn hàng
                        </Link>
                      </>
                    )}

                    <Link
                      href="/cart"
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                    >
                      <span className="flex items-center gap-2.5">
                        <ShoppingCart className="h-3.5 w-3.5 text-stone-500" />
                        Giỏ hàng của tôi
                      </span>
                      {mounted && totalCount > 0 && (
                        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          {totalCount}
                        </span>
                      )}
                    </Link>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        className="flex items-center justify-between rounded-xl bg-amber-50/70 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100/80"
                      >
                        <span className="flex items-center gap-2.5">
                          <LayoutDashboard className="h-3.5 w-3.5 text-amber-700" />
                          Bảng điều khiển Admin
                        </span>
                        <span className="text-[10px] font-bold text-amber-700">
                          Cổng quản trị riêng →
                        </span>
                      </Link>
                    )}
                  </div>

                  {/* Sign Out (when logged in) */}
                  {currentUser && (
                    <div className="border-t border-stone-100 pt-1.5">
                      <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shopping Cart Button with Dynamic Item Badge */}
            <Link
              href="/cart"
              className="relative inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-stone-800 transition-all shadow-sm"
            >
              <ShoppingCart className="h-4 w-4 text-stone-200" />
              <span>Giỏ hàng</span>
              {mounted && totalCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                  {totalCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}
