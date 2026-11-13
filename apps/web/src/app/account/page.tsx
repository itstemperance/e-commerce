'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  User,
  Lock,
  Mail,
  ShieldCheck,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Package,
  QrCode,
  PlusCircle,
  LayoutDashboard,
  Eye,
  EyeOff,
  KeyRound,
  UserPlus,
  LogIn,
  Phone,
  MapPin,
} from 'lucide-react';
import {
  apiClient,
  AUTH_CHANGE_EVENT,
  StoredUser,
  tokenStorage,
} from '@/lib/api';
import {
  useProfileQuery,
  useOrdersListQuery,
  useSimulatePaymentMutation,
  useCancelOrderMutation,
  useVerifiedAdmin,
} from '@/hooks/use-flash-sale';
import { formatCurrency, generateUuidV4 } from '@/lib/utils';

function AccountPageContent() {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('tab');
  const queryClient = useQueryClient();
  const { isAdmin } = useVerifiedAdmin();

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'security' | 'orders' | 'auth'
  >('overview');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Login / Register state
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authAddress, setAuthAddress] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Profile update state
  const [profileEmail, setProfileEmail] = useState('');
  const [profileFullName, setProfileFullName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const { data: profileData, refetch: refetchProfile } = useProfileQuery();
  const { data: userOrders, refetch: refetchOrders } = useOrdersListQuery({
    all: false,
  });
  const payMutation = useSimulatePaymentMutation();
  const cancelMutation = useCancelOrderMutation();

  useEffect(() => {
    if (
      initialTabParam === 'security' ||
      initialTabParam === 'orders' ||
      initialTabParam === 'auth' ||
      initialTabParam === 'overview'
    ) {
      setActiveTab(initialTabParam);
    }
  }, [initialTabParam]);

  useEffect(() => {
    const sync = () => {
      const user = tokenStorage.getUser();
      setCurrentUser(user);
      if (user) {
        setProfileEmail(user.email);
        if (user.fullName) setProfileFullName(user.fullName);
        if (user.phone) setProfilePhone(user.phone);
        if (user.address) setProfileAddress(user.address);
      }
    };
    sync();
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (profileData) {
      setProfileEmail(profileData.email);
      setProfileFullName(profileData.fullName ?? '');
      setProfilePhone(profileData.phone ?? '');
      setProfileAddress(profileData.address ?? '');
    }
  }, [profileData]);

  async function handleLoginOrRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (authMode === 'register' && authPassword !== authConfirmPassword) {
      setAuthError('Mật khẩu xác nhận không khớp');
      return;
    }

    setAuthLoading(true);
    try {
      const res =
        authMode === 'login'
          ? await apiClient.login(authEmail, authPassword)
          : await apiClient.register(authEmail, authPassword, {
              fullName: authFullName.trim() || undefined,
              phone: authPhone.trim() || undefined,
              address: authAddress.trim() || undefined,
            });

      tokenStorage.setSession(res.accessToken, res.refreshToken, res.user);
      setCurrentUser(res.user);
      setProfileEmail(res.user.email);
      setProfileFullName(res.user.fullName ?? '');
      setProfilePhone(res.user.phone ?? '');
      setProfileAddress(res.user.address ?? '');
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAuthSuccess(
        authMode === 'login'
          ? `Đã đăng nhập thành công với tài khoản ${res.user.email}`
          : `Tạo tài khoản thành công! Chào mừng, ${res.user.email}`,
      );
      setActiveTab('overview');
      void refetchProfile();
      void refetchOrders();
      void queryClient.invalidateQueries({ queryKey: ['orders-list'] });
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await apiClient.logout();
    } catch {
      // Ignore if already expired
    }
    tokenStorage.clearSession();
    setCurrentUser(null);
    setActiveTab('auth');
    setAuthSuccess('Bạn đã đăng xuất thành công.');
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMessage(null);
    setProfileLoading(true);
    try {
      const res = await apiClient.updateProfile({
        email: profileEmail,
        fullName: profileFullName,
        phone: profilePhone,
        address: profileAddress,
      });
      tokenStorage.setSession(res.accessToken, res.refreshToken, res.user);
      setCurrentUser(res.user);
      setProfileMessage({ type: 'success', text: res.message || 'Cập nhật hồ sơ thành công!' });
      void refetchProfile();
    } catch (err) {
      setProfileMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({
        type: 'error',
        text: 'Mật khẩu mới phải có ít nhất 8 ký tự',
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({
        type: 'error',
        text: 'Mật khẩu mới và xác nhận mật khẩu không khớp',
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await apiClient.changePassword(currentPassword, newPassword);
      tokenStorage.setSession(res.accessToken, res.refreshToken, res.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMessage({
        type: 'success',
        text: res.message || 'Đổi mật khẩu thành công!',
      });
    } catch (err) {
      setPasswordMessage({
        type: 'error',
        text: (err as Error).message,
      });
    } finally {
      setPasswordLoading(false);
    }
  }

  const isSignedOut = !currentUser;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
            Cổng thành viên AURA
          </span>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
            {currentUser
              ? `Tài khoản — ${currentUser.fullName || currentUser.email}`
              : 'Đăng nhập hoặc Tạo tài khoản'}
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Quản lý thông tin đăng nhập, bảo mật mật khẩu, hồ sơ giao hàng và
            đơn hàng giữ chỗ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 shadow-sm hover:bg-amber-400 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
              Mở Bảng điều khiển Quản trị
            </Link>
          )}

          {currentUser && (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {authSuccess && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{authSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setAuthSuccess(null)}
            className="text-emerald-700 hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
        {currentUser && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === 'overview'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Hồ sơ &amp; Tổng quan
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === 'security'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Đổi mật khẩu &amp; Bảo mật
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === 'orders'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Đơn hàng của tôi ({userOrders?.length ?? 0})
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('auth')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
            activeTab === 'auth' || isSignedOut
              ? 'bg-rose-600 text-white'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          {isSignedOut
            ? 'Đăng nhập / Tạo tài khoản'
            : 'Đổi tài khoản / Đăng ký mới'}
        </button>
      </div>

      {/* TAB 1: SIGN IN / SIGN UP (Also shown when signed out) */}
      {(activeTab === 'auth' || isSignedOut) && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Login / Sign Up Form */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
              <div className="flex items-center gap-2 rounded-2xl bg-stone-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                    authMode === 'login'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <LogIn className="h-4 w-4" />
                  Đăng nhập tài khoản
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                    authMode === 'register'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Tạo tài khoản mới
                </button>
              </div>

              <div>
                <h2 className="text-lg font-extrabold text-stone-900">
                  {authMode === 'login'
                    ? 'Chào mừng trở lại với AURA'
                    : 'Tạo tài khoản AURA của bạn'}
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {authMode === 'login'
                    ? 'Nhập email và mật khẩu của bạn để truy cập đơn hàng và thanh toán nhanh chóng.'
                    : 'Đăng ký tài khoản bảo mật bằng mã hóa Argon2id cùng thông tin giao hàng đầy đủ.'}
                </p>
              </div>

              {authError && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <form
                onSubmit={(e) => void handleLoginOrRegister(e)}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-700">
                    Địa chỉ Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="ban@example.com"
                      className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                    />
                  </div>
                </div>

                {authMode === 'register' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700">
                        Họ và tên (Tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={authFullName}
                        onChange={(e) => setAuthFullName(e.target.value)}
                        placeholder="Alice Mercer"
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700">
                        Số điện thoại (Tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        placeholder="+84 909 123 456"
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-700">
                    Mật khẩu {authMode === 'register' && '(Tối thiểu 8 ký tự)'}
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      required
                      minLength={authMode === 'register' ? 8 : 1}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-700"
                    >
                      {showAuthPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {authMode === 'register' && (
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-stone-700">
                      Xác nhận mật khẩu
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
                      <input
                        type={showAuthPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu của bạn"
                        className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 py-3.5 text-xs font-bold text-white shadow-md hover:bg-stone-800 disabled:opacity-50 transition-all"
                >
                  {authLoading
                    ? 'Đang xác thực...'
                    : authMode === 'login'
                      ? 'Đăng nhập vào tài khoản'
                      : 'Đăng ký & Đăng nhập ngay'}
                </button>
              </form>
            </div>
          </div>

          {/* Right: Member Benefits Informational Card */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-stone-200 bg-gradient-to-br from-stone-50 to-white p-6 shadow-sm space-y-5">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
                  Đặc quyền thành viên AURA
                </span>
                <h3 className="mt-1 text-lg font-black text-stone-900">
                  Lợi ích khi đăng ký tài khoản
                </h3>
                <p className="mt-1 text-xs text-stone-500 leading-relaxed">
                  Tạo tài khoản hoàn toàn miễn phí chỉ trong 30 giây để tận hưởng trải nghiệm mua sắm công nghệ tốt nhất.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 font-bold">
                    📦
                  </div>
                  <div>
                    <div className="font-bold text-stone-900">Theo dõi đơn hàng thời gian thực</div>
                    <div className="mt-0.5 text-[11px] text-stone-500 leading-normal">
                      Tra cứu lịch sử đơn, tiến độ xử lý và trạng thái thanh toán VietQR mọi lúc, mọi nơi.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 font-bold">
                    ⚡
                  </div>
                  <div>
                    <div className="font-bold text-stone-900">Ưu tiên giữ suất Flash Deals</div>
                    <div className="mt-0.5 text-[11px] text-stone-500 leading-normal">
                      Hưởng cơ chế khóa tồn kho thông minh trong 15 phút cho các siêu phẩm phần cứng giới hạn.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold">
                    🛡️
                  </div>
                  <div>
                    <div className="font-bold text-stone-900">Bảo hành điện tử chính hãng 2 năm</div>
                    <div className="mt-0.5 text-[11px] text-stone-500 leading-normal">
                      Tự động kích hoạt bảo hành bằng số điện thoại và email, bảo vệ quyền lợi tối đa khi sử dụng.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                    📍
                  </div>
                  <div>
                    <div className="font-bold text-stone-900">Lưu sổ địa chỉ giao hàng tiện lợi</div>
                    <div className="mt-0.5 text-[11px] text-stone-500 leading-normal">
                      Không cần nhập lại họ tên, số điện thoại hay địa chỉ trong các đợt mở bán tiếp theo.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFILE & OVERVIEW */}
      {currentUser && activeTab === 'overview' && (
        <div className="space-y-8">
          {/* KPI Metrics Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold text-stone-500">
                Tổng số đơn đã đặt
              </div>
              <div className="mt-2 text-2xl font-black text-stone-900">
                {profileData?.stats.totalOrders ?? userOrders?.length ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-stone-400">
                Tổng đơn hàng trên AURA
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold text-stone-500">
                Đã thanh toán &amp; Xác nhận
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-700">
                {profileData?.stats.paidOrders ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-stone-400">
                Đã kiểm tra &amp; xuất kho
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold text-stone-500">
                Đơn đang giữ chỗ
              </div>
              <div className="mt-2 text-2xl font-black text-amber-600">
                {profileData?.stats.pendingOrders ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-stone-400">
                Giữ hàng trong 15 phút
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold text-stone-500">
                Tổng chi tiêu thành công
              </div>
              <div className="mt-2 text-2xl font-black text-stone-900">
                {formatCurrency(profileData?.stats.totalSpent ?? 0)}
              </div>
              <div className="mt-1 text-[11px] text-stone-400">
                Đơn chuyển khoản VietQR &amp; COD
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left: Update Extended Profile Details */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-5">
                <div>
                  <h2 className="text-base font-extrabold text-stone-900">
                    Thông tin hồ sơ tài khoản
                  </h2>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Cập nhật email, họ tên, số điện thoại và địa chỉ giao hàng
                    mặc định.
                  </p>
                </div>

                {profileMessage && (
                  <div
                    className={`flex items-center gap-2 rounded-xl border p-3.5 text-xs font-semibold ${
                      profileMessage.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {profileMessage.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span>{profileMessage.text}</span>
                  </div>
                )}

                <form
                  onSubmit={(e) => void handleUpdateProfile(e)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700">
                        Địa chỉ Email
                      </label>
                      <input
                        type="email"
                        required
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700">
                        Họ và tên
                      </label>
                      <input
                        type="text"
                        value={profileFullName}
                        onChange={(e) => setProfileFullName(e.target.value)}
                        placeholder="Alice Mercer"
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700 flex items-center gap-1">
                        <Phone className="h-3 w-3 text-stone-400" />
                        Số điện thoại
                      </label>
                      <input
                        type="text"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="+84 909 123 456"
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-stone-400" />
                        Địa chỉ giao hàng
                      </label>
                      <input
                        type="text"
                        value={profileAddress}
                        onChange={(e) => setProfileAddress(e.target.value)}
                        placeholder="Số 123 Đường Lê Lợi, Quận 1, TP. Hồ Chí Minh"
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-500">
                        Vai trò tài khoản
                      </label>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-bold text-stone-800">
                        {currentUser.role === 'ADMIN' ? 'Quản trị viên (ADMIN)' : 'Khách hàng (CUSTOMER)'}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-500">
                        Thành viên từ
                      </label>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-medium text-stone-700">
                        {profileData?.created_at
                          ? new Date(
                              profileData.created_at,
                            ).toLocaleDateString('vi-VN')
                          : 'Thành viên chính thức'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={profileLoading}
                      className="rounded-full bg-stone-900 px-6 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
                    >
                      {profileLoading ? 'Đang lưu...' : 'Lưu hồ sơ'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('security')}
                      className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      Đổi mật khẩu →
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right: Quick Account Actions */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-extrabold text-stone-900">
                  Lối tắt nhanh
                </h3>

                <div className="space-y-2.5">
                  <Link
                    href="/orders"
                    className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs font-bold text-stone-900 hover:border-stone-300 hover:bg-white transition-all"
                  >
                    <span className="flex items-center gap-2.5">
                      <PlusCircle className="h-4 w-4 text-rose-600" />
                      Tạo đơn hàng nhiều sản phẩm
                    </span>
                    <span>→</span>
                  </Link>

                  <Link
                    href="/checkout"
                    className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs font-bold text-stone-900 hover:border-stone-300 hover:bg-white transition-all"
                  >
                    <span className="flex items-center gap-2.5">
                      <QrCode className="h-4 w-4 text-emerald-600" />
                      Thanh toán quét mã VietQR
                    </span>
                    <span>→</span>
                  </Link>

                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs font-bold text-stone-900 hover:border-stone-300 hover:bg-white transition-all"
                    >
                      <span className="flex items-center gap-2.5">
                        <LayoutDashboard className="h-4 w-4 text-amber-600" />
                        Bảng điều khiển Quản trị viên
                      </span>
                      <span>→</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PASSWORD & SECURITY */}
      {currentUser && activeTab === 'security' && (
        <div className="max-w-2xl">
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-rose-600" />
                  Đổi mật khẩu tài khoản
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Cập nhật mật khẩu cho tài khoản <strong>{currentUser.email}</strong>.
                  Các tài khoản mẫu sử dụng mật khẩu mặc định <code>Password123!</code>.
                </p>
              </div>
              <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
            </div>

            {passwordMessage && (
              <div
                className={`flex items-center gap-2 rounded-xl border p-3.5 text-xs font-semibold ${
                  passwordMessage.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {passwordMessage.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{passwordMessage.text}</span>
              </div>
            )}

            <form
              onSubmit={(e) => void handleChangePassword(e)}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-700">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại (ví dụ: Password123!)"
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((v) => !v)}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-700"
                  >
                    {showPasswords ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-700">
                  Mật khẩu mới (tối thiểu 8 ký tự)
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-stone-700">
                  Xác nhận mật khẩu mới
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-full bg-rose-600 px-6 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50 transition-all"
                >
                  {passwordLoading
                    ? 'Đang cập nhật mật khẩu...'
                    : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: MY ORDERS */}
      {currentUser && activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-extrabold text-stone-900">
              Đơn hàng của {currentUser.email}
            </h2>
            <Link
              href="/orders"
              className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Tạo đơn hàng mới
            </Link>
          </div>

          {!userOrders || userOrders.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center shadow-sm">
              <Package className="mx-auto h-8 w-8 text-stone-400" />
              <h3 className="mt-3 text-sm font-bold text-stone-900">
                Chưa có đơn hàng nào
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                Hãy đặt mua sản phẩm Flash Deal hoặc tạo đơn hàng để xem danh sách tại đây.
              </p>
              <Link
                href="/orders"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-xs font-bold text-white"
              >
                Tạo đơn hàng đầu tiên
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-stone-200 bg-stone-50 text-stone-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Mã đơn</th>
                    <th className="px-4 py-3">Sản phẩm</th>
                    <th className="px-4 py-3">Tổng tiền</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Ngày đặt</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {userOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-stone-50/80">
                      <td className="px-4 py-3 font-bold text-stone-900">
                        #AURA-{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {order.items
                          .map(
                            (i) =>
                              `${i.quantity}× ${i.product?.title ?? 'Sản phẩm'}`,
                          )
                          .join(', ')}
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-900">
                        {formatCurrency(order.total_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            order.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : order.status === 'PENDING'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-stone-100 text-stone-600 border border-stone-200'
                          }`}
                        >
                          {order.status === 'PAID'
                            ? 'Đã thanh toán'
                            : order.status === 'PENDING'
                              ? 'Chờ thanh toán'
                              : order.status === 'CANCELLED'
                                ? 'Đã hủy'
                                : order.status === 'EXPIRED'
                                  ? 'Hết hạn'
                                  : order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {new Date(order.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {order.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                disabled={payMutation.isPending}
                                onClick={() =>
                                  payMutation.mutate({
                                    targetOrderId: order.id,
                                    idempotencyKey: generateUuidV4(),
                                    provider: 'BANK_QR_TRANSFER',
                                  })
                                }
                                className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
                              >
                                Xác nhận chuyển VietQR
                              </button>
                              <button
                                type="button"
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(order.id)}
                                className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                              >
                                Hủy đơn
                              </button>
                            </>
                          )}
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-bold text-stone-900 hover:text-rose-600"
                          >
                            Chi tiết →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-3xl border border-stone-200 bg-white" />
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}
