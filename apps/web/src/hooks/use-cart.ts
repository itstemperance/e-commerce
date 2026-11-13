'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { tokenStorage, AUTH_CHANGE_EVENT } from '@/lib/api';

export interface CartItem {
  productId: string;
  slug: string;
  title: string;
  price: number;
  originalPrice?: number;
  image?: string;
  quantity: number;
  status?: string;
  tags?: string[];
}

export const CART_CHANGE_EVENT = 'aura-cart-changed';

function getCartStorageKey(): string {
  if (typeof window === 'undefined') return 'aura_cart_guest';
  const user = tokenStorage.getUser();
  return user?.id ? `aura_cart_${user.id}` : 'aura_cart_guest';
}

function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  const key = getCartStorageKey();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function saveCartToStorage(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  const key = getCartStorageKey();
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_CHANGE_EVENT));
  } catch {
    // Ignore storage quota error
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const syncCart = useCallback(() => {
    setItems(loadCartFromStorage());
  }, []);

  useEffect(() => {
    setMounted(true);
    syncCart();

    const handleAuthChange = () => {
      // Switch cart when user logs in or switches accounts
      syncCart();
    };

    window.addEventListener(CART_CHANGE_EVENT, syncCart);
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener('storage', syncCart);

    return () => {
      window.removeEventListener(CART_CHANGE_EVENT, syncCart);
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener('storage', syncCart);
    };
  }, [syncCart]);

  const addItem = useCallback(
    (product: Omit<CartItem, 'quantity'>, qty = 1) => {
      const current = loadCartFromStorage();
      const existingIdx = current.findIndex(
        (i) => i.productId === product.productId,
      );

      let next: CartItem[];
      if (existingIdx >= 0) {
        next = current.map((item, idx) =>
          idx === existingIdx
            ? { ...item, quantity: Math.min(50, item.quantity + qty) }
            : item,
        );
      } else {
        next = [...current, { ...product, quantity: Math.max(1, qty) }];
      }

      saveCartToStorage(next);
      setItems(next);
    },
    [],
  );

  const removeItem = useCallback((productId: string) => {
    const current = loadCartFromStorage();
    const next = current.filter((i) => i.productId !== productId);
    saveCartToStorage(next);
    setItems(next);
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const current = loadCartFromStorage();
    if (quantity <= 0) {
      const next = current.filter((i) => i.productId !== productId);
      saveCartToStorage(next);
      setItems(next);
      return;
    }

    const next = current.map((i) =>
      i.productId === productId
        ? { ...i, quantity: Math.min(50, quantity) }
        : i,
    );
    saveCartToStorage(next);
    setItems(next);
  }, []);

  const clearCart = useCallback(() => {
    saveCartToStorage([]);
    setItems([]);
  }, []);

  const totalCount = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const subtotalUsd = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  return {
    items,
    mounted,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalCount,
    subtotalUsd,
  };
}
