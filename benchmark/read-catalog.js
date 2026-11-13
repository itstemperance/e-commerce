import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * KỊCH BẢN 1 (READ-HEAVY): 1.000 NGƯỜI DÙNG ĐỒNG THỜI DUYỆT SẢN PHẨM
 *
 * Đo lường các endpoint đọc mật độ cao:
 *  - GET /products?status=FLASH_SALE
 *  - GET /products/slug/:slug
 *  - GET /inventory/:id
 *
 * Chế độ BENCHMARK_MODE:
 *  - "no-cache": Trước khi áp dụng Caching (truy vấn trực tiếp PostgreSQL)
 *  - "cached"  : Sau khi áp dụng L1 + Redis Caching (mặc định)
 */

const BASE_URL = __ENV.API_URL || 'http://localhost:4000/api/v1';
const BENCHMARK_MODE = __ENV.BENCHMARK_MODE || 'cached';
const VUS = Number(__ENV.VUS || 1000);
const DURATION = __ENV.DURATION || '12s';
const FLASH_SLUG = 'nvidia-rtx-5090-founders-edition-flash';
const FLASH_ID = '11111111-1111-4111-8111-111111111101';

const unexpectedErrors = new Counter('catalog_unexpected_errors');

export const options = {
  scenarios: {
    read_heavy_1000_vus: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '4s', target: Math.round(VUS * 0.4) },
        { duration: '4s', target: VUS },
        { duration: DURATION, target: VUS },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds:
    BENCHMARK_MODE === 'no-cache'
      ? {}
      : {
          http_req_failed: ['rate<0.05'],
        },
};

export default function () {
  const params = {
    headers: {
      'X-Benchmark-Mode': BENCHMARK_MODE,
    },
  };

  const catalogRes = http.get(`${BASE_URL}/products?status=FLASH_SALE`, params);
  if (catalogRes.status !== 200) unexpectedErrors.add(1);
  check(catalogRes, {
    'catalog status 200': (r) => r.status === 200,
  });

  const detailRes = http.get(`${BASE_URL}/products/slug/${FLASH_SLUG}`, params);
  if (detailRes.status !== 200) unexpectedErrors.add(1);
  check(detailRes, {
    'product detail status 200': (r) => r.status === 200,
  });

  const stockRes = http.get(`${BASE_URL}/inventory/${FLASH_ID}`, params);
  if (stockRes.status !== 200) unexpectedErrors.add(1);
  check(stockRes, {
    'live stock status 200': (r) => r.status === 200,
  });

  sleep(0.1);
}

export function handleSummary(data) {
  const totalReqs = data.metrics.http_reqs?.values?.count ?? 0;
  const rps = data.metrics.http_reqs?.values?.rate ?? 0;
  const dur = data.metrics.http_req_duration?.values ?? {};
  const failRate = (data.metrics.http_req_failed?.values?.rate ?? 0) * 100;

  const summary = [
    '======================================================================',
    ` KỊCH BẢN 1 (READ-HEAVY) — MODE: ${BENCHMARK_MODE.toUpperCase()} (${VUS} VUs, ${DURATION})`,
    '======================================================================',
    ` Total HTTP Requests : ${totalReqs}`,
    ` Throughput (RPS)    : ${rps.toFixed(2)} req/s`,
    ` Avg Latency         : ${(dur.avg ?? 0).toFixed(2)} ms`,
    ` Median Latency      : ${(dur.med ?? 0).toFixed(2)} ms`,
    ` P90 Latency         : ${(dur['p(90)'] ?? 0).toFixed(2)} ms`,
    ` P95 Latency         : ${(dur['p(95)'] ?? 0).toFixed(2)} ms`,
    ` Error Rate          : ${failRate.toFixed(2)}%`,
    '======================================================================',
  ].join('\n');

  return {
    stdout: `\n${summary}\n`,
  };
}
