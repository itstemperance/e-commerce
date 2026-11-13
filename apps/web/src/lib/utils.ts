import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} ₫`;
}

export function formatVnd(amountVnd: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amountVnd))} ₫`;
}

/**
 * Real-world e-commerce promotional pricing rule:
 * When ordering 2 or more units of a discounted product, ONLY 1 unit receives
 * the discounted price (`price`), while the remaining (`quantity - 1`) units
 * return to the normal retail price (`originalPrice`).
 */
export function computeTieredPricing(
  quantity: number,
  discountedPrice: number,
  originalPrice?: number,
): {
  subtotal: number;
  discountedUnitPrice: number;
  normalPrice: number;
  normalUnitPrice: number;
  hasDiscount: boolean;
  hasMultiUnitRevert: boolean;
  discountedQty: number;
  normalQty: number;
  additionalUnitsCount: number;
  additionalUnitsSubtotal: number;
  savingsOnFirstUnit: number;
} {
  const normalPrice =
    originalPrice && originalPrice > discountedPrice
      ? originalPrice
      : discountedPrice;
  const hasDiscount = normalPrice > discountedPrice;

  if (quantity <= 0) {
    return {
      subtotal: 0,
      discountedUnitPrice: discountedPrice,
      normalPrice,
      normalUnitPrice: normalPrice,
      hasDiscount,
      hasMultiUnitRevert: false,
      discountedQty: 0,
      normalQty: 0,
      additionalUnitsCount: 0,
      additionalUnitsSubtotal: 0,
      savingsOnFirstUnit: 0,
    };
  }

  if (quantity === 1 || !hasDiscount) {
    return {
      subtotal: Number((discountedPrice * quantity).toFixed(2)),
      discountedUnitPrice: discountedPrice,
      normalPrice,
      normalUnitPrice: normalPrice,
      hasDiscount,
      hasMultiUnitRevert: false,
      discountedQty: hasDiscount ? 1 : quantity,
      normalQty: hasDiscount ? 0 : quantity,
      additionalUnitsCount: 0,
      additionalUnitsSubtotal: 0,
      savingsOnFirstUnit: hasDiscount
        ? Number((normalPrice - discountedPrice).toFixed(2))
        : 0,
    };
  }

  const normalQty = quantity - 1;
  const additionalUnitsSubtotal = Number((normalQty * normalPrice).toFixed(2));
  const subtotal = Number(
    (discountedPrice + additionalUnitsSubtotal).toFixed(2),
  );

  return {
    subtotal,
    discountedUnitPrice: discountedPrice,
    normalPrice,
    normalUnitPrice: normalPrice,
    hasDiscount,
    hasMultiUnitRevert: true,
    discountedQty: 1,
    normalQty,
    additionalUnitsCount: normalQty,
    additionalUnitsSubtotal,
    savingsOnFirstUnit: Number((normalPrice - discountedPrice).toFixed(2)),
  };
}

export function generateUuidV4(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
