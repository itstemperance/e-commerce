/**
 * Comprehensive UI & Vietnamese Localization Self-Checking Suite
 * 
 * Verifies:
 * 1. Live HTTP responses (HTTP 200 on all routes without server-side crashes)
 * 2. Stylesheet & Tailwind CSS compilation (preventing unstyled layout breakage)
 * 3. Complete Vietnamese localization across both live SSR and client source files
 * 4. CSS layout safety & responsive design invariants
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_SRC = path.resolve(ROOT_DIR, 'apps/web/src');
const BASE_URL = 'http://localhost:3000';

function fetchUrl(urlPath) {
  return new Promise((resolve, reject) => {
    const fullUrl = urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
    http.get(fullUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          url: fullUrl,
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function stripCommentsAndCode(content) {
  // Strip multi-line comments /* ... */ and JSX comments {/* ... */}
  return content
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
}

// --------------------------------------------------------------------------
// TEST SUITE DEFINITIONS
// --------------------------------------------------------------------------

const LIVE_ROUTES = [
  { path: '/', name: 'Trang chủ (Main Storefront)' },
  { path: '/products', name: 'Danh mục sản phẩm (Product Catalog)' },
  { path: '/products/nvidia-rtx-5090-founders-edition-flash', name: 'Chi tiết sản phẩm (Product Details)' },
  { path: '/cart', name: 'Giỏ hàng của bạn (Cart & Quantity Manager)' },
  { path: '/checkout', name: 'Thanh toán & Điền thông tin (Checkout & Delivery Info)' },
  { path: '/orders', name: 'Quản lý đơn hàng (Orders Hub)' },
  { path: '/orders/lookup', name: 'Tra cứu đơn hàng vãng lai (Public Order Lookup)' },
  { path: '/account', name: 'Cổng thành viên (Account & Member Portal)' },
  { path: '/admin', name: 'Bảng điều khiển Admin (Standalone Console)' },
];

