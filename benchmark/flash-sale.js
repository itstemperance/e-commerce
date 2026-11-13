import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * KỊCH BẢN 2 (WRITE-HEAVY FLASH SALE): 2.000 YÊU CẦU ĐỒNG THỜI TRANH MUA 50 SẢN PHẨM
 *
 * Giả lập 2.000 lượt đặt mua đồng thời tranh nhau đúng 50 suất tồn kho
 * (NVIDIA GeForce RTX 5090 Founders Edition).
 *
 * Chế độ BENCHMARK_MODE:
 *  - "naive-no-lock": Không dùng Redis Pre-check, không dùng Distributed/DB Lock (kiểm chứng lỗi bán âm)
 *  - "no-redis-lock": Bỏ qua Redis Pre-check & Redis Lock, đẩy toàn bộ 2.000 request xuống PostgreSQL
 *  - "redis-lock"   : Kiến trúc đầy đủ (Redis Lua Pre-check + Redis Redlock + PG FOR UPDATE) (mặc định)
 *
 * Bất biến bắt buộc ở chế độ "redis-lock":
 *  - Chính xác 50 request thành công (HTTP 201 Created)
 *  - Chính xác 1.950 request bị từ chối nhanh do hết hàng (HTTP 409 Conflict)
 *  - 0 lỗi hệ thống bất thường (5xx / timeout)
 *  - 0 bán âm (sold_items + remaining_stock == 50)
 */

const BASE_URL = __ENV.API_URL || 'http://localhost:4000/api/v1';
const TARGET_PRODUCT_ID =
  __ENV.PRODUCT_ID || '11111111-1111-4111-8111-111111111101';
const BENCHMARK_MODE = __ENV.BENCHMARK_MODE || 'redis-lock';
const INITIAL_STOCK = Number(__ENV.INITIAL_STOCK || 50);
const TOTAL_REQUESTS = Number(__ENV.TOTAL_REQUESTS || 2000);
const VUS = Number(__ENV.VUS || 500);

const ordersCreated201 = new Counter('flash_orders_created_201');
const ordersRejected409 = new Counter('flash_orders_rejected_409');
const unexpectedResponses = new Counter('flash_unexpected_responses');
const systemErrorRate = new Rate('flash_system_error_rate');
const serverProcessingMs = new Trend('flash_server_processing_ms', true);

export const options = {
  scenarios: {
    flash_sale_2000_requests: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: TOTAL_REQUESTS,
      maxDuration: '60s',
    },
  },
  thresholds:
    BENCHMARK_MODE === 'redis-lock'
      ? {
          flash_orders_created_201: [`count == ${INITIAL_STOCK}`],
          flash_orders_rejected_409: [`count == ${TOTAL_REQUESTS - INITIAL_STOCK}`],
          flash_unexpected_responses: ['count == 0'],
        }
      : {},
};

function generateUuid(vu, iter) {
  const rand = Math.random().toString(16).substring(2, 10).padEnd(8, '0');
  const vuHex = (vu % 65535).toString(16).padStart(4, '0');
  const iterHex = (iter % 4095).toString(16).padStart(3, '0');
  const tsHex = Date.now().toString(16).slice(-4).padStart(4, '0');
  return `f5000000-${vuHex}-4${iterHex}-8000-${rand}${tsHex}`;
}

