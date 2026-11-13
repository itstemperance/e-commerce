'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  AlertCircle,
  ShieldCheck,
  Truck,
  ShoppingCart,
  CheckCircle2,
  FileEdit,
  MapPin,
} from 'lucide-react';
import {
  useProductsQuery,
  useCheckoutConfigQuery,
  useProfileQuery,
} from '@/hooks/use-flash-sale';
import { useCart } from '@/hooks/use-cart';
import {
  computeTieredPricing,
  formatCurrency,
  generateUuidV4,
} from '@/lib/utils';
import {
  POPULAR_PROVINCES,
  getDistricts,
  getWards,
  formatFullAddress,
} from '@/lib/vietnam-address';
import {
  apiClient,
  AUTH_CHANGE_EVENT,
  StoredUser,
  tokenStorage,
} from '@/lib/api';

const FALLBACK_CONFIG = {
  bankName: 'Vietcombank (VCB) — Chi nhánh TP. Hồ Chí Minh',
  accountNumber: '0071008899668',
  accountHolder: 'CÔNG TY TNHH CÔNG NGHỆ AURA',
  bankBranch: 'Chi nhánh chính TP. Hồ Chí Minh',
  qrTemplateUrl: '',
  checkoutGuidance:
    '1. Lựa chọn giữa Cọc trước 10% (tối thiểu 200.000 ₫) hoặc Thanh toán đủ 100% để nhận Freeship.\n' +
    '2. Quét mã QR ngân hàng hoặc chuyển khoản theo số tài khoản hiển thị.\n' +
    '3. Nhập Mã đơn hàng vào nội dung chuyển khoản.',
  usdToVndRate: 1,
  minDepositVnd: 200000,
  partialDepositPercent: 10,
  codShippingFee: 30000,
  updatedAt: new Date().toISOString(),
};

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId');
  const initialQty = Math.max(1, Number(searchParams.get('quantity') || 1));

  const { data: catalog } = useProductsQuery({ sort: 'flash_first' });
  const { data: checkoutConfigData } = useCheckoutConfigQuery();
  const { data: profile } = useProfileQuery();
  const config = checkoutConfigData ?? FALLBACK_CONFIG;
  const products = catalog?.items ?? [];

  const cart = useCart();

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Customer Contact & Delivery Info
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Structured Vietnam Administrative Divisions
  const [selectedProvince, setSelectedProvince] = useState('Hà Nội');
  const [selectedDistrict, setSelectedDistrict] = useState('Quận Cầu Giấy');
  const [selectedWard, setSelectedWard] = useState('Phường Dịch Vọng');
  const [streetAddress, setStreetAddress] = useState('');

  // Explicit validation error tracking for missing required fields
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    phone?: string;
    address?: string;
  }>({});

  useEffect(() => {
    const syncUser = () => {
      setCurrentUser(tokenStorage.getUser());
    };
    syncUser();
    window.addEventListener(AUTH_CHANGE_EVENT, syncUser);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, syncUser);
  }, []);

  useEffect(() => {
    setIdempotencyKey(generateUuidV4());
  }, []);

  // Pre-fill from account profile when loaded (if user has saved info)
  useEffect(() => {
    if (profile) {
      if (!fullName && profile.fullName) setFullName(profile.fullName);
      if (!phone && profile.phone) setPhone(profile.phone);
      if (profile.address && !streetAddress) {
        setStreetAddress(profile.address);
      }
    }
  }, [profile]);

  const availableDistricts = useMemo(() => {
    return getDistricts(selectedProvince);
  }, [selectedProvince]);

  const availableWards = useMemo(() => {
    return getWards(selectedProvince, selectedDistrict);
  }, [selectedProvince, selectedDistrict]);

  const formattedFullAddress = useMemo(() => {
    return formatFullAddress(
      streetAddress,
      selectedWard,
      selectedDistrict,
      selectedProvince,
    );
  }, [streetAddress, selectedWard, selectedDistrict, selectedProvince]);

  // If page was opened with ?productId=..., ensure that product is in the account's cart
  useEffect(() => {
    if (!initialProductId || products.length === 0 || !cart.mounted) return;
    const exists = cart.items.some((i) => i.productId === initialProductId);
    if (!exists) {
      const p = products.find((x) => x.id === initialProductId);
      if (p) {
        cart.addItem(
          {
            productId: p.id,
            slug: p.slug,
            title: p.title,
            price: p.price,
            originalPrice: p.originalPrice,
            image: p.images?.[0],
            status: p.status,
            tags: p.tags,
          },
          initialQty,
        );
      }
    }
  }, [initialProductId, products, cart.mounted]);

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

  // Validation function with clear error messages
  function validateFields(): boolean {
    const errors: { fullName?: string; phone?: string; address?: string } = {};

    if (!fullName.trim()) {
      errors.fullName = 'Vui lòng nhập họ và tên người nhận hàng.';
    }

    if (!phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại người nhận hàng.';
    } else if (!/^[0-9+() -]{8,15}$/.test(phone.trim())) {
      errors.phone = 'Số điện thoại không hợp lệ (từ 8 đến 15 chữ số).';
    }

    if (!streetAddress.trim()) {
      errors.address =
        'Vui lòng nhập số nhà, tên ngõ/đường hoặc tòa nhà cụ thể.';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setErrorMessage(
        'Vui lòng điền đầy đủ các thông tin bắt buộc có dấu (*) trước khi đặt hàng.',
      );
      return false;
    }

    setErrorMessage(null);
    return true;
  }

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (cart.items.length === 0 || isSubmitting) return;

    if (!validateFields()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiClient.createOrder(
        {
          items: cart.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          fullName: fullName.trim(),
          phone: phone.trim(),
          address: formattedFullAddress,
          notes: notes.trim(),
        },
        idempotencyKey,
      );

      if (currentUser && (!currentUser.fullName || !currentUser.phone)) {
        const accessToken = tokenStorage.getAccessToken();
        const refreshToken =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('flashsale_refresh_token')
            : null;
        if (accessToken && refreshToken) {
          tokenStorage.setSession(accessToken, refreshToken, {
            ...currentUser,
            fullName: currentUser.fullName || fullName.trim(),
            phone: currentUser.phone || phone.trim(),
            address: currentUser.address || formattedFullAddress,
          });
        }
      }

      cart.clearCart();
      router.push(`/orders/${response.id}`);
    } catch (err) {
      setErrorMessage(
        (err as Error).message || 'Có lỗi xảy ra khi tạo đơn hàng',
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-sm font-bold text-rose-600 hover:text-rose-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Quay lại giỏ hàng</span>
        </Link>
        <Link
          href="/products"
          className="text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors"
        >
          Mua thêm sản phẩm khác
        </Link>
      </div>

      {/* Logged-Out Guest Prompt: Only shown when user is not logged in */}
      {!currentUser && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-bold">
              💡
            </div>
            <div className="flex-1 space-y-1 text-xs">
              <div className="font-bold text-amber-950">
                Bạn đang đặt hàng với vai trò Khách (chưa đăng nhập)
              </div>
              <p className="text-amber-800 leading-relaxed">
                Đơn hàng của bạn vẫn sẽ được tiếp nhận và xử lý đầy đủ mà không
                cần tài khoản. Tuy nhiên, khuyến khích bạn{' '}
                <Link
                  href="/account"
                  className="font-bold underline text-stone-900 hover:text-rose-600"
                >
                  Đăng nhập hoặc Tạo tài khoản
                </Link>{' '}
                để dễ dàng tra cứu lịch sử đơn hàng, cập nhật vận đơn và kích
                hoạt bảo hành điện tử chính hãng.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmed Cart Summary Section */}
      {cart.items.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
              ĐƠN HÀNG XÁC NHẬN (TỪ GIỎ HÀNG CỦA BẠN)
            </h2>
            <Link
              href="/cart"
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline"
            >
              <FileEdit className="h-3.5 w-3.5" />
              <span>Chỉnh sửa giỏ hàng</span>
            </Link>
          </div>

          <div className="divide-y divide-stone-100">
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
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-center">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="text-[10px] font-bold text-stone-300">
                          AURA
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Số lượng: <span className="font-bold text-stone-800">{item.quantity}</span>
                        {isFlashSale && (
                          <span className="ml-2 rounded bg-rose-50 px-1 py-0.2 text-[9px] font-bold text-rose-600 border border-rose-200">
                            Flash Deal
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-extrabold text-stone-900">
                      {formatCurrency(tiered.subtotal)}
                    </div>
                    {item.quantity > 1 && (
                      <div className="text-[10px] text-stone-400">
                        {formatCurrency(discountedUnitPrice)} / sp
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="border-t border-stone-100 pt-3 flex justify-between items-baseline text-xs">
            <span className="font-medium text-stone-600">
              Tổng tiền hàng ({totalItemCount} sản phẩm):
            </span>
            <span className="text-base font-black text-rose-600">
              {formatCurrency(totalSubtotalVnd)}
            </span>
          </div>
        </div>
      ) : (
        /* If Cart is empty */
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center space-y-3">
          <ShoppingCart className="mx-auto h-12 w-12 text-stone-300" />
          <h3 className="text-sm font-bold text-stone-900">
            Giỏ hàng của bạn đang trống
          </h3>
          <p className="text-xs text-stone-500">
            Hãy chọn sản phẩm bạn yêu thích từ danh mục trước khi thanh toán.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-colors"
          >
            Khám phá sản phẩm
          </Link>
        </div>
      )}

      {/* Customer Information Form */}
      {cart.items.length > 0 && (
        <form
          onSubmit={(e) => void handlePlaceOrder(e)}
          noValidate
          className="space-y-6"
        >
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
                THÔNG TIN KHÁCH HÀNG
              </h2>
              <span className="text-[11px] text-stone-400">
                Các mục có dấu (<span className="text-rose-600 font-bold">*</span>) là bắt buộc
              </span>
            </div>

            {/* Top alert when there are validation errors */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Full Name Field (no placeholder) */}
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Họ tên <span className="text-rose-600 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) {
                      setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                    }
                  }}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-stone-900 transition-all focus:outline-none ${
                    fieldErrors.fullName
                      ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20'
                      : 'border-stone-300 bg-white focus:border-stone-900'
                  }`}
                />
                {fieldErrors.fullName && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600 animate-in fade-in">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>{fieldErrors.fullName}</span>
                  </p>
                )}
              </div>

              {/* Phone Field (no placeholder) */}
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Điện thoại <span className="text-rose-600 font-bold">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }
                  }}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-stone-900 transition-all focus:outline-none ${
                    fieldErrors.phone
                      ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20'
                      : 'border-stone-300 bg-white focus:border-stone-900'
                  }`}
                />
                {fieldErrors.phone && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600 animate-in fade-in">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>{fieldErrors.phone}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Structured Vietnam Administrative Divisions */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Province / City */}
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Tỉnh / Thành phố <span className="text-rose-600 font-bold">*</span>
                </label>
                <select
                  value={selectedProvince}
                  onChange={(e) => {
                    const newProv = e.target.value;
                    setSelectedProvince(newProv);
                    const newDistricts = getDistricts(newProv);
                    const firstDist = newDistricts[0] || '';
                    setSelectedDistrict(firstDist);
                    const newWards = getWards(newProv, firstDist);
                    setSelectedWard(newWards[0] || '');
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-900 focus:border-stone-900 focus:outline-none cursor-pointer"
                >
                  {POPULAR_PROVINCES.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </select>
              </div>

              {/* District */}
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Quận / Huyện <span className="text-rose-600 font-bold">*</span>
                </label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => {
                    const newDist = e.target.value;
                    setSelectedDistrict(newDist);
                    const newWards = getWards(selectedProvince, newDist);
                    setSelectedWard(newWards[0] || '');
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-900 focus:border-stone-900 focus:outline-none cursor-pointer"
                >
                  {availableDistricts.map((dist) => (
                    <option key={dist} value={dist}>
                      {dist}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ward */}
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  Phường / Xã <span className="text-rose-600 font-bold">*</span>
                </label>
                <select
                  value={selectedWard}
                  onChange={(e) => setSelectedWard(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-900 focus:border-stone-900 focus:outline-none cursor-pointer"
                >
                  {availableWards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Street Address / House Number */}
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                Địa chỉ cụ thể (Số nhà, ngõ/ngách, tên đường, tòa nhà){' '}
                <span className="text-rose-600 font-bold">*</span>
              </label>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => {
                  setStreetAddress(e.target.value);
                  if (fieldErrors.address) {
                    setFieldErrors((prev) => ({ ...prev, address: undefined }));
                  }
                }}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-stone-900 transition-all focus:outline-none ${
                  fieldErrors.address
                    ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20'
                    : 'border-stone-300 bg-white focus:border-stone-900'
                }`}
              />
              {fieldErrors.address && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600 animate-in fade-in">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{fieldErrors.address}</span>
                </p>
              )}
            </div>

            {/* Formatted Full Address Live Preview */}
            <div className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
              <MapPin className="h-4 w-4 shrink-0 text-orange-600 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Địa chỉ nhận hàng:
                </span>
                <p className="font-semibold text-stone-900">
                  {formattedFullAddress || 'Vui lòng nhập địa chỉ cụ thể ở trên'}
                </p>
              </div>
            </div>

            {/* Notes Field (no placeholder) */}
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                Lưu ý hoặc yêu cầu trước khi giao hàng (Tùy chọn)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Big Orange Submit Button */}
          <div>
            <button
              type="submit"
              disabled={isSubmitting || cart.items.length === 0}
              className="flex w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 py-3.5 px-6 text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-amber-600 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:from-stone-300 disabled:to-stone-300 disabled:shadow-none transition-all active:scale-[0.99]"
            >
              <span className="text-base font-black tracking-wider uppercase">
                {isSubmitting ? 'ĐANG TẠO ĐƠN HÀNG...' : 'ĐẶT HÀNG'}
              </span>
              <span className="text-xs font-medium text-white/90">
                Hotline: 098 235 1080 (8h - 21h)
              </span>
            </button>

            {/* Delivery & Service Perks */}
            <div className="mt-3.5 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-xs text-stone-500 font-medium text-center">
              <span>• Ship hỏa tốc 1h trong nội thành Hà Nội</span>
              <span>• Ship COD toàn quốc nhận hàng kiểm tra mới thanh toán</span>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-12 text-center text-xs text-stone-400">
          Đang tải trang thanh toán...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
