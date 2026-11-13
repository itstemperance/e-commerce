'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  Lock,
  LogIn,
  Home,
  Loader2,
  XCircle,
} from 'lucide-react';
import {
  apiClient,
  AUTH_CHANGE_EVENT,
  StoredUser,
  tokenStorage,
} from '@/lib/api';

type AuthCheckState =
  | { status: 'checking' }
  | { status: 'authorized' }
  | {
      status: 'denied';
      statusCode: number;
      message: string;
      currentUser: StoredUser | null;
    };

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthCheckState>({ status: 'checking' });
  const [countdown, setCountdown] = useState<number>(6);
  const [autoRedirectEnabled, setAutoRedirectEnabled] = useState<boolean>(true);

  const checkAdminCredentials = useCallback(async () => {
    setState({ status: 'checking' });
    const currentUser = tokenStorage.getUser();

    try {
      const res = await apiClient.verifyAdminAccess();
      if (res.authorized && res.user?.role === 'ADMIN') {
        setState({ status: 'authorized' });
        return;
      }

      setState({
        status: 'denied',
        statusCode: 403,
        message:
          'Không có quyền hạn: Tài khoản của bạn không có quyền Quản trị viên (Admin).',
        currentUser,
      });
    } catch (err) {
      const apiErr = err as Error & { statusCode?: number };
      const statusCode = apiErr.statusCode ?? (currentUser ? 403 : 401);

      if (statusCode === 401 && currentUser) {
        tokenStorage.clearSession();
      }

      setState({
        status: 'denied',
        statusCode,
        message:
          apiErr.message ||
          (statusCode === 401
            ? 'Chưa đăng nhập: Vui lòng đăng nhập bằng tài khoản Quản trị viên (Admin).'
            : 'Không có quyền hạn: Tài khoản của bạn không có quyền Quản trị viên (Admin).'),
        currentUser: statusCode === 401 ? null : currentUser,
      });
      setCountdown(6);
      setAutoRedirectEnabled(true);
    }
  }, []);

  useEffect(() => {
    void checkAdminCredentials();

    const handleAuthChange = () => {
      void checkAdminCredentials();
    };
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    };
  }, [checkAdminCredentials]);

  const deniedStatusCode = state.status === 'denied' ? state.statusCode : 0;
  const redirectTarget = deniedStatusCode === 401 ? '/account' : '/';

  useEffect(() => {
    if (state.status !== 'denied' || !autoRedirectEnabled) {
      return;
    }

    if (countdown <= 0) {
      router.replace(redirectTarget);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [state.status, autoRedirectEnabled, countdown, router, redirectTarget]);

  if (state.status === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-4 text-stone-900">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-rose-600" />
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-stone-900">
              Đang xác thực quyền Quản trị viên (Admin)...
            </p>
            <p className="text-xs text-stone-500">
              Hệ thống đang kiểm tra phiên đăng nhập và quyền truy cập từ máy chủ.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'denied') {
    const isUnauthenticated = state.statusCode === 401;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-4 py-12 text-stone-900">
        <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-600">
              {isUnauthenticated ? (
                <Lock className="h-6 w-6" />
              ) : (
                <ShieldAlert className="h-6 w-6" />
              )}
            </div>

            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                <XCircle className="h-3 w-3" />
                {isUnauthenticated
                  ? 'HTTP 401 — Chưa đăng nhập'
                  : 'HTTP 403 — Không có quyền hạn'}
              </span>
              <h1 className="text-lg sm:text-xl font-black text-stone-900">
                {isUnauthenticated
                  ? 'Yêu cầu đăng nhập Tài khoản Quản Trị'
                  : 'Không có quyền truy cập Trang Quản Trị'}
              </h1>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed text-stone-700 space-y-2">
            <p className="font-semibold text-rose-700">{state.message}</p>

            {state.currentUser && (
              <p className="text-stone-600 pt-2 border-t border-stone-200">
                Tài khoản hiện tại:{' '}
                <span className="font-bold text-stone-900">
                  {state.currentUser.email}
                </span>{' '}
                (Vai trò:{' '}
                <span className="font-bold text-amber-700">
                  {state.currentUser.role === 'CUSTOMER'
                    ? 'Khách hàng (CUSTOMER)'
                    : state.currentUser.role}
                </span>
                ). Vui lòng chuyển sang tài khoản có quyền Quản trị viên (ADMIN).
              </p>
            )}
          </div>

          {autoRedirectEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              <span>
                Tự động chuyển về{' '}
                <strong>
                  {isUnauthenticated ? 'Trang đăng nhập' : 'Trang chính'}
                </strong>{' '}
                sau <strong className="font-mono text-amber-900">{countdown}s</strong>...
              </span>
              <button
                type="button"
                onClick={() => setAutoRedirectEnabled(false)}
                className="font-bold text-amber-900 underline hover:text-amber-700"
              >
                Dừng đếm ngược
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Link
              href="/account"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-xs font-black text-white hover:bg-stone-800 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              Đi tới Trang Đăng nhập
            </Link>
            <Link
              href="/"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-xs font-bold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <Home className="h-4 w-4" />
              Quay về Trang chính
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