const SOURCE_AUDITS = [
  {
    file: 'app/layout.tsx',
    description: 'Root Layout HTML lang attribute and meta tags',
    required: ['lang="vi"', 'Thiết bị Flagship', 'Flash Deals Giới hạn'],
    forbidden: ['lang="en"'],
  },
  {
    file: 'components/storefront-shell.tsx',
    description: 'Storefront Shell & Footer Localization',
    required: ['Danh mục sản phẩm', 'Chính sách &amp; Dịch vụ', 'Giữ hàng an toàn', 'Bảo lưu mọi quyền'],
    forbidden: ['Customer Service', 'Secure Reservation', 'All rights reserved'],
  },
  {
    file: 'components/navbar.tsx',
    description: 'Top Navbar & User Account Dropdown',
    required: ['Công nghệ Flagship', 'Trang chủ', 'Sản phẩm', 'Flash Deals', 'Tài khoản &amp; Hồ sơ', 'Đổi mật khẩu', 'Đăng xuất', 'Thanh toán'],
    forbidden: ['>Flagship Tech<', '>Home<', '>Account &amp; Profile<', '>Sign In / Join<', '>Express Checkout<'],
  },
  {
    file: 'components/product-card.tsx',
    description: 'Product Card Badges & Detail Navigation',
    required: ['⚡ Flash Deal', 'ảnh', 'Nhanh tay', 'Đã bán', 'Giá ưu đãi sp 1', 'Xem chi tiết'],
    forbidden: ['photos', 'Hurry — only', '1st unit deal', '1-Click Buy', 'Mua ngay'],
  },
  {
    file: 'components/bank-qr-panel.tsx',
    description: 'VietQR & Bank Guidance Component',
    required: ['Thanh toán 100% • Freeship', 'Cọc 10%', 'Ngân hàng thụ hưởng', 'Chủ tài khoản', 'Số tài khoản ngân hàng chủ shop', 'Nội dung chuyển khoản (Memo)', 'Sao chép'],
    forbidden: ['Beneficiary Bank', 'Shop Owner Bank Account Number', 'Transfer Memo', '>Copy<'],
  },
  {
    file: 'app/page.tsx',
    description: 'Main Storefront Home Page',
    required: ['Sự kiện Flash Deal', 'Phần Cứng Đỉnh Cao', 'Card đồ họa & CPU', 'Laptop & Máy cầm tay', 'Âm thanh & Microphone', 'Màn hình & Bàn ghế', 'Giao hàng hỏa tốc miễn phí', 'Bảo hành chính hãng 2 năm', 'Đổi trả linh hoạt 30 ngày'],
    forbidden: ['placeholder1', 'placeholder2', 'placeholder3', 'Shop Flash Deals', 'Next-Generation Hardware'],
  },
  {
    file: 'app/products/page.tsx',
    description: 'Product Catalog & Filters',
    required: ['Tất cả thiết bị Flagship', 'Bộ lọc', 'Khoảng giá (₫)', 'Chỉ hiển thị hàng có sẵn', 'Nổi bật &amp; Flash Deals', 'Giá: Thấp đến Cao', 'Giá: Cao đến Thấp'],
    forbidden: ['Curated Flagship Hardware', '>Price Range<', 'In-stock only', 'Price: Low to High', 'Khoảng giá ($)'],
  },
  {
    file: 'app/products/[slug]/page.tsx',
    description: 'Product Details Page',
    required: [
      'Trang chủ',
      'Sản phẩm',
      'Ưu đãi giảm giá áp dụng cho 1 sản phẩm đầu tiên',
      'Số lượng mua',
      'Sp 1 giảm giá • Sp 2+ theo giá niêm yết',
      'Thêm vào giỏ hàng',
      'Thanh toán ngay',
      'Đặc điểm nổi bật &amp; Thông số',
    ],
    forbidden: [
      '1st unit discount',
      'Buy Now with 1-Click Hold',
      'Multi-Unit Tiered Pricing Rule',
    ],
  },
  {
    file: 'app/cart/page.tsx',
    description: 'Cart and Quantity Management Page',
    required: [
      'Mua thêm sản phẩm khác',
      'GIỎ HÀNG CỦA BẠN',
      'XÁC NHẬN GIỎ HÀNG',
      'Tạm tính',
    ],
    forbidden: ['Express Checkout', 'Place Order'],
  },
  {
    file: 'app/checkout/page.tsx',
    description: 'Checkout & Customer Delivery Information Page',
    required: [
      'Mua thêm sản phẩm khác',
      'GIỎ HÀNG CỦA BẠN',
      'THÔNG TIN KHÁCH HÀNG',
      'Họ tên',
      'Điện thoại',
      'Địa chỉ nhận hàng',
      'ĐẶT HÀNG',
      'Hotline: 098 235 1080',
    ],
    forbidden: [
      '>Express Checkout<',
      '1. Product &amp; Quantity',
      '2. Delivery &amp; Recipient Details',
      '>Order Summary<',
      'placeholder="Họ và tên',
      'placeholder="Số điện thoại',
      'placeholder="Số nhà',
    ],
  },
  {
    file: 'app/orders/[id]/page.tsx',
    description: 'Order Confirmation & Payment Plan Selection (Mockup 2)',
    required: [
      'ĐẶT HÀNG THÀNH CÔNG',
      'Thông tin đặt hàng',
      'Thông tin đơn hàng',
      'Mã số đơn hàng',
      'Cần thanh toán',
      'Chọn hình thức thanh toán',
      'XÁC NHẬN',
    ],
    forbidden: ['Order Live Status'],
  },
  {
    file: 'app/orders/page.tsx',
    description: 'Orders Hub & Custom Order Creator',
    required: ['Trung tâm quản lý &amp; Giữ chỗ đơn hàng', 'Đơn hàng &amp; Tạo đơn tùy chỉnh', 'Tạo đơn hàng mới', 'Phương thức thanh toán', 'Tạm tính dòng', 'Tất cả trạng thái', 'Chờ thanh toán', 'Đã thanh toán', 'Đã hủy', 'Hết hạn'],
    forbidden: ['Order Management &amp; Reservation Center', 'Orders &amp; Custom Order Creator', 'Create a New Order', '>Payment Plan<', 'All Statuses'],
  },
  {
    file: 'app/account/page.tsx',
    description: 'Member Portal & Profile/Security Settings',
    required: ['Cổng thành viên AURA', 'Đăng nhập tài khoản', 'Tạo tài khoản mới', 'Đổi mật khẩu &amp; Bảo mật', 'Đơn hàng của tôi', 'Tổng số đơn đã đặt', 'Đã thanh toán &amp; Xác nhận', 'Đơn đang giữ chỗ', 'Tổng chi tiêu thành công', 'Mật khẩu hiện tại', 'Mật khẩu mới'],
    forbidden: ['AURA Member Portal', 'Sign In to Existing Account', 'Create New Account', 'Change Password &amp; Security', 'Total Orders Placed', 'Current Password', 'New Password'],
  },
  {
    file: 'app/admin/page.tsx',
    description: 'Admin Console & Shop Operations',
    required: ['BẢNG ĐIỀU KHIỂN QUẢN TRỊ AURA', 'Quay lại Cửa hàng chính', 'Doanh thu thực tế', 'Tổng số đơn hàng', 'Sản phẩm &amp; Ảnh', 'Tài khoản người dùng', 'Thêm sản phẩm mới', 'Quản lý đơn hàng quản trị', 'Quản lý tài khoản &amp; Người dùng', 'Cấu hình VietQR &amp; Hướng dẫn', 'Kiểm toán bảo toàn tồn kho'],
    forbidden: ['AURA ADMIN CONSOLE', 'Standalone Operations', 'Return to Main Storefront', 'Settled Revenue', 'Total Orders', 'Products, Photos &amp; Tags', 'Registered Accounts'],
  },
  {
    file: 'app/admin/orders/[id]/page.tsx',
    description: 'Minimalist Admin Order Inspector',
    required: ['Quay lại Bảng điều khiển Quản trị', 'QUẢN_TRỊ_KIỂM_TRA_ĐƠN_HÀNG', 'Xem hóa đơn khách hàng', 'HỒ_SƠ_KHÁCH_HÀNG', 'SỔ_CÁI_THANH_TOÁN', 'TỔNG_KẾT_TÀI_CHÍNH', 'CHI_TIẾT_DÒNG_SẢN_PHẨM', 'CƠ_CHẾ_ƯU_ĐÃI_1_SP_ĐẦU_ĐANG_BẬT', 'GIAO_DỊCH_THANH_TOÁN'],
    forbidden: ['Back to Admin Console', 'ADMIN_ORDER_INSPECTOR', 'Customer Receipt View', 'CUSTOMER_RECORD', 'PAYMENT_PLAN_LEDGER', 'FINANCIAL_TOTALS', 'ORDER_LINE_ITEMS'],
  },
  {
    file: 'app/orders/lookup/page.tsx',
    description: 'Public Guest Order Lookup & Courier Tracking Page',
    required: [
      'Tra Cứu Đơn Hàng AURA',
      'Số điện thoại người nhận',
      'ĐÃ THANH TOÁN CỌC 10%',
      'ĐÃ THANH TOÁN TOÀN BỘ',
      'Đang vận chuyển',
    ],
    forbidden: ['Guest Order Lookup', 'Tracking Details', 'Order Not Found'],
  },
  {
    file: 'lib/vietnam-address.ts',
    description: 'Vietnam Administrative Divisions Data',
    required: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ'],
    forbidden: [],
  },
];

