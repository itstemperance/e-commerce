'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Flame,
  X,
  QrCode,
  ArrowLeft,
  Image as ImageIcon,
  Terminal,
  ExternalLink,
  Sparkles,
  Upload,
  LogOut,
  TrendingUp,
  BarChart3,
  PieChart,
  AlertTriangle,
  ArrowUpRight,
  Store,
  Flag,
} from 'lucide-react';
import {
  useAdminOverviewQuery,
  useProductsQuery,
  useOrdersListQuery,
  useAdminUsersQuery,
  useInventoryAuditQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useUpdateOrderStatusMutation,
  useDeleteOrderMutation,
  useResetInventoryMutation,
  useCheckoutConfigQuery,
  useUpdateCheckoutConfigMutation,
} from '@/hooks/use-flash-sale';
import {
  AdminUserItem,
  apiClient,
  OrderDetailResponse,
  ProductCatalogItem,
  StoredUser,
  tokenStorage,
} from '@/lib/api';
import { formatCurrency, formatVnd } from '@/lib/utils';
import { getProductRetailMeta } from '@/lib/product-visuals';
import { BankQrPanel } from '@/components/bank-qr-panel';

function getProductPreSalePrice(prod: {
  price: number;
  originalPrice?: number;
  status: string;
}): number {
  const safePrice = Number.isFinite(prod.price) ? prod.price : 0;
  const safeOriginal = Number.isFinite(prod.originalPrice)
    ? (prod.originalPrice as number)
    : safePrice;
  return prod.status === 'FLASH_SALE'
    ? Math.max(safePrice, safeOriginal)
    : safePrice;
}

function getProductImportCost(prod: {
  price: number;
  originalPrice?: number;
  status: string;
}): number {
  return Math.round(getProductPreSalePrice(prod) * 0.7);
}

function getProductEstimatedProfit(prod: {
  price: number;
  originalPrice?: number;
  status: string;
}): {
  importCost: number;
  preSalePrice: number;
  firstUnitProfit: number;
  regularUnitProfit: number;
} {
  const preSalePrice = getProductPreSalePrice(prod);
  const importCost = getProductImportCost(prod);
  const safePrice = Number.isFinite(prod.price) ? prod.price : 0;
  return {
    importCost,
    preSalePrice,
    firstUnitProfit: Math.round(safePrice - importCost),
    regularUnitProfit: Math.round(preSalePrice - importCost),
  };
}

const CHART_COLORS = [
  '#10b981', // emerald-500
  '#2563eb', // blue-600
  '#f59e0b', // amber-500
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
];

/**
 * Generates 3 studio SVG placeholder photos (Front, Angle, Detail) as data URLs
 * when the admin clicks "Generate Placeholder Photos" in the Add/Edit Product form.
 */
