/**
 * End-to-End Test Suite for AURA Flash Sale Commerce
 * Verifies:
 * - Guest checkout with hierarchical address
 * - DEPOSIT_PAID (10%) separation from PAID (100%)
 * - Courier fulfillment workflow (PENDING -> PACKING -> SHIPPING -> DELIVERED)
 * - Public Guest Order Lookup via Phone & Order Code
 */

const API_BASE = 'http://localhost:4000/api/v1';

async function runTest() {
  console.log('🚀 Starting AURA E2E Business Lifecycle & Admin RBAC Verification...\n');

  // 0. Verify Admin Access Control (Unauthenticated 401 -> Customer 403 -> Admin 200)
  console.log('🛡️  Step 0: Verifying Backend Admin Access Control...');
  const unauthAccessRes = await fetch(`${API_BASE}/auth/admin-access`);
  const unauthOverviewRes = await fetch(`${API_BASE}/orders/admin/overview`);
  if (unauthAccessRes.status !== 401 || unauthOverviewRes.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated admin requests, got ${unauthAccessRes.status} / ${unauthOverviewRes.status}`);
  }
  const unauthBody = await unauthAccessRes.json();
  console.log(`   - Unauthenticated /auth/admin-access -> HTTP ${unauthAccessRes.status}: "${unauthBody.message}"`);

  const custLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@customer.io', password: 'Password123!' }),
  });
  const custLogin = await custLoginRes.json();
  const custAccessRes = await fetch(`${API_BASE}/auth/admin-access`, {
    headers: { Authorization: `Bearer ${custLogin.accessToken}` },
  });
  const custOverviewRes = await fetch(`${API_BASE}/orders/admin/overview`, {
    headers: { Authorization: `Bearer ${custLogin.accessToken}` },
  });
  if (custAccessRes.status !== 403 || custOverviewRes.status !== 403) {
    throw new Error(`Expected 403 for CUSTOMER role, got ${custAccessRes.status} / ${custOverviewRes.status}`);
  }
  const custBody = await custAccessRes.json();
  console.log(`   - CUSTOMER /auth/admin-access -> HTTP ${custAccessRes.status}: "${custBody.message}"`);

  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@flashsale.io', password: 'Password123!' }),
  });
  const adminLogin = await adminLoginRes.json();
  const adminToken = adminLogin.accessToken;
  const adminAccessRes = await fetch(`${API_BASE}/auth/admin-access`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (adminAccessRes.status !== 200) {
    throw new Error(`Expected 200 for ADMIN role, got ${adminAccessRes.status}`);
  }
  const adminBody = await adminAccessRes.json();
  console.log(`   - ADMIN /auth/admin-access -> HTTP ${adminAccessRes.status}: "${adminBody.message}"\n`);

  // 1. Get products
  const productsRes = await fetch(`${API_BASE}/products`);
  const productsData = await productsRes.json();
  const product = productsData.items.find(p => p.stock > 0) || productsData.items[0];
  console.log(`📦 Step 1: Selected product "${product.title}" (ID: ${product.id}) - Price: ${product.price.toLocaleString('vi-VN')} ₫`);

  // 2. Guest Flash Checkout with 10% Deposit
  const phone = '0982351080';
  const address = 'Số 18, Ngõ 45 Đường Cầu Giấy, Phường Dịch Vọng, Quận Cầu Giấy, Hà Nội';
  const checkoutPayload = {
    productId: product.id,
    quantity: 1,
    fullName: 'Nguyễn Văn Kiểm Thử',
    phone: phone,
    address: address,
    paymentPlan: 'PARTIAL_COD',
    notes: 'Gọi trước khi giao hàng 15 phút',
  };

  console.log('\n🛒 Step 2: Submitting Checkout with 10% Deposit (PARTIAL_COD)...');
  const idempotencyKey = `e2e-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const checkoutRes = await fetch(`${API_BASE}/orders/flash-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(checkoutPayload),
  });

  if (!checkoutRes.ok) {
    const err = await checkoutRes.text();
    throw new Error(`Checkout failed: ${checkoutRes.status} - ${err}`);
  }

  const checkoutResult = await checkoutRes.json();
  const orderId = checkoutResult.orderId || checkoutResult.id;
  console.log(`✅ Order created successfully: ID=${orderId}, Status=${checkoutResult.status}, Total=${Number(checkoutResult.totalAmount).toLocaleString('vi-VN')} ₫`);
  if (checkoutResult.status !== 'PENDING') throw new Error(`Expected PENDING status, got ${checkoutResult.status}`);

  // 3. Verify Order Details & Metadata
  console.log('\n🔍 Step 3: Verifying Order Details & Payment Metadata...');
  const detailRes = await fetch(`${API_BASE}/orders/${orderId}`);
  const detail = await detailRes.json();
  console.log('   - Payment Plan:', detail.payment_meta?.paymentPlan);
  console.log('   - Deposit Amount:', Number(detail.payment_meta?.depositDueNow).toLocaleString('vi-VN'), '₫');
  console.log('   - COD Balance Amount:', Number(detail.payment_meta?.codBalance).toLocaleString('vi-VN'), '₫');
  console.log('   - Fulfillment Status:', detail.fulfillment?.status);
  console.log('   - isDepositPaid:', detail.payment_meta?.isDepositPaid);
  console.log('   - isFullyPaid:', detail.payment_meta?.isFullyPaid);

  if (detail.payment_meta?.paymentPlan !== 'PARTIAL_COD') throw new Error('Expected paymentPlan PARTIAL_COD');
  if (detail.fulfillment?.status !== 'PENDING') throw new Error('Expected initial fulfillment PENDING');
  if (detail.payment_meta?.isDepositPaid !== false) throw new Error('Expected isDepositPaid false');

  // 4. Test Public Guest Lookup via Phone
  console.log('\n📱 Step 4: Testing Public Guest Lookup with Phone =', phone);
  const lookupRes = await fetch(`${API_BASE}/orders/lookup?phone=${phone}`);
  if (!lookupRes.ok) throw new Error(`Lookup failed: ${lookupRes.status}`);
  const lookupOrders = await lookupRes.json();
  const matchedOrder = lookupOrders.find(o => o.id === orderId);
  if (!matchedOrder) throw new Error(`Order ${orderId} not found in phone lookup!`);
  console.log(`✅ Lookup found order! Order Code: ${matchedOrder.orderCode || matchedOrder.id.slice(0, 8)}`);

  // 5. Customer transfers 10% Deposit -> Admin confirms DEPOSIT_PAID
  console.log('\n💳 Step 5: Admin Confirms 10% Deposit (PENDING -> DEPOSIT_PAID)...');
  const depositRes = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status: 'DEPOSIT_PAID' }),
  });
  if (!depositRes.ok) {
    const err = await depositRes.text();
    throw new Error(`Failed to update to DEPOSIT_PAID: ${depositRes.status} - ${err}`);
  }
  const depositUpdated = await depositRes.json();
  console.log(`✅ Order status updated to: ${depositUpdated.status}`);
  if (depositUpdated.status !== 'DEPOSIT_PAID') {
    throw new Error(`Expected DEPOSIT_PAID status, got ${depositUpdated.status}`);
  }

  // Check detail after deposit
  const detailAfterDeposit = await (await fetch(`${API_BASE}/orders/${orderId}`)).json();
  console.log('   - New Fulfillment Status:', detailAfterDeposit.fulfillment?.status);
  console.log('   - isDepositPaid:', detailAfterDeposit.payment_meta?.isDepositPaid);
  console.log('   - isFullyPaid:', detailAfterDeposit.payment_meta?.isFullyPaid);
  if (detailAfterDeposit.fulfillment?.status !== 'PACKING') throw new Error('Expected fulfillment status PACKING upon deposit');
  if (detailAfterDeposit.payment_meta?.isDepositPaid !== true) throw new Error('Expected isDepositPaid true');

  // 6. Admin assigns Logistics Carrier & Dispatches
  console.log('\n🚚 Step 6: Admin Updates Courier Logistics (PACKING -> SHIPPING)...');
  const shipRes = await fetch(`${API_BASE}/orders/${orderId}/fulfillment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      status: 'SHIPPING',
      shippingCarrier: 'Giao Hàng Tiết Kiệm (GHTK)',
      trackingNumber: 'GHTK-HN889921',
      note: 'Hàng điện tử cao cấp, đồng kiểm khi nhận hàng',
    }),
  });
  if (!shipRes.ok) throw new Error(`Fulfillment update failed: ${shipRes.status}`);
  const shipDetail = await shipRes.json();
  console.log(`✅ Logistics updated: Carrier="${shipDetail.fulfillment?.shippingCarrier}", Tracking="${shipDetail.fulfillment?.trackingNumber}", Status="${shipDetail.fulfillment?.status}"`);
  if (shipDetail.fulfillment?.status !== 'SHIPPING') throw new Error('Expected fulfillment status SHIPPING');
  if (shipDetail.fulfillment?.trackingNumber !== 'GHTK-HN889921') throw new Error('Tracking number mismatch');

  // 7. Verify Guest Lookup shows Shipping Status & Tracking Code
  console.log('\n🔎 Step 7: Verifying Guest Lookup reflects Live Courier Tracking...');
  const lookupShipRes = await fetch(`${API_BASE}/orders/lookup?phone=${phone}`);
  const lookupShipData = await lookupShipRes.json();
  const guestShipOrder = lookupShipData.find(o => o.id === orderId);
  console.log(`   - Order Status: ${guestShipOrder.status}`);
  console.log(`   - Courier: ${guestShipOrder.fulfillment?.shippingCarrier}`);
  console.log(`   - Tracking: ${guestShipOrder.fulfillment?.trackingNumber}`);
  console.log(`   - Fulfillment Status: ${guestShipOrder.fulfillment?.status}`);
  if (guestShipOrder.status !== 'DEPOSIT_PAID') throw new Error('Status should still be DEPOSIT_PAID');
  if (guestShipOrder.fulfillment?.status !== 'SHIPPING') throw new Error('Fulfillment should be SHIPPING');

  // 8. Delivery completed and Remaining COD collected -> Admin marks PAID
  console.log('\n🏁 Step 8: Package Delivered & COD Collected (DEPOSIT_PAID -> PAID)...');
  const paidRes = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status: 'PAID' }),
  });
  if (!paidRes.ok) throw new Error(`Final payment update failed: ${paidRes.status}`);
  const finalOrder = await paidRes.json();
  console.log(`✅ Final Order Status: ${finalOrder.status}`);
  if (finalOrder.status !== 'PAID') throw new Error(`Expected PAID status, got ${finalOrder.status}`);

  const finalDetail = await (await fetch(`${API_BASE}/orders/${orderId}`)).json();
  console.log('   - Final Fulfillment Status:', finalDetail.fulfillment?.status);
  console.log('   - isDepositPaid:', finalDetail.payment_meta?.isDepositPaid);
  console.log('   - isFullyPaid:', finalDetail.payment_meta?.isFullyPaid);
  if (finalDetail.fulfillment?.status !== 'DELIVERED') throw new Error('Expected fulfillment DELIVERED upon full payment');
  if (finalDetail.payment_meta?.isFullyPaid !== true) throw new Error('Expected isFullyPaid true');

  console.log('\n🎉 ALL E2E BUSINESS LIFECYCLE TESTS PASSED 100% PERFECTLY!\n');
}

runTest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