export function setup() {
  const resetRes = http.post(
    `${BASE_URL}/inventory/${TARGET_PRODUCT_ID}/reset`,
    JSON.stringify({ stock: INITIAL_STOCK }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(resetRes, {
    'setup: stock reset to 50 succeeded': (r) => r.status === 200,
  });

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: 'alice@customer.io',
      password: 'Password123!',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const token =
    loginRes.status === 200 ? JSON.parse(loginRes.body).accessToken : '';

  return { token };
}

export default function (data) {
  const idempotencyKey = generateUuid(__VU, __ITER);

  const headers = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
    'X-Benchmark-Mode': BENCHMARK_MODE,
  };

  if (data && data.token) {
    headers['Authorization'] = `Bearer ${data.token}`;
  }

  const payload = JSON.stringify({
    productId: TARGET_PRODUCT_ID,
    quantity: 1,
  });

  let res = http.post(`${BASE_URL}/orders/flash-checkout`, payload, {
    headers,
  });
  for (let retry = 0; retry < 8 && res.status === 0; retry++) {
    sleep(0.02 * (retry + 1) + Math.random() * 0.02);
    res = http.post(`${BASE_URL}/orders/flash-checkout`, payload, {
      headers,
    });
  }

  if (res.status === 201) {
    ordersCreated201.add(1);
    systemErrorRate.add(false);
    try {
      const body = JSON.parse(res.body);
      if (typeof body.processingTimeMs === 'number') {
        serverProcessingMs.add(body.processingTimeMs);
      }
    } catch {
      // ignore parse error
    }
  } else if (res.status === 409) {
    ordersRejected409.add(1);
    systemErrorRate.add(false);
  } else {
    unexpectedResponses.add(1);
    systemErrorRate.add(true);
  }

  check(res, {
    'status is either 201 (Created) or 409 (Out of Stock)': (r) =>
      r.status === 201 || r.status === 409,
  });
}

export function teardown() {
  const auditRes = http.get(`${BASE_URL}/inventory/${TARGET_PRODUCT_ID}/audit`);
  if (auditRes.status === 200) {
    const audit = JSON.parse(auditRes.body);
    console.log('==============================================================');
    console.log(` POST-BENCHMARK INVENTORY AUDIT (${BENCHMARK_MODE.toUpperCase()})`);
    console.log(` Product         : ${audit.title}`);
    console.log(` Initial Stock   : ${audit.initialTotalStock}`);
    console.log(` Sold Items      : ${audit.soldItems}`);
    console.log(` Remaining Stock : ${audit.remainingStock}`);
    console.log(` Redis Stock     : ${audit.redisAvailableStock}`);
    console.log(` Formula         : ${audit.formula}`);
    console.log(` Invariant Holds : ${audit.invariantHolds}`);
    console.log('==============================================================');

    if (BENCHMARK_MODE === 'redis-lock') {
      check(audit, {
        'teardown: sold_items == 50': (a) => a.soldItems === INITIAL_STOCK,
        'teardown: remaining_stock == 0': (a) => a.remainingStock === 0,
        'teardown: sold_items + remaining_stock == 50': (a) =>
          a.soldItems + a.remainingStock === INITIAL_STOCK,
        'teardown: invariantHolds is true': (a) => a.invariantHolds === true,
      });
    }
  }
}

export function handleSummary(data) {
  const totalReqs = data.metrics.http_reqs?.values?.count ?? 0;
  const rps = data.metrics.http_reqs?.values?.rate ?? 0;
  const dur = data.metrics.http_req_duration?.values ?? {};
  const created = data.metrics.flash_orders_created_201?.values?.count ?? 0;
  const rejected = data.metrics.flash_orders_rejected_409?.values?.count ?? 0;
  const unexpected = data.metrics.flash_unexpected_responses?.values?.count ?? 0;
  const sysErrPct = (data.metrics.flash_system_error_rate?.values?.rate ?? 0) * 100;
  const procMs = data.metrics.flash_server_processing_ms?.values?.avg ?? 0;

  const summary = [
    '======================================================================',
    ` KỊCH BẢN 2 (WRITE-HEAVY FLASH SALE) — MODE: ${BENCHMARK_MODE.toUpperCase()}`,
    ` Total Target Requests: ${TOTAL_REQUESTS} (${VUS} VUs) vs Stock: ${INITIAL_STOCK}`,
    '======================================================================',
    ` Total HTTP Requests   : ${totalReqs}`,
    ` Throughput (RPS)      : ${rps.toFixed(2)} req/s`,
    ` Avg Latency           : ${(dur.avg ?? 0).toFixed(2)} ms`,
    ` Median Latency        : ${(dur.med ?? 0).toFixed(2)} ms`,
    ` P95 Latency           : ${(dur['p(95)'] ?? 0).toFixed(2)} ms`,
    ` Server Processing Avg : ${procMs.toFixed(2)} ms`,
    ` Orders Created (201)  : ${created}`,
    ` Out-of-Stock (409)    : ${rejected}`,
    ` Unexpected Errors     : ${unexpected} (System Error Rate: ${sysErrPct.toFixed(2)}%)`,
    '======================================================================',
  ].join('\n');

  return {
    stdout: `\n${summary}\n`,
  };
}
