import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { getToken } from './session';

/**
 * To'lov usullari — BACKEND bilan bir xil kodlar (`PAYMENT_METHOD`: CASH, CARD, TRANSFER, PAYME, CLICK).
 * Hamkor qaysilarini qabul qilishini `GET/PUT partner/payment-methods/` belgilaydi
 * (shartnoma: D:\Milliy\API_CONTRACT_CALLS_PAYMENTS.md).
 */
export type PayMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'CLICK' | 'PAYME';

export const ALL_PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: 'CASH', label: 'Naqd' },
  { value: 'CARD', label: 'Karta' },
  { value: 'TRANSFER', label: "O'tkazma" },
  { value: 'CLICK', label: 'Click' },
  { value: 'PAYME', label: 'Payme' },
];

/** Eski/begona kodlarni (UZCARD, HUMO) backend kodiga keltiradi. */
export const normalizePayCode = (code?: string | null): PayMethod => {
  const c = String(code || 'CASH').toUpperCase();
  if (c === 'UZCARD' || c === 'HUMO') return 'CARD';
  return (ALL_PAY_METHODS.some((m) => m.value === c) ? c : 'CASH') as PayMethod;
};

export const payMethodLabel = (code?: string | null) => ALL_PAY_METHODS.find((m) => m.value === normalizePayCode(code))!.label;

export interface PaymentMethodsInfo {
  enabled: PayMethod[];
  available: { code: PayMethod; label: string }[];
}

/** Yuklanmaguncha yoki so'rov xato bo'lsa hammasi ko'rinadi (cheklovni baribir server qo'llaydi). */
const ALL: PaymentMethodsInfo = {
  enabled: ALL_PAY_METHODS.map((m) => m.value),
  available: ALL_PAY_METHODS.map((m) => ({ code: m.value, label: m.label })),
};

export const paymentMethodsApi = {
  get: async (): Promise<PaymentMethodsInfo> => {
    const data = (await apiClient.get('partner/payment-methods/')).data?.data;
    const enabled = Array.isArray(data?.enabled) ? (data.enabled as string[]).map(normalizePayCode) : ALL.enabled;
    return { enabled: [...new Set(enabled)], available: Array.isArray(data?.available) && data.available.length ? data.available : ALL.available };
  },
  save: async (enabled: PayMethod[]): Promise<PaymentMethodsInfo> => {
    const data = (await apiClient.put('partner/payment-methods/', { enabled })).data?.data;
    return { enabled: (data?.enabled ?? enabled) as PayMethod[], available: data?.available ?? ALL.available };
  },
};

let cached: PaymentMethodsInfo | null = null;
let inflight: Promise<PaymentMethodsInfo> | null = null;
const listeners = new Set<(p: PaymentMethodsInfo) => void>();

export async function loadPaymentMethods(force = false): Promise<PaymentMethodsInfo> {
  if (!getToken()) return ALL;
  if (cached && !force) return cached;
  inflight ??= paymentMethodsApi
    .get()
    .catch(() => cached ?? ALL)
    .then((p) => {
      cached = p;
      listeners.forEach((l) => l(p));
      return p;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const setPaymentMethodsCache = (p: PaymentMethodsInfo) => {
  cached = p;
  listeners.forEach((l) => l(p));
};

export const clearPaymentMethodsCache = () => {
  cached = null;
};

/** Hamkor yoqqan to'lov usullari (faqat shular tanlanadi). */
export function usePaymentMethods() {
  const [info, setInfo] = useState<PaymentMethodsInfo>(cached ?? ALL);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    const l = (p: PaymentMethodsInfo) => alive && setInfo(p);
    listeners.add(l);
    loadPaymentMethods().then((p) => {
      if (alive) {
        setInfo(p);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      listeners.delete(l);
    };
  }, []);

  const refresh = useCallback(() => loadPaymentMethods(true), []);
  const methods = ALL_PAY_METHODS.filter((m) => info.enabled.includes(m.value));
  return { methods: methods.length ? methods : ALL_PAY_METHODS, enabled: info.enabled, loading, refresh };
}