function generateClientPlaceholderPhotos(title: string, slug: string): string[] {
  const safeTitle = (title || 'Sản phẩm Flagship AURA')
    .replace(/[<>&"']/g, '')
    .slice(0, 34);
  const views = [
    { label: 'Góc nhìn chính diện Studio', bg1: '#0f172a', bg2: '#1e293b', accent: '#f43f5e' },
    { label: 'Góc nghiêng 45° chi tiết', bg1: '#18181b', bg2: '#27272a', accent: '#f59e0b' },
    { label: 'Cận cảnh linh kiện & thông số', bg1: '#090d16', bg2: '#1e1b4b', accent: '#10b981' },
  ];

  return views.map((v, idx) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480">
      <defs>
        <linearGradient id="bg${idx}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${v.bg1}"/>
          <stop offset="100%" stop-color="${v.bg2}"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" rx="28" fill="url(#bg${idx})"/>
      <circle cx="510" cy="100" r="130" fill="${v.accent}" opacity="0.16"/>
      <rect x="64" y="64" width="512" height="270" rx="20" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.14"/>
      <rect x="195" y="105" width="250" height="165" rx="18" fill="#ffffff" fill-opacity="0.09" stroke="${v.accent}" stroke-width="2" stroke-opacity="0.65"/>
      <circle cx="320" cy="188" r="42" fill="${v.accent}" opacity="0.28"/>
      <text x="320" y="194" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="800">ẢNH #${idx + 1}</text>
      <text x="64" y="382" fill="#ffffff" font-family="system-ui, sans-serif" font-size="21" font-weight="800">${safeTitle}</text>
      <text x="64" y="412" fill="${v.accent}" font-family="system-ui, sans-serif" font-size="13" font-weight="700">${v.label.toUpperCase()} • ${(slug || 'custom-sku').toUpperCase()}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentAdmin, setCurrentAdmin] = useState<StoredUser | null>(null);
  useEffect(() => {
    setCurrentAdmin(tokenStorage.getUser());
  }, []);

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'products' | 'orders' | 'users' | 'checkout_qr' | 'audit'
  >('dashboard');
  const [chartGrouping, setChartGrouping] = useState<'category' | 'status'>(
    'category',
  );
  const [globalQuickSearch, setGlobalQuickSearch] = useState('');

  const [bannerMsg, setBannerMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Queries
  const { data: overview } = useAdminOverviewQuery();
  const { data: catalogData, isLoading: productsLoading } = useProductsQuery({
    sort: 'flash_first',
    includeArchived: true,
  });
  const products = catalogData?.items ?? [];

  const [showAllOrdersWithExpired, setShowAllOrdersWithExpired] =
    useState(false);
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState<string[]>(
    [],
  );
  const [selectedOrderProductStatuses, setSelectedOrderProductStatuses] =
    useState<string[]>([]);
  const { data: allOrders, isLoading: ordersLoading } = useOrdersListQuery({
    all: true,
    status: 'ALL',
  });

  const { data: usersList, isLoading: usersLoading } = useAdminUsersQuery();
  const { data: checkoutConfig } = useCheckoutConfigQuery();
  const updateCheckoutConfigMutation = useUpdateCheckoutConfigMutation();

  // Product Filters & Create/Edit State
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductStatuses, setSelectedProductStatuses] = useState<
    string[]
  >([]);
  const [showAddProductForm, setShowAddProductForm] = useState(false);

  const [newProdTitle, setNewProdTitle] = useState('');
  const [newProdSlug, setNewProdSlug] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('2990000');
  const [newProdOriginalPrice, setNewProdOriginalPrice] = useState('3990000');
  const [newProdStatus, setNewProdStatus] = useState('FLASH_SALE');
  const [newProdStock, setNewProdStock] = useState('100');
  const [newProdImagesInput, setNewProdImagesInput] = useState('');
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  const [editingProduct, setEditingProduct] =
    useState<ProductCatalogItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editOriginalPrice, setEditOriginalPrice] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editStock, setEditStock] = useState('');
  const [editImagesInput, setEditImagesInput] = useState('');

  // Orders Search & Minimalist Inline Inspector
  const [orderSearch, setOrderSearch] = useState('');
  const [inspectedOrder, setInspectedOrder] =
    useState<OrderDetailResponse | null>(null);

  // Users Admin State (Create & Full Account Modification Modal)
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('Password123!');
  const [newUserRole, setNewUserRole] = useState<'CUSTOMER' | 'ADMIN'>(
    'CUSTOMER',
  );
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserAddress, setNewUserAddress] = useState('');
  const [newUserNotes, setNewUserNotes] = useState('');
  const [userActionBusy, setUserActionBusy] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserRole, setEditUserRole] = useState<'CUSTOMER' | 'ADMIN'>(
    'CUSTOMER',
  );
  const [editUserFullName, setEditUserFullName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserAddress, setEditUserAddress] = useState('');
  const [editUserNotes, setEditUserNotes] = useState('');
  const [editUserNewPassword, setEditUserNewPassword] = useState('');
  const [userFlagFilter, setUserFlagFilter] = useState<'ALL' | 'FLAGGED'>('ALL');

  // Checkout & Bank QR Config Form State
  const [cfgBankName, setCfgBankName] = useState('');
  const [cfgAccountNumber, setCfgAccountNumber] = useState('');
  const [cfgAccountHolder, setCfgAccountHolder] = useState('');
  const [cfgBankBranch, setCfgBankBranch] = useState('');
  const [cfgQrTemplateUrl, setCfgQrTemplateUrl] = useState('');
  const [cfgGuidance, setCfgGuidance] = useState('');
  const [cfgUsdToVndRate, setCfgUsdToVndRate] = useState('25500');
  const [cfgMinDepositVnd, setCfgMinDepositVnd] = useState('200000');
  const [cfgDepositPercent, setCfgDepositPercent] = useState('10');
  const [cfgCodShippingFee, setCfgCodShippingFee] = useState('30000');

  useEffect(() => {
    if (checkoutConfig) {
      setCfgBankName(checkoutConfig.bankName);
      setCfgAccountNumber(checkoutConfig.accountNumber);
      setCfgAccountHolder(checkoutConfig.accountHolder);
      setCfgBankBranch(checkoutConfig.bankBranch);
      setCfgQrTemplateUrl(checkoutConfig.qrTemplateUrl);
      setCfgGuidance(checkoutConfig.checkoutGuidance);
      setCfgUsdToVndRate(String(checkoutConfig.usdToVndRate));
      setCfgMinDepositVnd(String(checkoutConfig.minDepositVnd));
      setCfgDepositPercent(String(checkoutConfig.partialDepositPercent));
      setCfgCodShippingFee(String(checkoutConfig.codShippingFee));
    }
  }, [checkoutConfig]);

  // Audit Product Selector
  const [auditProductId, setAuditProductId] = useState(
    '11111111-1111-4111-8111-111111111101',
  );
  const { data: auditReport } = useInventoryAuditQuery(auditProductId);

  // Mutations
  const createProductMutation = useCreateProductMutation();
  const updateProductMutation = useUpdateProductMutation();
  const deleteProductMutation = useDeleteProductMutation();
  const updateOrderStatusMutation = useUpdateOrderStatusMutation();
  const deleteOrderMutation = useDeleteOrderMutation();
  const resetInventoryMutation = useResetInventoryMutation();

  function showNotification(type: 'success' | 'error', text: string) {
    setBannerMsg({ type, text });
  }

  function parseNewlineUrls(raw: string): string[] {
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleProductImageFilesUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'new' | 'edit',
  ) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploadingProductImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(
            `Ảnh "${file.name}" vượt quá giới hạn 10MB, vui lòng chọn file nhỏ hơn.`,
          );
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () =>
            reject(new Error(`Không thể đọc file "${file.name}"`));
          reader.readAsDataURL(file);
        });
        const uploaded = await apiClient.uploadProductImage({
          fileName: file.name,
          dataUrl,
        });
        uploadedUrls.push(uploaded.url);
      }

      if (target === 'new') {
        setNewProdImagesInput((prev) =>
          [...parseNewlineUrls(prev), ...uploadedUrls].join('\n'),
        );
      } else {
        setEditImagesInput((prev) =>
          [...parseNewlineUrls(prev), ...uploadedUrls].join('\n'),
        );
      }

      showNotification(
        'success',
        `Đã tải lên và lưu ${uploadedUrls.length} ảnh vào thư mục local (/assets/products/...).`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setUploadingProductImage(false);
      e.target.value = '';
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      const images = parseNewlineUrls(newProdImagesInput);
      const created = await createProductMutation.mutateAsync({
        title: newProdTitle,
        slug: newProdSlug.trim() || undefined,
        description: newProdDesc,
        price: Number(newProdPrice),
        originalPrice:
          newProdStatus === 'FLASH_SALE'
            ? Number(newProdOriginalPrice) || undefined
            : Number(newProdPrice),
        status: newProdStatus,
        totalStock: Number(newProdStock),
        images: images.length > 0 ? images : undefined,
      });
      setNewProdTitle('');
      setNewProdSlug('');
      setNewProdDesc('');
      setNewProdPrice('2990000');
      setNewProdOriginalPrice('3990000');
      setNewProdStock('100');
      setNewProdImagesInput('');
      setShowAddProductForm(false);
      showNotification(
        'success',
        `Đã thêm sản phẩm "${created.title}" với ảnh và cấu hình giá bán.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  function openEditModal(prod: ProductCatalogItem) {
    setEditingProduct(prod);
    setEditTitle(prod.title);
    setEditSlug(prod.slug);
    setEditDesc(prod.description);
    setEditPrice(prod.price.toString());
    setEditOriginalPrice(
      (prod.originalPrice ?? Math.round(prod.price * 1.25 * 100) / 100).toString(),
    );
    setEditStatus(prod.status);
    setEditStock(prod.inventory.total_stock.toString());
    setEditImagesInput((prod.images ?? []).join('\n'));
  }

  async function handleSaveEditProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      const images = parseNewlineUrls(editImagesInput);
      const updated = await updateProductMutation.mutateAsync({
        id: editingProduct.id,
        payload: {
          title: editTitle,
          slug: editSlug,
          description: editDesc,
          price: Number(editPrice),
          originalPrice:
            editStatus === 'FLASH_SALE'
              ? Number(editOriginalPrice)
              : Number(editPrice),
          status: editStatus,
          totalStock: Number(editStock),
          images,
        },
      });
      setEditingProduct(null);
      showNotification(
        'success',
        `Đã cập nhật sản phẩm "${updated.title}" — dữ liệu đã được đồng bộ trực tiếp ra Cửa hàng chính.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  async function handleDeleteProduct(prod: ProductCatalogItem) {
    try {
      await deleteProductMutation.mutateAsync(prod.id);
      showNotification('success', `Đã xóa sản phẩm "${prod.title}" khỏi cửa hàng.`);
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  async function handleQuickStatusChange(
    prod: ProductCatalogItem,
    nextStatus: string,
  ) {
    try {
      await updateProductMutation.mutateAsync({
        id: prod.id,
        payload: { status: nextStatus },
      });
      showNotification(
        'success',
        `Đã chuyển trạng thái sản phẩm "${prod.title}" sang ${nextStatus}.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  async function handleQuickAddStock(prod: ProductCatalogItem, delta: number) {
    try {
      const nextTotal = Math.max(0, prod.inventory.total_stock + delta);
      await updateProductMutation.mutateAsync({
        id: prod.id,
        payload: { totalStock: nextTotal },
      });
      showNotification(
        'success',
        `Đã cập nhật tổng tồn kho của "${prod.title}" lên ${nextTotal} sản phẩm.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  async function handleOrderStatusChange(orderId: string, nextStatus: string) {
    try {
      const updated = await updateOrderStatusMutation.mutateAsync({
        orderId,
        status: nextStatus,
      });
      if (inspectedOrder?.id === orderId) {
        setInspectedOrder(updated);
      }
      showNotification(
        'success',
        `Đơn hàng #AURA-${orderId.slice(0, 8).toUpperCase()} đã chuyển sang trạng thái ${nextStatus}.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  async function handleDeleteOrder(orderId: string) {
    try {
      await deleteOrderMutation.mutateAsync(orderId);
      if (inspectedOrder?.id === orderId) {
        setInspectedOrder(null);
      }
      showNotification(
        'success',
        `Đã xóa Đơn hàng #AURA-${orderId.slice(0, 8).toUpperCase()}.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setUserActionBusy(true);
    try {
      const created = await apiClient.adminCreateUser({
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        fullName: newUserFullName.trim() || undefined,
        phone: newUserPhone.trim() || undefined,
        address: newUserAddress.trim() || undefined,
        notes: newUserNotes.trim() || undefined,
      });
      setNewUserEmail('');
      setNewUserPassword('Password123!');
      setNewUserFullName('');
      setNewUserPhone('');
      setNewUserAddress('');
      setNewUserNotes('');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      showNotification(
        'success',
        `Đã tạo tài khoản ${created.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'} cho ${created.email}.`,
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setUserActionBusy(false);
    }
  }

  function openEditUserModal(u: AdminUserItem) {
    setEditingUser(u);
    setEditUserEmail(u.email);
    setEditUserRole(u.role);
    setEditUserFullName(u.fullName ?? '');
    setEditUserPhone(u.phone ?? '');
    setEditUserAddress(u.address ?? '');
    setEditUserNotes(u.notes ?? '');
    setEditUserNewPassword('');
  }

  async function handleSaveEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setUserActionBusy(true);
    try {
      const res = await apiClient.adminUpdateUser(editingUser.id, {
        email: editUserEmail,
        role: editUserRole,
        fullName: editUserFullName,
        phone: editUserPhone,
        address: editUserAddress,
        notes: editUserNotes,
        newPassword: editUserNewPassword.trim() || undefined,
      });
      setEditingUser(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      showNotification('success', `Đã cập nhật thông tin tài khoản ${res.email}.`);
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setUserActionBusy(false);
    }
  }

  async function handleDeleteUser(u: AdminUserItem) {
    setUserActionBusy(true);
    try {
      const res = await apiClient.adminDeleteUser(u.id);
      if (editingUser?.id === u.id) {
        setEditingUser(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      showNotification('success', `Đã xóa tài khoản ${res.email}.`);
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setUserActionBusy(false);
    }
  }

  async function handleSaveCheckoutConfig(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateCheckoutConfigMutation.mutateAsync({
        bankName: cfgBankName,
        accountNumber: cfgAccountNumber,
        accountHolder: cfgAccountHolder,
        bankBranch: cfgBankBranch,
        qrTemplateUrl: cfgQrTemplateUrl,
        checkoutGuidance: cfgGuidance,
        usdToVndRate: Number(cfgUsdToVndRate) || 25500,
        minDepositVnd: Number(cfgMinDepositVnd) || 200000,
        partialDepositPercent: Number(cfgDepositPercent) || 10,
        codShippingFee: Number(cfgCodShippingFee) || 0,
      });
      showNotification(
        'success',
        'Đã lưu thành công cấu hình mã VietQR và hướng dẫn chuyển khoản.',
      );
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  }

  function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showNotification(
        'error',
        'Kích thước file ảnh quá lớn (vui lòng chọn ảnh dưới 10MB)',
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCfgQrTemplateUrl(dataUrl);
        showNotification(
          'success',
          'Đã tải lên ảnh QR thành công! Hãy nhấn "Lưu cấu hình VietQR & Hướng dẫn" để lưu.',
        );
      }
    };
    reader.readAsDataURL(file);
  }

  function toggleProductStatusFilter(st: string) {
    if (st === 'ALL') {
      setSelectedProductStatuses([]);
      return;
    }
    setSelectedProductStatuses((prev) =>
      prev.includes(st) ? prev.filter((item) => item !== st) : [...prev, st],
    );
  }

  function toggleOrderStatusFilter(st: string) {
    setSelectedOrderStatuses((prev) =>
      prev.includes(st) ? prev.filter((item) => item !== st) : [...prev, st],
    );
  }

  function toggleOrderProductStatusFilter(st: string) {
    if (st === 'ALL') {
      setSelectedOrderProductStatuses([]);
      return;
    }
    setSelectedOrderProductStatuses((prev) =>
      prev.includes(st) ? prev.filter((item) => item !== st) : [...prev, st],
    );
  }

  const filteredProducts = products.filter((p) => {
    if (
      selectedProductStatuses.length > 0 &&
      !selectedProductStatuses.includes(p.status)
    ) {
      return false;
    }
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  const filteredOrders = (allOrders ?? []).filter((o) => {
    if (selectedOrderStatuses.length > 0) {
      if (!selectedOrderStatuses.includes(o.status)) {
        return false;
      }
    } else if (!showAllOrdersWithExpired && o.status === 'EXPIRED') {
      return false;
    }

    if (selectedOrderProductStatuses.length > 0) {
      const matchesProductClassification = o.items.some((i) => {
        const liveStatus =
          products.find((p) => p.id === i.product_id)?.status ??
          i.product?.status;
        return (
          liveStatus !== undefined &&
          selectedOrderProductStatuses.includes(liveStatus)
        );
      });
      if (!matchesProductClassification) {
        return false;
      }
    }

    if (!orderSearch.trim()) return true;
    const q = orderSearch.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      (o.user?.email ?? '').toLowerCase().includes(q) ||
      o.items.some((i) => (i.product?.title ?? '').toLowerCase().includes(q))
    );
  });

  function handleAdminLogout() {
    tokenStorage.clearSession();
    router.push('/');
  }

  // =========================================================================
  // DASHBOARD OVERVIEW METRICS (Profit = Selling Price - 70% Pre-Sale Import)
  // =========================================================================
  const productMap = new Map(products.map((p) => [p.id, p]));

  let settledProfit = 0;
  let pendingProfit = 0;
  let hasSettledItems = false;

  const categoryBuckets = new Map<
    string,
    { label: string; revenue: number; profit: number; units: number }
  >();
  const statusBuckets = new Map<
    string,
    { label: string; revenue: number; profit: number; units: number }
  >([
    ['FLASH_SALE', { label: 'Flash Sale', revenue: 0, profit: 0, units: 0 }],
    ['ACTIVE', { label: 'Active (Mở bán)', revenue: 0, profit: 0, units: 0 }],
    [
      'OUT_OF_STOCK',
      { label: 'Out of stock (Hết hàng)', revenue: 0, profit: 0, units: 0 },
    ],
    ['ARCHIVED', { label: 'Archived (Lưu trữ)', revenue: 0, profit: 0, units: 0 }],
  ]);

  for (const prod of products) {
    const meta = getProductRetailMeta(
      prod.slug,
      prod.status === 'FLASH_SALE',
    );
    if (!categoryBuckets.has(meta.category)) {
      categoryBuckets.set(meta.category, {
        label: meta.category,
        revenue: 0,
        profit: 0,
        units: 0,
      });
    }
  }

  for (const order of allOrders ?? []) {
    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      continue;
    }
    const isSettled = order.status === 'PAID' || order.status === 'DEPOSIT_PAID';
    const isPending = order.status === 'PENDING';

    for (const item of order.items) {
      const liveProd = productMap.get(item.product_id);
      const unitImportCost = liveProd
        ? getProductImportCost(liveProd)
        : Math.round(item.price_at_purchase * 0.7);
      const lineRevenue = item.price_at_purchase * item.quantity;
      const lineProfit = (item.price_at_purchase - unitImportCost) * item.quantity;

      if (isSettled) {
        hasSettledItems = true;
        settledProfit += lineProfit;
      } else if (isPending) {
        pendingProfit += lineProfit;
      }

      const prodSlug = liveProd?.slug ?? item.product?.slug ?? '';
      const prodStatus =
        liveProd?.status ?? item.product?.status ?? 'ACTIVE';
      const meta = getProductRetailMeta(prodSlug, prodStatus === 'FLASH_SALE');

      const catEntry = categoryBuckets.get(meta.category) ?? {
        label: meta.category,
        revenue: 0,
        profit: 0,
        units: 0,
      };
      catEntry.revenue += lineRevenue;
      catEntry.profit += lineProfit;
      catEntry.units += item.quantity;
      categoryBuckets.set(meta.category, catEntry);

      const stEntry = statusBuckets.get(prodStatus) ?? {
        label: prodStatus,
        revenue: 0,
        profit: 0,
        units: 0,
      };
      stEntry.revenue += lineRevenue;
      stEntry.profit += lineProfit;
      stEntry.units += item.quantity;
      statusBuckets.set(prodStatus, stEntry);
    }
  }

  const displayTotalProfit = hasSettledItems
    ? settledProfit
    : Math.round((overview?.revenue.totalRevenue ?? 0) * 0.3);

  const flashSaleProductsCount = products.filter(
    (p) => p.status === 'FLASH_SALE',
  ).length;
  const storefrontListedProductsCount = products.filter(
    (p) => p.status !== 'ARCHIVED',
  ).length;

  const activeChartSeries = (
    chartGrouping === 'category'
      ? Array.from(categoryBuckets.values())
      : Array.from(statusBuckets.values())
  ).sort((a, b) => b.revenue - a.revenue);

  const totalChartRevenue = activeChartSeries.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );
  const maxChartRevenue = Math.max(
    1,
    ...activeChartSeries.map((item) => item.revenue),
  );

  const recentFiveOrders = (allOrders ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  // Exclude OUT_OF_STOCK and ARCHIVED products from the low-stock warning list
  const lowStockProducts = products
    .filter((p) => p.status !== 'OUT_OF_STOCK' && p.status !== 'ARCHIVED')
    .slice()
    .sort((a, b) => a.inventory.available_stock - b.inventory.available_stock)
    .slice(0, 6);

  // Donut segments calculation
  const donutCircumference = 2 * Math.PI * 64;
  let cumulativeFraction = 0;
  const donutSegments = activeChartSeries
    .map((item, idx) => {
      const fraction =
        totalChartRevenue > 0 ? item.revenue / totalChartRevenue : 0;
      const strokeLength = fraction * donutCircumference;
      const offset = -cumulativeFraction * donutCircumference;
      cumulativeFraction += fraction;
      return {
        ...item,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        percent: totalChartRevenue > 0 ? Math.round(fraction * 1000) / 10 : 0,
        strokeLength,
        offset,
      };
    })
    .filter((seg) => seg.revenue > 0);

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-stone-900 flex flex-col">
      {/* ===================================================================== */}
      {/* STANDALONE ADMIN CONSOLE HEADER (LIGHT MODE ALIGNED WITH STOREFRONT)  */}
      {/* ===================================================================== */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-md text-stone-900 shadow-xs">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-black shadow-sm">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-black tracking-tight text-stone-900">
                BẢNG ĐIỀU KHIỂN QUẢN TRỊ AURA
                <span className="text-rose-600">.</span>
              </span>
              <p className="text-[11px] text-stone-500">
                Quản lý danh mục, lợi nhuận nhập kho, đơn hàng &amp; VietQR
              </p>
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-sm mx-4">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={globalQuickSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalQuickSearch(val);
                  setProductSearch(val);
                  setOrderSearch(val);
                }}
                placeholder="Tìm kiếm nhanh sản phẩm, mã đơn hàng..."
                className="w-full rounded-full border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-8 text-xs text-stone-900 placeholder:text-stone-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
              {globalQuickSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalQuickSearch('');
                    setProductSearch('');
                    setOrderSearch('');
                  }}
                  className="absolute right-2.5 top-2 text-stone-400 hover:text-stone-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">
                {(currentAdmin?.fullName || currentAdmin?.email || 'AD')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-[11px] font-bold text-stone-900 max-w-[140px] truncate">
                  {currentAdmin?.fullName ||
                    currentAdmin?.email ||
                    'Quản trị viên (admin)'}
                </div>
                <div className="text-[10px] text-stone-500">Quản trị viên</div>
              </div>
            </div>

           

            <button
              type="button"
              onClick={handleAdminLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* 2-COLUMN BODY: LEFT SIDEBAR NAVIGATION + MAIN WORKSPACE               */}
      {/* ===================================================================== */}
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col lg:flex-row">
        {/* LEFT SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-stone-200 bg-white px-4 py-5 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            <div>
              <div className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-widest text-stone-400">
                MENU CHÍNH
              </div>
              <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    <span>Dashboard</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === 'products'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Package className="h-4 w-4 shrink-0" />
                    <span>Quản lý sản phẩm</span>
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                    {products.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === 'orders'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <ShoppingBag className="h-4 w-4 shrink-0" />
                    <span>Quản lý đơn hàng</span>
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                    {overview?.orders.total ?? allOrders?.length ?? 0}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === 'users'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="text-left">Quản lý tài khoản khách hàng</span>
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                    {usersList?.length ?? 0}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('checkout_qr')}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === 'checkout_qr'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <QrCode className="h-4 w-4 shrink-0" />
                    <span className="text-left">Cấu hình trang thanh toán</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === 'audit'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span className="text-left">Kiểm toán bảo toàn tồn kho</span>
                  </span>
                </button>
              </nav>
            </div>

            <div className="border-t border-stone-100 pt-4">
              <div className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-widest text-stone-400">
                HỆ THỐNG
              </div>
              <div className="space-y-1.5">
                <Link
                  href="/"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors"
                >
                  <Store className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Quay lại Cửa hàng chính</span>
                </Link>

             

                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          </div>

        
        </aside>

        {/* MAIN RIGHT WORKSPACE */}
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          {/* Global Notification Banner */}
          {bannerMsg && (
            <div
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold ${
                bannerMsg.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {bannerMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{bannerMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setBannerMsg(null)}
                className="hover:underline"
              >
                Đóng
              </button>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 0: DASHBOARD OVERVIEW (INITIAL LANDING SCREEN)                    */}
          {/* ===================================================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Overview Heading */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-black tracking-tight text-stone-900 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    Tổng Quan Kinh Doanh &amp; Hiệu Suất
                  </h1>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Theo dõi tổng lợi nhuận (giá bán trừ 70% phí nhập kho), số đơn hàng, sản phẩm Flash Sale và cảnh báo tồn kho thấp.
                  </p>
                </div>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold text-stone-600 shadow-2xs">
                  {overview?.users.total ?? usersList?.length ?? 0} Tài khoản người dùng ({overview?.users.customers ?? 0} khách)
                </span>
              </div>

              {/* Top 4 Clickable KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="group text-left rounded-2xl border border-stone-200 border-l-4 border-l-emerald-500 bg-white p-5 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    <span>Tổng lợi nhuận</span>
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-stone-900">
                    {formatCurrency(displayTotalProfit)}
                  </div>
                  <div className="mt-1.5 text-[11px] text-stone-500">
                    Doanh thu thực tế:{' '}
                    <span className="font-bold text-stone-800">
                      {formatCurrency(overview?.revenue.totalRevenue ?? 0)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-emerald-700">
                    <span>+{formatCurrency(pendingProfit)} lợi nhuận chờ chốt</span>
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="group text-left rounded-2xl border border-stone-200 border-l-4 border-l-blue-600 bg-white p-5 shadow-xs hover:border-blue-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    <span>Tổng số đơn hàng</span>
                    <ShoppingBag className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-stone-900">
                    {overview?.orders.total ?? allOrders?.length ?? 0} đơn
                  </div>
                  <div className="mt-1.5 text-[11px] text-stone-500">
                    <span className="font-bold text-emerald-700">
                      {overview?.orders.paid ?? 0} Đã thanh toán
                    </span>{' '}
                    •{' '}
                    <span className="font-bold text-amber-700">
                      {overview?.orders.pending ?? 0} Chờ thanh toán
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-blue-700">
                    <span>Đi tới Quản lý đơn hàng</span>
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductStatuses(['FLASH_SALE']);
                    setActiveTab('products');
                  }}
                  className="group text-left rounded-2xl border border-stone-200 border-l-4 border-l-rose-500 bg-white p-5 shadow-xs hover:border-rose-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    <span>Sản phẩm đang Flash Sale</span>
                    <Flame className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-stone-900">
                    {flashSaleProductsCount} SP
                  </div>
                  <div className="mt-1.5 text-[11px] text-stone-500">
                    Ưu đãi tầng riêng cho sản phẩm đầu tiên
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-rose-600">
                    <span>Xem danh sách Flash Sale</span>
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductStatuses([
                      'FLASH_SALE',
                      'ACTIVE',
                      'OUT_OF_STOCK',
                    ]);
                    setActiveTab('products');
                  }}
                  className="group text-left rounded-2xl border border-stone-200 border-l-4 border-l-amber-500 bg-white p-5 shadow-xs hover:border-amber-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    <span>Liệt kê trên Storefront</span>
                    <Package className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-stone-900">
                    {storefrontListedProductsCount} SP
                  </div>
                  <div className="mt-1.5 text-[11px] text-stone-500">
                    {overview?.products.active ?? 0} Active •{' '}
                    {overview?.products.outOfStock ?? 0} Hết hàng (ẩn{' '}
                    {overview?.products.archived ?? 0} Lưu trữ)
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-amber-700">
                    <span>Mở Quản lý sản phẩm</span>
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </button>
              </div>

              {/* Charts Section: Doanh thu sản phẩm bán ra theo phân loại sản phẩm */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Bar Chart */}
                <div className="lg:col-span-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                      <h2 className="text-sm font-extrabold text-stone-900">
                        Doanh thu sản phẩm bán ra theo phân loại sản phẩm
                      </h2>
                    </div>
                    <div className="inline-flex rounded-xl border border-stone-200 bg-stone-50 p-0.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setChartGrouping('category')}
                        className={`rounded-lg px-2.5 py-1 transition-colors ${
                          chartGrouping === 'category'
                            ? 'bg-white text-blue-700 shadow-2xs'
                            : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        Theo danh mục
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartGrouping('status')}
                        className={`rounded-lg px-2.5 py-1 transition-colors ${
                          chartGrouping === 'status'
                            ? 'bg-white text-blue-700 shadow-2xs'
                            : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        Theo trạng thái bán
                      </button>
                    </div>
                  </div>

                  {totalChartRevenue === 0 ? (
                    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-xs text-stone-500">
                      Chưa có dữ liệu đơn hàng bán ra để hiển thị biểu đồ doanh thu.
                    </div>
                  ) : (
                    <div className="space-y-4 pt-2">
                      {/* Column Bar Chart */}
                      <div className="flex h-52 items-end gap-3 border-b border-l border-stone-200 px-3 pb-2 pt-6 bg-stone-50/40 rounded-lg">
                        {activeChartSeries.map((item, idx) => {
                          const heightPercent = Math.max(
                            6,
                            Math.round((item.revenue / maxChartRevenue) * 100),
                          );
                          const barColor = CHART_COLORS[idx % CHART_COLORS.length];
                          return (
                            <div
                              key={item.label}
                              className="group flex flex-1 flex-col items-center justify-end h-full min-w-[44px]"
                            >
                              <div className="mb-1 text-[10px] font-bold text-stone-700 text-center leading-tight">
                                {item.revenue > 0
                                  ? `${(item.revenue / 1_000_000).toFixed(1)}Tr`
                                  : '0'}
                              </div>
                              <div
                                style={{
                                  height: `${item.revenue > 0 ? heightPercent : 2}%`,
                                  backgroundColor: barColor,
                                }}
                                title={`${item.label}: Doanh thu ${formatCurrency(item.revenue)} | Lợi nhuận ${formatCurrency(item.profit)} (${item.units} SP)`}
                                className="w-full max-w-[48px] rounded-t-lg transition-all duration-300 group-hover:opacity-85 shadow-2xs"
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* X-Axis Labels + Metrics Breakdown */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {activeChartSeries.map((item, idx) => (
                          <div
                            key={item.label}
                            className="flex items-start gap-2 rounded-xl border border-stone-100 bg-stone-50 px-2.5 py-2 text-[11px]"
                          >
                            <span
                              style={{
                                backgroundColor:
                                  CHART_COLORS[idx % CHART_COLORS.length],
                              }}
                              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-xs"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-stone-800 truncate">
                                {item.label}
                              </div>
                              <div className="font-black text-stone-900">
                                {formatCurrency(item.revenue)}
                              </div>
                              <div className="text-[10px] text-emerald-700 font-semibold">
                                Lãi: {formatCurrency(item.profit)} • {item.units}{' '}
                                SP
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Donut Proportion Chart */}
                <div className="lg:col-span-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-emerald-600" />
                    <h2 className="text-sm font-extrabold text-stone-900">
                      Tỷ trọng doanh thu theo phân loại sản phẩm
                    </h2>
                  </div>

                  {donutSegments.length === 0 ? (
                    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-xs text-stone-500">
                      Chưa phát sinh tỷ trọng doanh thu theo phân loại.
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-5 pt-2">
                      <div className="relative h-44 w-44 shrink-0">
                        <svg
                          viewBox="0 0 180 180"
                          className="h-full w-full -rotate-90"
                        >
                          <circle
                            cx="90"
                            cy="90"
                            r="64"
                            fill="transparent"
                            stroke="#f5f5f4"
                            strokeWidth="26"
                          />
                          {donutSegments.map((seg) => (
                            <circle
                              key={seg.label}
                              cx="90"
                              cy="90"
                              r="64"
                              fill="transparent"
                              stroke={seg.color}
                              strokeWidth="26"
                              strokeDasharray={`${seg.strokeLength} ${donutCircumference}`}
                              strokeDashoffset={seg.offset}
                            />
                          ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                          <span className="text-[10px] font-bold uppercase text-stone-400">
                            Tổng doanh thu
                          </span>
                          <span className="text-xs font-black text-stone-900">
                            {(totalChartRevenue / 1_000_000).toFixed(1)} Tr ₫
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 w-full space-y-2">
                        {donutSegments.map((seg) => (
                          <div
                            key={seg.label}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                style={{ backgroundColor: seg.color }}
                                className="h-3 w-3 shrink-0 rounded-xs"
                              />
                              <span className="font-semibold text-stone-700 truncate">
                                {seg.label}
                              </span>
                            </div>
                            <span className="font-black text-stone-900 shrink-0">
                              {seg.percent}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Preview Row: 5 Recent Orders + Low Stock Items */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* 5 Recent Orders */}
                <div className="lg:col-span-7 rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
                  <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                    <h2 className="text-sm font-extrabold text-stone-900 flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-blue-600" />
                      5 đơn hàng gần đây nhất
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('orders')}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Xem tất cả →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 text-[10px] font-bold uppercase text-stone-500 border-b border-stone-100">
                        <tr>
                          <th className="px-4 py-3">Mã đơn</th>
                          <th className="px-4 py-3">Khách hàng</th>
                          <th className="px-4 py-3">Tổng tiền</th>
                          <th className="px-4 py-3">Trạng thái</th>
                          <th className="px-4 py-3 text-right">Ngày đặt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {recentFiveOrders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-8 text-center text-stone-400"
                            >
                              Chưa có đơn hàng nào gần đây.
                            </td>
                          </tr>
                        ) : (
                          recentFiveOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-stone-50/80">
                              <td className="px-4 py-3 font-mono font-bold">
                                <Link
                                  href={`/admin/orders/${order.id}`}
                                  className="text-stone-900 hover:text-blue-600"
                                >
                                  #AURA-{order.id.slice(0, 8).toUpperCase()}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-stone-700 max-w-[160px] truncate">
                                {order.customer_info?.fullName ||
                                  order.user?.email ||
                                  'Khách lẻ'}
                              </td>
                              <td className="px-4 py-3 font-black text-stone-900">
                                {formatCurrency(order.total_amount)}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    order.status === 'PAID'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : order.status === 'DEPOSIT_PAID'
                                        ? 'bg-indigo-100 text-indigo-800'
                                        : order.status === 'PENDING'
                                          ? 'bg-amber-100 text-amber-800'
                                          : order.status === 'EXPIRED'
                                            ? 'bg-stone-200 text-stone-600'
                                            : 'bg-rose-100 text-rose-700'
                                  }`}
                                >
                                  {order.status === 'PAID'
                                    ? 'Đã thanh toán'
                                    : order.status === 'DEPOSIT_PAID'
                                      ? 'Đã cọc 10%'
                                      : order.status === 'PENDING'
                                        ? 'Chờ thanh toán'
                                        : order.status === 'EXPIRED'
                                          ? 'Hết hạn'
                                          : 'Đã hủy'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-[11px] text-stone-500">
                                {new Date(order.created_at).toLocaleDateString(
                                  'vi-VN',
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Low Stock Warning Table (Excludes OUT_OF_STOCK & ARCHIVED) */}
                <div className="lg:col-span-5 rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
                  <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                    <div>
                      <h2 className="text-sm font-extrabold text-stone-900 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Cảnh báo mặt hàng tồn kho thấp
                      </h2>
                      <p className="text-[10px] text-stone-400">
                        Không bao gồm sản phẩm Out of Stock / Archived
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('products')}
                      className="text-xs font-bold text-blue-600 hover:underline shrink-0"
                    >
                      Quản lý sản phẩm →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 text-[10px] font-bold uppercase text-stone-500 border-b border-stone-100">
                        <tr>
                          <th className="px-4 py-3">Sản phẩm</th>
                          <th className="px-4 py-3">Trạng thái</th>
                          <th className="px-4 py-3">Tồn kho</th>
                          <th className="px-4 py-3 text-right">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {lowStockProducts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-4 py-8 text-center text-stone-400"
                            >
                              Tất cả sản phẩm đang mở bán đều đủ tồn kho.
                            </td>
                          </tr>
                        ) : (
                          lowStockProducts.map((prod) => (
                            <tr key={prod.id} className="hover:bg-stone-50/80">
                              <td className="px-4 py-3 font-bold text-stone-900 max-w-[170px] truncate">
                                {prod.title}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    prod.status === 'FLASH_SALE'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}
                                >
                                  {prod.status === 'FLASH_SALE'
                                    ? 'Flash Sale'
                                    : 'Active'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-black ${
                                    prod.inventory.available_stock <= 15
                                      ? 'text-rose-600'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {prod.inventory.available_stock}
                                </span>
                                <span className="text-stone-400">
                                  {' '}
                                  / {prod.inventory.total_stock}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleQuickAddStock(prod, 25)
                                  }
                                  className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-100"
                                >
                                  +25 kho
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 1: PRODUCTS, PHOTOS, COST & ESTIMATED PROFIT                      */}
          {/* ===================================================================== */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-black text-stone-900">
                    Quản lý Sản phẩm &amp; Ảnh ({products.length})
                  </h1>
                  <p className="text-xs text-stone-500">
                    Hiển thị giá bán, phí nhập kho (70% giá bán trước sale) và lợi nhuận ước tính từng sản phẩm.
                  </p>
                </div>
              </div>
            {/* Add New Product Drawer */}
            {showAddProductForm && (
              <div className="rounded-3xl border-2 border-stone-900 bg-white p-6 shadow-md space-y-5">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-stone-900">
                      Thêm sản phẩm mới (Kèm Ảnh &amp; Cơ chế giá tầng)
                    </h2>
                    <p className="text-xs text-stone-500">
                      Khi chọn Flash Sale, sp 1 áp dụng Giá ưu đãi và từ sp 2
                      trở đi tính Giá gốc. Bạn có thể tải ảnh trực tiếp từ máy
                      lên thư mục local hoặc dán link ảnh bên dưới.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddProductForm(false)}
                    className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => void handleCreateProduct(e)}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tên sản phẩm *
                    </label>
                    <input
                      type="text"
                      required
                      value={newProdTitle}
                      onChange={(e) => setNewProdTitle(e.target.value)}
                      placeholder="ví dụ: Apple Vision Pro 2 Studio Edition"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Slug (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={newProdSlug}
                      onChange={(e) => setNewProdSlug(e.target.value)}
                      placeholder="tự động tạo theo tên"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  {newProdStatus === 'FLASH_SALE' ? (
                    <>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-rose-600">
                          Giá ưu đãi sp 1 (₫) *
                        </label>
                        <input
                          type="number"
                          step="1000"
                          min="1000"
                          required
                          value={newProdPrice}
                          onChange={(e) => setNewProdPrice(e.target.value)}
                          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-stone-700">
                          Giá gốc từ sp 2+ (₫) *
                        </label>
                        <input
                          type="number"
                          step="1000"
                          min="1000"
                          required
                          value={newProdOriginalPrice}
                          onChange={(e) =>
                            setNewProdOriginalPrice(e.target.value)
                          }
                          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs font-bold text-stone-700">
                        Giá bán niêm yết (₫) *
                      </label>
                      <input
                        type="number"
                        step="1000"
                        min="1000"
                        required
                        value={newProdPrice}
                        onChange={(e) => setNewProdPrice(e.target.value)}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tồn kho ban đầu *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={newProdStock}
                      onChange={(e) => setNewProdStock(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-10">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Mô tả sản phẩm *
                    </label>
                    <input
                      type="text"
                      required
                      value={newProdDesc}
                      onChange={(e) => setNewProdDesc(e.target.value)}
                      placeholder="Mô tả thông số chi tiết và tính năng sản phẩm..."
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Phân loại / Trạng thái
                    </label>
                    <select
                      value={newProdStatus}
                      onChange={(e) => setNewProdStatus(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    >
                      <option value="FLASH_SALE">⚡ FLASH_SALE</option>
                      <option value="ACTIVE">ACTIVE (MỞ BÁN)</option>
                      <option value="OUT_OF_STOCK">OUT_OF_STOCK (HẾT HÀNG)</option>
                      <option value="ARCHIVED">ARCHIVED (LƯU TRỮ)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-10 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-stone-700 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5 text-stone-600" />
                        Ảnh sản phẩm (tải ảnh từ máy lên thư mục local hoặc dán link mỗi dòng 1 ảnh)
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-stone-800 cursor-pointer">
                          <Upload className="h-3 w-3" />
                          {uploadingProductImage
                            ? 'Đang tải lên...'
                            : 'Tải ảnh từ máy lên'}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={uploadingProductImage}
                            onChange={(e) =>
                              void handleProductImageFilesUpload(e, 'new')
                            }
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setNewProdImagesInput(
                              generateClientPlaceholderPhotos(
                                newProdTitle,
                                newProdSlug,
                              ).join('\n'),
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-200"
                        >
                          <Sparkles className="h-3 w-3" />
                          Tự tạo 3 ảnh Studio mẫu
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={newProdImagesInput}
                      onChange={(e) => setNewProdImagesInput(e.target.value)}
                      placeholder="/assets/products/... hoặc https://... (mỗi link 1 dòng)"
                      className="w-full rounded-xl border border-stone-300 bg-white p-2.5 font-mono text-[11px] text-stone-800"
                    />
                    {parseNewlineUrls(newProdImagesInput).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {parseNewlineUrls(newProdImagesInput).map((imgUrl, i) => (
                          <img
                            key={i}
                            src={imgUrl}
                            alt={`Preview ${i + 1}`}
                            className="h-14 w-20 rounded-lg border border-stone-200 bg-stone-100 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Live Import Cost & Estimated Profit Preview */}
                  {(() => {
                    const costMeta = getProductEstimatedProfit({
                      price: Number(newProdPrice) || 0,
                      originalPrice: Number(newProdOriginalPrice) || 0,
                      status: newProdStatus,
                    });
                    return (
                      <div className="sm:col-span-10 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 flex flex-wrap items-center gap-6 text-xs">
                        <div>
                          <span className="text-stone-500">
                            Phí nhập kho (70% giá trước sale):{' '}
                          </span>
                          <span className="font-bold text-stone-900">
                            {formatCurrency(costMeta.importCost)}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500">
                            Lợi nhuận ước tính:{' '}
                          </span>
                          <span
                            className={`font-black ${
                              costMeta.firstUnitProfit >= 0
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {costMeta.firstUnitProfit >= 0 ? '+' : ''}
                            {formatCurrency(costMeta.firstUnitProfit)}
                          </span>
                          {newProdStatus === 'FLASH_SALE' && (
                            <span className="ml-2 text-[11px] font-semibold text-stone-500">
                              (Từ sp 2+: +{formatCurrency(costMeta.regularUnitProfit)})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex items-end sm:col-span-2">
                    <button
                      type="submit"
                      disabled={createProductMutation.isPending}
                      className="w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                    >
                      {createProductMutation.isPending
                        ? 'Đang tạo...'
                        : 'Tạo sản phẩm'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Edit Existing Product Modal / Panel */}
            {editingProduct && (
              <div className="rounded-3xl border-2 border-stone-900 bg-white p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                      Chỉnh sửa Ảnh, Giá &amp; Trạng thái sản phẩm
                    </span>
                    <h2 className="text-base font-extrabold text-stone-900">
                      {editingProduct.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => void handleSaveEditProduct(e)}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tên sản phẩm
                    </label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Slug
                    </label>
                    <input
                      type="text"
                      required
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  {editStatus === 'FLASH_SALE' ? (
                    <>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-rose-600">
                          Giá ưu đãi sp 1 (₫)
                        </label>
                        <input
                          type="number"
                          step="1000"
                          min="1000"
                          required
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-stone-700">
                          Giá gốc từ sp 2+ (₫)
                        </label>
                        <input
                          type="number"
                          step="1000"
                          min="1000"
                          required
                          value={editOriginalPrice}
                          onChange={(e) => setEditOriginalPrice(e.target.value)}
                          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs font-bold text-stone-700">
                        Giá bán niêm yết (₫)
                      </label>
                      <input
                        type="number"
                        step="1000"
                        min="1000"
                        required
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tổng tồn kho
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={editStock}
                      onChange={(e) => setEditStock(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-10">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Mô tả
                    </label>
                    <input
                      type="text"
                      required
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Trạng thái
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    >
                      <option value="FLASH_SALE">⚡ FLASH_SALE</option>
                      <option value="ACTIVE">ACTIVE (MỞ BÁN)</option>
                      <option value="OUT_OF_STOCK">OUT_OF_STOCK (HẾT HÀNG)</option>
                      <option value="ARCHIVED">ARCHIVED (LƯU TRỮ)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-10 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-stone-700 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5 text-stone-600" />
                        Ảnh sản phẩm (tải ảnh từ máy lên thư mục local hoặc dán link URL)
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-stone-800 cursor-pointer">
                          <Upload className="h-3 w-3" />
                          {uploadingProductImage
                            ? 'Đang tải lên...'
                            : 'Tải ảnh từ máy lên'}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={uploadingProductImage}
                            onChange={(e) =>
                              void handleProductImageFilesUpload(e, 'edit')
                            }
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setEditImagesInput(
                              generateClientPlaceholderPhotos(
                                editTitle,
                                editSlug,
                              ).join('\n'),
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-200"
                        >
                          <Sparkles className="h-3 w-3" />
                          Tạo lại 3 ảnh Studio mẫu
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={editImagesInput}
                      onChange={(e) => setEditImagesInput(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white p-2.5 font-mono text-[11px] text-stone-800"
                    />
                    {parseNewlineUrls(editImagesInput).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {parseNewlineUrls(editImagesInput).map((imgUrl, i) => (
                          <img
                            key={i}
                            src={imgUrl}
                            alt={`Preview ${i + 1}`}
                            className="h-14 w-20 rounded-lg border border-stone-200 bg-stone-900 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Live Import Cost & Estimated Profit Preview */}
                  {(() => {
                    const costMeta = getProductEstimatedProfit({
                      price: Number(editPrice) || 0,
                      originalPrice: Number(editOriginalPrice) || 0,
                      status: editStatus,
                    });
                    return (
                      <div className="sm:col-span-10 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 flex flex-wrap items-center gap-6 text-xs">
                        <div>
                          <span className="text-stone-500">
                            Phí nhập kho (70% giá trước sale):{' '}
                          </span>
                          <span className="font-bold text-stone-900">
                            {formatCurrency(costMeta.importCost)}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500">
                            Lợi nhuận ước tính:{' '}
                          </span>
                          <span
                            className={`font-black ${
                              costMeta.firstUnitProfit >= 0
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {costMeta.firstUnitProfit >= 0 ? '+' : ''}
                            {formatCurrency(costMeta.firstUnitProfit)}
                          </span>
                          {editStatus === 'FLASH_SALE' && (
                            <span className="ml-2 text-[11px] font-semibold text-stone-500">
                              (Từ sp 2+: +{formatCurrency(costMeta.regularUnitProfit)})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex items-end gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={updateProductMutation.isPending}
                      className="w-full rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Lưu &amp; Đồng bộ ra Store
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Products Filter, Tag Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleProductStatusFilter('ALL')}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    selectedProductStatuses.length === 0
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  Hiển thị tất cả
                </button>
                {(
                  [
                    'FLASH_SALE',
                    'ACTIVE',
                    'OUT_OF_STOCK',
                    'ARCHIVED',
                  ] as const
                ).map((st) => {
                  const labelMap: Record<string, string> = {
                    FLASH_SALE: 'Flash Sale',
                    ACTIVE: 'Active',
                    OUT_OF_STOCK: 'Out of stock',
                    ARCHIVED: 'Archived',
                  };
                  const isSelected = selectedProductStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => toggleProductStatusFilter(st)}
                      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                        isSelected
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{labelMap[st] ?? st}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Tìm tên sản phẩm hoặc slug..."
                    className="w-full rounded-full border border-stone-300 bg-white py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddProductForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-stone-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm sản phẩm
                </button>
              </div>
            </div>

            {/* Products Table */}
            {productsLoading ? (
              <div className="h-64 animate-pulse rounded-3xl border border-stone-200 bg-white" />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase text-stone-500">
                      <tr>
                        <th className="px-4 py-3.5">Ảnh &amp; Sản phẩm</th>
                        <th className="px-4 py-3.5">Trạng thái</th>
                        <th className="px-4 py-3.5">
                          Giá bán / Ưu đãi Flash Sale
                        </th>
                        <th className="px-4 py-3.5">
                          Phí nhập kho &amp; Lợi nhuận ước tính
                        </th>
                        <th className="px-4 py-3.5">Tồn kho</th>
                        <th className="px-4 py-3.5">Nhập thêm</th>
                        <th className="px-4 py-3.5 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredProducts.map((prod) => {
                        const costMeta = getProductEstimatedProfit(prod);
                        return (
                        <tr key={prod.id} className="hover:bg-stone-50/80">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              {prod.images?.[0] ? (
                                <img
                                  src={prod.images[0]}
                                  alt={prod.title}
                                  className="h-12 w-16 rounded-xl border border-stone-200 bg-stone-900 object-cover shrink-0"
                                />
                              ) : (
                                <div className="flex h-12 w-16 items-center justify-center rounded-xl bg-stone-100 text-stone-400">
                                  <ImageIcon className="h-4 w-4" />
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  {prod.status === 'FLASH_SALE' && (
                                    <Flame className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                  )}
                                  <Link
                                    href={`/products/${prod.slug}`}
                                    className="font-bold text-stone-900 hover:text-rose-600"
                                  >
                                    {prod.title}
                                  </Link>
                                </div>
                                <div className="text-[11px] text-stone-400">
                                  /{prod.slug} • {prod.images?.length ?? 0}{' '}
                                  ảnh
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <select
                              value={prod.status}
                              onChange={(e) =>
                                void handleQuickStatusChange(
                                  prod,
                                  e.target.value,
                                )
                              }
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold border focus:outline-none ${
                                prod.status === 'FLASH_SALE'
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : prod.status === 'ACTIVE'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-stone-200 bg-stone-100 text-stone-600'
                              }`}
                            >
                              <option value="FLASH_SALE">⚡ FLASH_SALE</option>
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                              <option value="ARCHIVED">ARCHIVED</option>
                            </select>
                          </td>

                          <td className="px-4 py-3.5">
                            {prod.status === 'FLASH_SALE' ? (
                              <>
                                <div className="font-black text-rose-600">
                                  Sp 1: {formatCurrency(prod.price)}
                                </div>
                                <div className="text-[11px] font-semibold text-stone-500">
                                  Sp 2+:{' '}
                                  {formatCurrency(
                                    prod.originalPrice ?? prod.price,
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="font-black text-stone-900">
                                {formatCurrency(prod.price)}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-stone-700">
                              Phí nhập:{' '}
                              <span className="font-bold text-stone-900">
                                {formatCurrency(costMeta.importCost)}
                              </span>
                            </div>
                            <div
                              className={`text-[11px] font-bold ${
                                costMeta.firstUnitProfit >= 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              Lãi ước tính:{' '}
                              {costMeta.firstUnitProfit >= 0 ? '+' : ''}
                              {formatCurrency(costMeta.firstUnitProfit)}
                            </div>
                            {prod.status === 'FLASH_SALE' && (
                              <div className="text-[10px] font-semibold text-stone-500">
                                Sp 2+: +{formatCurrency(costMeta.regularUnitProfit)}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`font-bold ${
                                prod.inventory.available_stock > 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              {prod.inventory.available_stock} khả dụng
                            </span>{' '}
                            <span className="text-stone-400">
                              / {prod.inventory.total_stock}
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleQuickAddStock(prod, 25)
                                }
                                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                              >
                                +25
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleQuickAddStock(prod, 100)
                                }
                                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                              >
                                +100
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(prod)}
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                              >
                                <Pencil className="h-3 w-3" />
                                Sửa sản phẩm
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteProduct(prod)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: ADMIN ORDERS VIEW (LIGHT MODE ALIGNED WITH STOREFRONT)         */}
        {/* ===================================================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-stone-200 bg-white p-4 text-stone-700 text-xs space-y-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-rose-600 shrink-0" />
                  <span className="font-medium text-stone-700">
                    Quản lý đơn hàng quản trị: Nhấn vào mã đơn để xem chi tiết
                    thanh toán, vận chuyển và đối soát. Mặc định ẩn đơn Expired.
                  </span>
                </div>
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="lọc mã đơn / email..."
                  className="rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-3">
                <span className="mr-1 text-[11px] font-bold text-stone-500">
                  Trạng thái đơn:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAllOrdersWithExpired(false);
                    setSelectedOrderStatuses([]);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    !showAllOrdersWithExpired &&
                    selectedOrderStatuses.length === 0
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 hover:text-stone-900'
                  }`}
                >
                  Mặc định (Ẩn Expired)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAllOrdersWithExpired(true);
                    setSelectedOrderStatuses([]);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    showAllOrdersWithExpired &&
                    selectedOrderStatuses.length === 0
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 hover:text-stone-900'
                  }`}
                >
                  Hiển thị tất cả
                </button>
                {(
                  [
                    'PENDING',
                    'DEPOSIT_PAID',
                    'PAID',
                    'CANCELLED',
                    'EXPIRED',
                  ] as const
                ).map((st) => {
                  const isSelected = selectedOrderStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => toggleOrderStatusFilter(st)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                        isSelected
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 hover:text-stone-900'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{st}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2.5">
                <span className="mr-1 text-[11px] font-bold text-stone-500">
                  Phân loại sản phẩm (Chọn nhiều):
                </span>
                <button
                  type="button"
                  onClick={() => toggleOrderProductStatusFilter('ALL')}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    selectedOrderProductStatuses.length === 0
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200'
                  }`}
                >
                  Tất cả phân loại
                </button>
                {(
                  [
                    { id: 'FLASH_SALE', label: 'Flash Sale' },
                    { id: 'ACTIVE', label: 'Active' },
                    { id: 'OUT_OF_STOCK', label: 'Out of stock' },
                    { id: 'ARCHIVED', label: 'Archived' },
                  ] as const
                ).map((cls) => {
                  const isSelected = selectedOrderProductStatuses.includes(
                    cls.id,
                  );
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleOrderProductStatusFilter(cls.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                        isSelected
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{cls.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inline Light-Mode Order Inspector Drawer */}
            {inspectedOrder && (
              <div className="rounded-3xl border-2 border-stone-900 bg-white p-6 text-stone-900 text-xs space-y-4 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white">
                      SOI ĐƠN NHANH
                    </span>
                    <span className="font-mono font-bold text-stone-900">
                      ĐƠN #{inspectedOrder.id}
                    </span>
                    <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                      {inspectedOrder.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/orders/${inspectedOrder.id}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-stone-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-stone-800 transition-colors"
                    >
                      Mở bảng quản trị riêng
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setInspectedOrder(null)}
                      className="rounded-full border border-stone-200 p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 text-[11px]">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                    <div className="font-bold text-stone-500">EMAIL KHÁCH HÀNG</div>
                    <div className="mt-1 font-bold text-stone-900 truncate">
                      {inspectedOrder.user?.email ?? inspectedOrder.user_id}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                    <div className="font-bold text-stone-500">PHƯƠNG ÁN THANH TOÁN</div>
                    <div className="mt-1 font-bold text-rose-600">
                      {inspectedOrder.payment_meta?.paymentPlan === 'PARTIAL_COD'
                        ? 'CỌC 10% + COD'
                        : 'CHUYỂN KHOẢN 100%'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                    <div className="font-bold text-stone-500">TIỀN CHUYỂN VIETQR</div>
                    <div className="mt-1 font-bold text-emerald-700">
                      {formatCurrency(
                        inspectedOrder.payment_meta?.depositDueNow ??
                          inspectedOrder.total_amount,
                      )}{' '}
                      (
                      {formatVnd(
                        inspectedOrder.payment_meta?.depositDueNowVnd ??
                          inspectedOrder.total_amount * 25500,
                      )}
                      )
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                    <div className="font-bold text-stone-500">DƯ NỢ COD / TỔNG</div>
                    <div className="mt-1 font-bold text-stone-900">
                      COD:{' '}
                      {formatCurrency(
                        inspectedOrder.payment_meta?.codBalance ?? 0,
                      )}{' '}
                      / TỔNG: {formatCurrency(inspectedOrder.total_amount)}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-t border-stone-200">
                    <thead className="text-stone-500 uppercase border-b border-stone-200 bg-stone-50">
                      <tr>
                        <th className="py-2.5 px-3">SKU / SẢN PHẨM</th>
                        <th className="py-2.5 px-3">QUY TẮC GIÁ</th>
                        <th className="py-2.5 px-3 text-right">SL</th>
                        <th className="py-2.5 px-3 text-right">ĐƠN GIÁ</th>
                        <th className="py-2.5 px-3 text-right">THÀNH TIỀN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {inspectedOrder.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2.5 px-3 font-bold text-stone-900">
                            {item.product?.title ?? item.product_id}
                          </td>
                          <td className="py-2.5 px-3">
                            {item.is_discounted_unit ? (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                GIẢM GIÁ SP 1
                              </span>
                            ) : (
                              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                                GIÁ GỐC SP TIẾP THEO
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right text-stone-700">
                            {formatCurrency(item.price_at_purchase)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-stone-900">
                            {formatCurrency(
                              item.quantity * item.price_at_purchase,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Light-Mode Orders Table aligned with Products & Users tabs */}
            {ordersLoading ? (
              <div className="h-64 animate-pulse rounded-3xl border border-stone-200 bg-white" />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white text-stone-900 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase text-stone-500">
                      <tr>
                        <th className="px-4 py-3.5">Mã đơn hàng</th>
                        <th className="px-4 py-3.5">Khách hàng</th>
                        <th className="px-4 py-3.5">Các mặt hàng (Phân tầng)</th>
                        <th className="px-4 py-3.5">Phương án / Tổng</th>
                        <th className="px-4 py-3.5">Trạng thái &amp; Giao hàng</th>
                        <th className="px-4 py-3.5 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="hover:bg-stone-50/80 transition-colors"
                        >
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setInspectedOrder(order)}
                              className="font-mono font-bold text-rose-600 hover:underline text-left"
                            >
                              {order.id.slice(0, 8).toUpperCase()}
                            </button>
                            <div className="font-mono text-[10px] text-stone-400">
                              {new Date(order.created_at).toISOString().slice(0, 19)}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-[11px] font-medium text-stone-700">
                            {order.user?.email ?? order.user_id.slice(0, 8)}
                          </td>

                          <td className="px-4 py-3.5 text-[11px]">
                            {order.items.map((item) => (
                              <div key={item.id} className="text-stone-700">
                                <span className="font-bold text-stone-900">
                                  {item.quantity}×
                                </span>{' '}
                                {item.product?.title ?? 'Item'} @{' '}
                                {formatCurrency(item.price_at_purchase)}{' '}
                                <span
                                  className={
                                    item.is_discounted_unit
                                      ? 'font-bold text-rose-600'
                                      : 'text-stone-400'
                                  }
                                >
                                  {item.is_discounted_unit
                                    ? '[Ưu đãi]'
                                    : '[Giá gốc]'}
                                </span>
                              </div>
                            ))}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-black text-stone-900">
                              {formatCurrency(order.total_amount)}
                            </div>
                            <div className="text-[10px] font-semibold text-stone-500">
                              {order.payment_meta?.paymentPlan === 'PARTIAL_COD'
                                ? 'CỌC 10% + COD'
                                : 'CHUYỂN KHOẢN 100%'}
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <select
                              value={order.status}
                              onChange={(e) =>
                                void handleOrderStatusChange(
                                  order.id,
                                  e.target.value,
                                )
                              }
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold bg-white focus:outline-none ${
                                order.status === 'PAID'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : order.status === 'DEPOSIT_PAID'
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                    : order.status === 'PENDING'
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : 'border-stone-200 bg-stone-100 text-stone-600'
                              }`}
                            >
                              <option value="PENDING">PENDING (Chờ TT)</option>
                              <option value="DEPOSIT_PAID">
                                DEPOSIT_PAID (Đã cọc 10%)
                              </option>
                              <option value="PAID">PAID (Đã thanh toán)</option>
                              <option value="CANCELLED">CANCELLED (Đã hủy)</option>
                              <option value="EXPIRED">EXPIRED (Hết hạn)</option>
                            </select>
                            <div className="mt-1 text-[10px] text-stone-500">
                              VẬN CHUYỂN:{' '}
                              <span className="font-bold text-stone-800">
                                {order.fulfillment?.status === 'DELIVERED'
                                  ? 'ĐÃ GIAO'
                                  : order.fulfillment?.status === 'SHIPPING'
                                    ? 'ĐANG GIAO'
                                    : order.fulfillment?.status === 'PACKING'
                                      ? 'ĐANG ĐÓNG GÓI'
                                      : 'CHỜ KHO'}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setInspectedOrder(order)}
                                className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                              >
                                Xem nhanh
                              </button>
                              <Link
                                href={`/admin/orders/${order.id}`}
                                className="rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-stone-800 transition-colors"
                              >
                                Chi tiết đơn →
                              </Link>
                              <button
                                type="button"
                                onClick={() => void handleDeleteOrder(order.id)}
                                className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: FURTHER MODIFY ACCOUNTS & USERS                                */}
        {/* ===================================================================== */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-black text-stone-900">
                Quản lý tài khoản &amp; Người dùng ({usersList?.length ?? 0})
              </h1>
              <p className="text-xs text-stone-500">
                Quản lý hồ sơ khách hàng, vai trò quản trị và lịch sử chi tiêu.
              </p>
            </div>
            {/* Full Account Editor Modal / Panel */}
            {editingUser && (
              <div className="rounded-3xl border-2 border-stone-900 bg-white p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                      Chỉnh sửa thông tin tài khoản
                    </span>
                    <h2 className="text-base font-extrabold text-stone-900">
                      Đang sửa tài khoản: {editingUser.email}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => void handleSaveEditUser(e)}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Địa chỉ Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={editUserEmail}
                      onChange={(e) => setEditUserEmail(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Họ và tên
                    </label>
                    <input
                      type="text"
                      value={editUserFullName}
                      onChange={(e) => setEditUserFullName(e.target.value)}
                      placeholder="Họ tên khách hàng hoặc nhân viên"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Số điện thoại
                    </label>
                    <input
                      type="text"
                      value={editUserPhone}
                      onChange={(e) => setEditUserPhone(e.target.value)}
                      placeholder="+84 909 000 111"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Vai trò hệ thống
                    </label>
                    <select
                      value={editUserRole}
                      onChange={(e) =>
                        setEditUserRole(e.target.value as 'CUSTOMER' | 'ADMIN')
                      }
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    >
                      <option value="CUSTOMER">Khách hàng (CUSTOMER)</option>
                      <option value="ADMIN">Quản trị viên (ADMIN)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Địa chỉ nhận hàng mặc định
                    </label>
                    <input
                      type="text"
                      value={editUserAddress}
                      onChange={(e) => setEditUserAddress(e.target.value)}
                      placeholder="Số nhà, đường, quận huyện, tỉnh thành"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Ghi chú nội bộ / Phân hạng VIP
                    </label>
                    <input
                      type="text"
                      value={editUserNotes}
                      onChange={(e) => setEditUserNotes(e.target.value)}
                      placeholder="ví dụ: Khách hàng thân thiết ưu tiên"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-bold text-rose-600">
                      Đặt mật khẩu mới (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      minLength={8}
                      value={editUserNewPassword}
                      onChange={(e) => setEditUserNewPassword(e.target.value)}
                      placeholder="Để trống nếu không đổi"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div className="sm:col-span-12 flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={userActionBusy}
                      className="rounded-xl bg-rose-600 px-6 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {userActionBusy
                        ? 'Đang lưu tài khoản...'
                        : 'Lưu thay đổi tài khoản'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              {/* Left: Create New User Form */}
              <div className="lg:col-span-4">
                <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-base font-extrabold text-stone-900">
                      Tạo tài khoản mới
                    </h2>
                    <p className="mt-0.5 text-xs text-stone-500">
                      Cấp tài khoản mới cho khách hàng hoặc quản trị viên với đầy
                      đủ thông tin hồ sơ.
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => void handleCreateUser(e)}
                    className="space-y-3"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-bold text-stone-700">
                        Địa chỉ Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="newuser@customer.io"
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-stone-700">
                          Họ và tên
                        </label>
                        <input
                          type="text"
                          value={newUserFullName}
                          onChange={(e) => setNewUserFullName(e.target.value)}
                          placeholder="Họ và tên"
                          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-stone-700">
                          Số điện thoại
                        </label>
                        <input
                          type="text"
                          value={newUserPhone}
                          onChange={(e) => setNewUserPhone(e.target.value)}
                          placeholder="+84..."
                          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-stone-700">
                        Địa chỉ nhận hàng
                      </label>
                      <input
                        type="text"
                        value={newUserAddress}
                        onChange={(e) => setNewUserAddress(e.target.value)}
                        placeholder="Địa chỉ giao hàng"
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-stone-700">
                        Ghi chú nội bộ
                      </label>
                      <input
                        type="text"
                        value={newUserNotes}
                        onChange={(e) => setNewUserNotes(e.target.value)}
                        placeholder="Ghi chú phân hạng..."
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-stone-700">
                          Mật khẩu khởi tạo *
                        </label>
                        <input
                          type="text"
                          required
                          minLength={8}
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-stone-700">
                          Vai trò
                        </label>
                        <select
                          value={newUserRole}
                          onChange={(e) =>
                            setNewUserRole(
                              e.target.value as 'CUSTOMER' | 'ADMIN',
                            )
                          }
                          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                        >
                          <option value="CUSTOMER">Khách hàng (CUSTOMER)</option>
                          <option value="ADMIN">Quản trị viên (ADMIN)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={userActionBusy}
                      className="w-full rounded-full bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                    >
                      {userActionBusy ? 'Đang tạo...' : 'Tạo tài khoản'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Right: Users Directory Table */}
              <div className="lg:col-span-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUserFlagFilter('ALL')}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                        userFlagFilter === 'ALL'
                          ? 'bg-stone-900 text-white'
                          : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      Tất cả tài khoản ({usersList?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserFlagFilter('FLAGGED')}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                        userFlagFilter === 'FLAGGED'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      <Flag className="h-3 w-3" />
                      Tài khoản bị gán cờ (
                      {(usersList ?? []).filter(
                        (u) => u.isFlagged || (u.expiredOrders ?? 0) > 0,
                      ).length}
                      )
                    </button>
                  </div>
                </div>

                {usersLoading ? (
                  <div className="h-64 animate-pulse rounded-3xl border border-stone-200 bg-white" />
                ) : (
                  <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase text-stone-500">
                          <tr>
                            <th className="px-4 py-3.5">Tài khoản &amp; Hồ sơ</th>
                            <th className="px-4 py-3.5">Liên hệ &amp; Ghi chú</th>
                            <th className="px-4 py-3.5">Vai trò</th>
                            <th className="px-4 py-3.5">Đơn hàng / Chi tiêu</th>
                            <th className="px-4 py-3.5 text-right">
                              Thao tác
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {(usersList ?? [])
                            .filter((u) =>
                              userFlagFilter === 'FLAGGED'
                                ? Boolean(u.isFlagged) ||
                                  (u.expiredOrders ?? 0) > 0
                                : true,
                            )
                            .map((u) => {
                              const cleanNote =
                                u.notes &&
                                u.notes !== 'Registered via Storefront'
                                  ? u.notes
                                  : '';
                              const expiredCount = u.expiredOrders ?? 0;
                              const flagged =
                                Boolean(u.isFlagged) || expiredCount > 0;
                              return (
                                <tr
                                  key={u.id}
                                  className={`hover:bg-stone-50/80 ${
                                    flagged ? 'bg-rose-50/25' : ''
                                  }`}
                                >
                                  <td className="px-4 py-3.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-stone-900">
                                        {u.fullName || u.email}
                                      </span>
                                      {flagged && (
                                        <span
                                          title={
                                            u.flagReason ||
                                            `Tài khoản có ${expiredCount} đơn quá hạn giữ chỗ không thanh toán`
                                          }
                                          className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800"
                                        >
                                          <Flag className="h-2.5 w-2.5" />
                                          Bị gán cờ
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-stone-500">
                                      {u.email}
                                    </div>
                                    {flagged && (
                                      <div className="mt-0.5 text-[10px] font-semibold text-rose-600">
                                        {u.flagReason ||
                                          `Có ${expiredCount} đơn quá hạn giữ chỗ`}
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-4 py-3.5 text-[11px] text-stone-600">
                                    {u.phone && <div>SĐT: {u.phone}</div>}
                                    {u.address && (
                                      <div className="truncate max-w-[180px]">
                                        Đ/C: {u.address}
                                      </div>
                                    )}
                                    {cleanNote && (
                                      <div className="text-amber-800 font-semibold">
                                        Ghi chú: {cleanNote}
                                      </div>
                                    )}
                                    {!u.phone && !u.address && !cleanNote && (
                                      <span className="text-stone-400">
                                        Chưa có thông tin mở rộng
                                      </span>
                                    )}
                                  </td>

                                  <td className="px-4 py-3.5">
                                    <span
                                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                        u.role === 'ADMIN'
                                          ? 'bg-amber-100 text-amber-900'
                                          : 'bg-stone-100 text-stone-700'
                                      }`}
                                    >
                                      {u.role}
                                    </span>
                                  </td>

                                  <td className="px-4 py-3.5 space-y-1">
                                    <div>
                                      <span className="font-bold text-emerald-700">
                                        {u.paidOrders} đơn đã thanh toán
                                      </span>{' '}
                                      •{' '}
                                      <span className="font-bold text-stone-900">
                                        {formatCurrency(u.totalSpent)}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                      <span
                                        className={`font-semibold ${
                                          expiredCount > 0
                                            ? 'text-rose-600'
                                            : 'text-stone-400'
                                        }`}
                                      >
                                        {expiredCount} đơn hủy do quá hạn
                                      </span>
                                      {(u.pendingOrders ?? 0) > 0 && (
                                        <span className="text-amber-700 font-semibold">
                                          • {u.pendingOrders} đang giữ chỗ
                                        </span>
                                      )}
                                      {(u.cancelledOrders ?? 0) > 0 && (
                                        <span className="text-stone-500">
                                          • {u.cancelledOrders} tự hủy
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-4 py-3.5 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => openEditUserModal(u)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-bold text-stone-800 hover:bg-stone-100"
                                      >
                                        <Pencil className="h-3 w-3" />
                                        Sửa hồ sơ
                                      </button>
                                      <button
                                        type="button"
                                        disabled={userActionBusy}
                                        onClick={() => void handleDeleteUser(u)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: CHECKOUT BANK QR & GUIDANCE CONFIGURATION                      */}
        {/* ===================================================================== */}
        {activeTab === 'checkout_qr' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <form
                onSubmit={(e) => void handleSaveCheckoutConfig(e)}
                className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-5"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                    Cấu hình VietQR &amp; Hướng dẫn
                  </span>
                  <h2 className="mt-0.5 text-lg font-extrabold text-stone-900">
                    Mã VietQR chủ shop &amp; Hướng dẫn thanh toán
                  </h2>
                  <p className="mt-1 text-xs text-stone-500">
                    Cấu hình số tài khoản ngân hàng thụ hưởng mã VietQR, quy tắc
                    đặt cọc (10%, tối thiểu 200.000 ₫) và hướng dẫn thanh toán
                    từng bước cho khách hàng.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tên ngân hàng thụ hưởng *
                    </label>
                    <input
                      type="text"
                      required
                      value={cfgBankName}
                      onChange={(e) => setCfgBankName(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-rose-600">
                      Số tài khoản ngân hàng chủ shop *
                    </label>
                    <input
                      type="text"
                      required
                      value={cfgAccountNumber}
                      onChange={(e) => setCfgAccountNumber(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 font-mono text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tên chủ tài khoản thụ hưởng *
                    </label>
                    <input
                      type="text"
                      required
                      value={cfgAccountHolder}
                      onChange={(e) => setCfgAccountHolder(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Chi nhánh ngân hàng
                    </label>
                    <input
                      type="text"
                      value={cfgBankBranch}
                      onChange={(e) => setCfgBankBranch(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tỷ lệ cọc (%)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={cfgDepositPercent}
                      onChange={(e) => setCfgDepositPercent(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Mức cọc min (VND)
                    </label>
                    <input
                      type="number"
                      min="10000"
                      step="10000"
                      value={cfgMinDepositVnd}
                      onChange={(e) => setCfgMinDepositVnd(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Tỷ giá (USD → VND)
                    </label>
                    <input
                      type="number"
                      min="1000"
                      value={cfgUsdToVndRate}
                      onChange={(e) => setCfgUsdToVndRate(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      Phí ship COD (₫)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={cfgCodShippingFee}
                      onChange={(e) => setCfgCodShippingFee(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
                    />
                  </div>
                </div>

                {/* Admin Bank QR Code Image Upload & Settings */}
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-stone-900">
                        Ảnh QR ngân hàng (Tải lên file ảnh từ thiết bị)
                      </label>
                      <p className="text-[11px] text-stone-500">
                        Ảnh do admin tải lên sẽ hiển thị trực tiếp cho khách hàng. Các thông tin tài khoản sẽ được hệ thống tự ghi ở bên dưới.
                      </p>
                    </div>
                    {cfgQrTemplateUrl && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Đã có ảnh QR
                      </span>
                    )}
                  </div>

                  {cfgQrTemplateUrl ? (
                    <div className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-3">
                      <img
                        src={cfgQrTemplateUrl}
                        alt="Ảnh QR ngân hàng đã tải lên"
                        className="h-20 w-20 rounded-lg object-contain border border-stone-200 bg-stone-50 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="text-xs font-bold text-stone-900">
                          Ảnh QR ngân hàng đang kích hoạt
                        </div>
                        <p className="text-[11px] text-stone-500 truncate">
                          Đã lưu trữ ảnh QR ngân hàng. Khách hàng sẽ thấy ảnh này khi xác nhận thanh toán.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <label className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-200 transition-colors">
                            <Upload className="h-3 w-3" />
                            Thay đổi ảnh khác
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleQrFileChange}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setCfgQrTemplateUrl('')}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                            Xóa ảnh QR
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white p-5 cursor-pointer hover:border-rose-400 hover:bg-rose-50/20 transition-all text-center">
                        <Upload className="h-7 w-7 text-stone-400 mb-1.5" />
                        <span className="text-xs font-bold text-stone-800">
                          Nhấn để chọn file ảnh QR ngân hàng từ máy tính
                        </span>
                        <span className="text-[11px] text-stone-400 mt-0.5">
                          Hỗ trợ định dạng PNG, JPG, JPEG, WebP (Tối đa 10MB)
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleQrFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-stone-500">
                      Hoặc dán trực tiếp link URL ảnh QR (nếu lưu trữ ngoài)
                    </label>
                    <input
                      type="text"
                      value={cfgQrTemplateUrl}
                      onChange={(e) => setCfgQrTemplateUrl(e.target.value)}
                      placeholder="https://... hoặc để trống để dùng mã SVG động"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-900 placeholder:text-stone-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-stone-700">
                    Hướng dẫn thanh toán (Mỗi bước trên một dòng) *
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={cfgGuidance}
                    onChange={(e) => setCfgGuidance(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs leading-relaxed text-stone-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updateCheckoutConfigMutation.isPending}
                  className="rounded-full bg-rose-600 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
                >
                  {updateCheckoutConfigMutation.isPending
                    ? 'Đang lưu cấu hình...'
                    : 'Lưu cấu hình VietQR & Hướng dẫn'}
                </button>
              </form>
            </div>

            {/* Right: Live QR Preview */}
            <div className="lg:col-span-5 space-y-4">
              <div className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                Xem trước mã VietQR của khách hàng
              </div>
              <BankQrPanel
                config={{
                  bankName: cfgBankName || 'Vietcombank',
                  accountNumber: cfgAccountNumber || '0071001298899',
                  accountHolder: cfgAccountHolder || 'AURA COMMERCE',
                  bankBranch: cfgBankBranch,
                  qrTemplateUrl: cfgQrTemplateUrl,
                  checkoutGuidance: cfgGuidance,
                  usdToVndRate: Number(cfgUsdToVndRate) || 1,
                  minDepositVnd: Number(cfgMinDepositVnd) || 200000,
                  partialDepositPercent: Number(cfgDepositPercent) || 10,
                  codShippingFee: Number(cfgCodShippingFee) || 30000,
                  updatedAt: new Date().toISOString(),
                }}
                amountDueUsd={500000}
                amountDueVnd={500000}
                referenceMemo="AURA-PREVIEW-DEP10"
                paymentPlan="PARTIAL_COD"
                codBalanceUsd={4500000}
                compact
              />
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 5: STOCK CONSERVATION AUDIT                                       */}
        {/* ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-5">
              <div>
                <h2 className="text-base font-extrabold text-stone-900">
                  Kiểm toán bảo toàn tồn kho thời gian thực &amp; Đồng bộ Redis
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Kiểm tra bất biến: <code>total_stock</code> phải luôn bằng{' '}
                  <code>available_stock + reserved_stock + sold_stock</code>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={auditProductId}
                  onChange={(e) => setAuditProductId(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-900"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={resetInventoryMutation.isPending}
                  onClick={() =>
                    resetInventoryMutation.mutate({
                      productId: auditProductId,
                      stock: 100,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  Đặt lại tồn kho về 100
                </button>
              </div>
            </div>

            {auditReport && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-xs font-medium text-stone-500">
                    Tổng tồn kho (DB)
                  </div>
                  <div className="mt-1 text-2xl font-black text-stone-900">
                    {auditReport.dbTotalStock}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-xs font-medium text-stone-500">
                    Khả dụng (PG / Redis)
                  </div>
                  <div className="mt-1 text-2xl font-black text-emerald-700">
                    {auditReport.remainingStock} /{' '}
                    {auditReport.redisAvailableStock}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-xs font-medium text-stone-500">
                    Đang giữ chỗ
                  </div>
                  <div className="mt-1 text-2xl font-black text-amber-700">
                    {auditReport.dbReservedStock}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-xs font-medium text-stone-500">Đã bán ra</div>
                  <div className="mt-1 text-2xl font-black text-stone-900">
                    {auditReport.soldItems}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-bold text-emerald-800">
                    Trạng thái bảo toàn
                  </div>
                  <div className="mt-1 text-sm font-black text-emerald-900">
                    {auditReport.invariantHolds
                      ? '✓ Đã đối soát đồng bộ'
                      : 'Đang đối soát'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
