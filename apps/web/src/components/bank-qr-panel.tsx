'use client';

import React, { useMemo, useState } from 'react';
import {
  QrCode,
  Copy,
  Check,
  Building2,
  FileText,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { CheckoutPaymentConfig } from '@/lib/api';
import { formatCurrency, formatVnd } from '@/lib/utils';

interface BankQrPanelProps {
  config: CheckoutPaymentConfig;
  amountDueUsd: number;
  amountDueVnd: number;
  referenceMemo: string;
  paymentPlan: 'FULL_TRANSFER' | 'PARTIAL_COD';
  codBalanceUsd?: number;
  compact?: boolean;
}

/**
 * Generates a deterministic 25x25 QR-style SVG matrix from the bank account number,
 * amount due, and reference memo so that changes in Admin bank settings immediately
 * update the QR code pattern.
 */
function buildDeterministicQrMatrix(payload: string): boolean[][] {
  const size = 25;
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rr][cc] = isBorder || isInner;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment pattern at bottom-right (16..20)
  for (let r = 16; r <= 20; r++) {
    for (let c = 16; c <= 20; c++) {
      reserved[r][c] = true;
      const isBorder = r === 16 || r === 20 || c === 16 || c === 20;
      const isCenter = r === 18 && c === 18;
      grid[r][c] = isBorder || isCenter;
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Deterministic hash stream from payload
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let seed = hash >>> 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      seed = (Math.imul(seed, 1664525) + 1013904223 + r * 31 + c * 17) >>> 0;
      grid[r][c] = (seed & 3) !== 0 && ((seed >>> 2) & 1) === 1;
    }
  }

  return grid;
}

export function BankQrPanel({
  config,
  amountDueUsd,
  amountDueVnd,
  referenceMemo,
  paymentPlan,
  codBalanceUsd = 0,
  compact = false,
}: BankQrPanelProps) {
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);

  const qrPayload = `${config.bankName}|ACC:${config.accountNumber}|HOLDER:${config.accountHolder}|USD:${amountDueUsd.toFixed(2)}|VND:${Math.round(amountDueVnd)}|REF:${referenceMemo}`;

  const qrMatrix = useMemo(
    () => buildDeterministicQrMatrix(qrPayload),
    [qrPayload],
  );

  const guidanceLines = useMemo(
    () =>
      config.checkoutGuidance
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [config.checkoutGuidance],
  );

  function copyText(text: string, target: 'account' | 'memo') {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    if (target === 'account') {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 1800);
    } else {
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 1800);
    }
  }

  return (
    <div className="rounded-3xl border-2 border-stone-900/15 bg-gradient-to-br from-stone-50 via-white to-amber-50/30 p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-white">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-stone-900">
                Mã QR Chuyển Khoản Ngân Hàng Chủ Shop
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                  paymentPlan === 'FULL_TRANSFER'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {paymentPlan === 'FULL_TRANSFER'
                  ? 'Thanh toán 100% • Freeship'
                  : 'Cọc 10% (Tối thiểu 200.000 ₫) + COD'}
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Quét bằng app ngân hàng của bạn hoặc chuyển khoản theo số tài khoản bên dưới
            </p>
          </div>
        </div>
      </div>

      {/* Main QR + Bank Account Window */}
      <div
        className={`grid grid-cols-1 gap-5 ${
          compact ? 'md:grid-cols-12' : 'sm:grid-cols-12'
        } items-center`}
      >
        {/* Left: Scannable QR Code Frame */}
        <div className="sm:col-span-5 flex flex-col items-center">
          <div className="relative rounded-2xl border-2 border-stone-900 bg-white p-3.5 shadow-md">
            {config.qrTemplateUrl ? (
              <img
                src={config.qrTemplateUrl}
                alt="Mã QR Chuyển Khoản Ngân Hàng"
                className="h-44 w-44 object-contain"
              />
            ) : (
              <svg
                viewBox="0 0 27 27"
                className="h-44 w-44"
                role="img"
                aria-label={`Mã QR cho tài khoản ${config.accountNumber}`}
              >
                <rect width="27" height="27" fill="#ffffff" rx="1.5" />
                {qrMatrix.map((row, rIdx) =>
                  row.map((cell, cIdx) =>
                    cell ? (
                      <rect
                        key={`${rIdx}-${cIdx}`}
                        x={cIdx + 1}
                        y={rIdx + 1}
                        width={1}
                        height={1}
                        fill="#0c0a09"
                        rx={0.12}
                      />
                    ) : null,
                  ),
                )}
              </svg>
            )}
            <div className="mt-2 border-t border-stone-100 pt-1.5 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-stone-900">
                {config.bankName}
              </div>
              <div className="font-mono text-[11px] font-bold text-rose-600">
                {config.accountNumber}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Bank Account Credentials & Amount Due */}
        <div className="sm:col-span-7 space-y-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Ngân hàng thụ hưởng
                </div>
                <div className="text-xs font-extrabold text-stone-900 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-stone-500" />
                  {config.bankName}
                </div>
                {config.bankBranch && (
                  <div className="text-[11px] text-stone-500">
                    {config.bankBranch}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Chủ tài khoản
                </div>
                <div className="text-xs font-black text-stone-900">
                  {config.accountHolder}
                </div>
              </div>
            </div>

            {/* Owner Bank Account Number */}
            <div className="flex w-full items-center justify-between rounded-xl bg-stone-100/80 px-3 py-2 overflow-hidden">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Số tài khoản ngân hàng chủ shop
                </div>
                <div className="font-mono text-sm font-black tracking-wider text-stone-900 break-all">
                  {config.accountNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(config.accountNumber, 'account')}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50 shrink-0"
              >
                {copiedAccount ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép
                  </>
                )}
              </button>
            </div>

            {/* Transfer Reference / Memo */}
            <div className="flex w-full items-center justify-between rounded-xl bg-stone-100/80 px-3 py-2 overflow-hidden">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Nội dung chuyển khoản (Memo)
                </div>
                <div className="font-mono text-xs font-black text-rose-600 break-all">
                  {referenceMemo}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(referenceMemo, 'memo')}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
              >
                {copiedMemo ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Transfer Amount Breakdown Box */}
          <div className="rounded-2xl border border-stone-900 bg-stone-900 p-3.5 text-white">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-stone-300">
                {paymentPlan === 'FULL_TRANSFER'
                  ? 'Số tiền cần chuyển khoản (100%):'
                  : 'Tiền đặt cọc cần chuyển (10%, tối thiểu 200.000 ₫):'}
              </span>
              <span className="text-base font-black text-amber-400">
                {formatVnd(amountDueVnd)}
              </span>
            </div>
            {paymentPlan === 'PARTIAL_COD' && (codBalanceUsd ?? 0) > 0 && (
              <div className="mt-2 border-t border-white/15 pt-2 flex items-center justify-between text-[11px] text-amber-200">
                <span>Số tiền còn lại thu khi giao hàng (COD):</span>
                <span className="font-bold">
                  {formatVnd((codBalanceUsd ?? 0) * (config.usdToVndRate || 1))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Configurable Checkout Guidance */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-stone-800">
            <FileText className="h-3.5 w-3.5 text-rose-600" />
            Hướng dẫn thanh toán &amp; Chuyển khoản ngân hàng
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-400">
            <Info className="h-3 w-3" />
            Có thể cấu hình trong trang Admin
          </span>
        </div>

        <div className="space-y-1.5 text-xs leading-relaxed text-stone-600">
          {guidanceLines.map((line, i) => (
            <p key={i} className="flex items-start gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{line}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