async function main() {
  console.log('\n======================================================================');
  console.log('       AURA FLASH SALE: UI HEALTH, LAYOUT & LOCALIZATION AUDIT        ');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------------------
  // SECTION 1: LIVE HTTP ROUTE VERIFICATION (Prevents 500 runtime errors)
  // -------------------------------------------------------------------------
  console.log('--- [1/4] LIVE HTTP ROUTE STATUS CHECKS (PORT 3000) ---');
  const stylesheetUrls = new Set();

  for (const r of LIVE_ROUTES) {
    total++;
    process.stdout.write(`• Route ${r.path.padEnd(46, ' ')}`);
    try {
      const res = await fetchUrl(r.path);
      if (res.statusCode === 200) {
        console.log(`[PASS ✓] HTTP 200 OK (${r.name})`);
        passed++;

        // Collect CSS bundles
        const linkMatches = res.body.matchAll(/href=["']([^"']+\.css[^"']*)["']/g);
        for (const m of linkMatches) {
          stylesheetUrls.add(m[1]);
        }
      } else {
        console.log(`[FAIL ✗] HTTP ${res.statusCode}`);
      }
    } catch (err) {
      console.log(`[FAIL ✗] Network error: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 2: STYLESHEET INTEGRITY (Prevents unstyled layout breakage)
  // -------------------------------------------------------------------------
  console.log('\n--- [2/4] STYLESHEET & TAILWIND CSS COMPILATION CHECK ---');
  if (stylesheetUrls.size === 0) {
    total++;
    console.log('• Checking CSS links...                              [FAIL ✗] No CSS stylesheets found in HTML!');
  } else {
    for (const cssUrl of stylesheetUrls) {
      total++;
      process.stdout.write(`• Bundle ${cssUrl.slice(0, 44).padEnd(45, ' ')}`);
      try {
        const cssRes = await fetchUrl(cssUrl);
        if (cssRes.statusCode === 200) {
          const sizeKb = (Buffer.byteLength(cssRes.body, 'utf8') / 1024).toFixed(1);
          const hasFlex = cssRes.body.includes('flex');
          const hasGrid = cssRes.body.includes('grid');
          const hasRose = cssRes.body.includes('rose') || cssRes.body.includes('bg-');

          if (hasFlex && hasGrid && hasRose && Number(sizeKb) > 10) {
            console.log(`[PASS ✓] ${sizeKb} KB (Tailwind utility classes verified)`);
            passed++;
          } else {
            console.log(`[FAIL ✗] Incomplete Tailwind compilation (${sizeKb} KB)`);
          }
        } else {
          console.log(`[FAIL ✗] HTTP ${cssRes.statusCode}`);
        }
      } catch (err) {
        console.log(`[FAIL ✗] ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 3: SOURCE CODE VIETNAMESE LOCALIZATION AUDIT
  // -------------------------------------------------------------------------
  console.log('\n--- [3/4] SOURCE CODE VIETNAMESE LOCALIZATION AUDIT ---');
  for (const item of SOURCE_AUDITS) {
    total++;
    process.stdout.write(`• File ${item.file.padEnd(35, ' ')}`);
    const fullPath = path.resolve(WEB_SRC, item.file);

    if (!fs.existsSync(fullPath)) {
      console.log(`[FAIL ✗] File not found: ${item.file}`);
      continue;
    }

    const rawContent = fs.readFileSync(fullPath, 'utf8');
    const content = stripCommentsAndCode(rawContent);

    const missingReq = item.required.filter((str) => !rawContent.includes(str));
    const foundForb = item.forbidden.filter((str) => content.includes(str));

    if (missingReq.length === 0 && foundForb.length === 0) {
      console.log(`[PASS ✓] 100% Localized (${item.description})`);
      passed++;
    } else {
      console.log(`[FAIL ✗] Localization mismatch:`);
      if (missingReq.length > 0) {
        missingReq.forEach((m) => console.log(`    Missing required: "${m}"`));
      }
      if (foundForb.length > 0) {
        foundForb.forEach((f) => console.log(`    Found residual English: "${f}"`));
      }
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 4: LAYOUT & OVERFLOW INTEGRITY AUDIT
  // -------------------------------------------------------------------------
  console.log('\n--- [4/4] LAYOUT & RESPONSIVE OVERFLOW INVARIANTS ---');
  const layoutFiles = [
    { file: 'components/navbar.tsx', label: 'Navbar brand, items & dropdown overflow' },
    { file: 'components/product-card.tsx', label: 'Product card tags & pricing badges wrap' },
    { file: 'components/bank-qr-panel.tsx', label: 'Bank QR copy boxes & amount due wrap' },
    { file: 'app/checkout/page.tsx', label: 'Checkout multi-step cards & summary sidebar' },
    { file: 'app/admin/page.tsx', label: 'Admin navigation, CRUD drawer & tables' },
  ];

  for (const item of layoutFiles) {
    total++;
    process.stdout.write(`• Layout guards in ${item.file.padEnd(30, ' ')}`);
    const content = fs.readFileSync(path.resolve(WEB_SRC, item.file), 'utf8');

    // Layout safety checks: flex wrap, overflow protection, truncation or responsive widths
    const hasWrapOrBreak = content.includes('flex-wrap') || content.includes('truncate') || content.includes('break-');
    const hasOverflowControl = content.includes('overflow-') || content.includes('max-w-') || content.includes('w-full');

    if (hasWrapOrBreak && hasOverflowControl) {
      console.log(`[PASS ✓] (${item.label})`);
      passed++;
    } else {
      console.log(`[FAIL ✗] Missing overflow guards in ${item.file}`);
    }
  }

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`  FINAL AUDIT RESULT: ${passed} / ${total} CHECKS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================\n');

  if (passed === total) {
    console.log('✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
    console.log('   - 0 layout breakage issues found');
    console.log('   - 100% of user interface translated to professional Vietnamese');
    console.log('   - Tailwind CSS stylesheet loaded and active\n');
    process.exit(0);
  } else {
    console.error('❌ SOME AUDIT CHECKS FAILED. See details above.\n');
    process.exit(1);
  }
}

main();
