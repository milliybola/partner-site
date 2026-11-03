import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { getErrorMessage } from './errors';

/**
 * Oflayn rejim (kassa internet uzilganda ham ishlaydi):
 *  - menyu va stollar oxirgi muvaffaqiyatli yuklanganidan keshda saqlanadi;
 *  - internet yo'q paytda yaratilgan buyurtmalar navbatga yoziladi va aloqa tiklanganda yuboriladi.
 *    Har buyurtmada `client_uuid` bor — server uni bir martadan ortiq yaratmaydi (takror yuborish xavfsiz).
 * Hammasi shu qurilmaning localStorage'ida.
 */

/* ---------------------------------------------------------------- network */

/** Javob kelmagan xato (internet yo'q, server yetib bo'lmaydi) — navbatga qo'yish mumkin */
export const isNetworkError = (err: unknown): boolean => {
  const e = err as { response?: unknown; code?: string; message?: string } | null;
  return !!e && !e.response && (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.message === 'Network Error' || !navigator.onLine);
};

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/* ------------------------------------------------------------------ cache */

const CACHE_PREFIX = 'milliygo_cache:';

export const cacheSet = (key: string, data: unknown) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* joy tugagan — kesh ixtiyoriy */
  }
};

export const cacheGet = <T>(key: string): { at: number; data: T } | null => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as { at: number; data: T }) : null;
  } catch {
    return null;
  }
};

/** Tarmoqdan oladi va keshlaydi; internet yo'q bo'lsa — keshdagi oxirgi nusxa (`fromCache: true`) */
export async function withCache<T>(key: string, load: () => Promise<T>): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await load();
    cacheSet(key, data);
    return { data, fromCache: false };
  } catch (err) {
    const cached = isNetworkError(err) ? cacheGet<T>(key) : null;
    if (!cached) throw err;
    return { data: cached.data, fromCache: true };
  }
}

/* ------------------------------------------------------------------ queue */

export type QueuedKind = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

export interface QueuedOrder {
  /** = client_uuid */
  id: string;
  kind: QueuedKind;
  payload: Record<string, unknown>;
  /** Navbatda ko'rsatish uchun: «3-stol», «Olib ketish · Ali» */
  label: string;
  total: number;
  created_at: string;
  /** Server rad etgan bo'lsa — sababi (avtomatik qayta yuborilmaydi) */
  error?: string;
}

const QUEUE_KEY = 'milliygo_offline_orders';
export const QUEUE_EVENT = 'milliygo:offline-queue';

const ENDPOINT: Record<QueuedKind, string> = {
  DINE_IN: 'orders/partner-pos/create-dine-in/',
  PICKUP: 'orders/partner-pos/create-pickup/',
  DELIVERY: 'orders/partner-pos/create-delivery/',
};

export const getQueue = (): QueuedOrder[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
  } catch {
    return [];
  }
};

const saveQueue = (q: QueuedOrder[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
};

export const enqueueOrder = (o: Omit<QueuedOrder, 'created_at'>) => saveQueue([...getQueue(), { ...o, created_at: new Date().toISOString() }]);
export const removeQueued = (id: string) => saveQueue(getQueue().filter((o) => o.id !== id));
/** Rad etilgan buyurtmani qayta urinish uchun (xato belgisini olib tashlaydi) */
export const retryQueued = (id: string) => saveQueue(getQueue().map((o) => (o.id === id ? { ...o, error: undefined } : o)));

export function useOfflineQueue(): QueuedOrder[] {
  const [q, setQ] = useState(getQueue);
  useEffect(() => {
    const sync = () => setQ(getQueue());
    window.addEventListener(QUEUE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(QUEUE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return q;
}

export const newClientUuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

let flushing = false;

/**
 * Navbatni tartib bilan yuboradi. Internet yana uzilsa — to'xtaydi (keyingi safar davom etadi);
 * server rad etsa (smena yopiq, mahsulot yo'q …) — buyurtma `error` bilan qoladi, kassir hal qiladi.
 * Yuborilgan buyurtmalar ro'yxati qaytadi (oshxona printeri ularni qayta chiqarmasligi uchun).
 */
export async function flushQueue(): Promise<{ sent: Array<{ queued: QueuedOrder; order: unknown }>; failed: number }> {
  const sent: Array<{ queued: QueuedOrder; order: unknown }> = [];
  let failed = 0;
  if (flushing) return { sent, failed };
  flushing = true;
  try {
    for (const item of getQueue().filter((o) => !o.error)) {
      try {
        const res = await apiClient.post(ENDPOINT[item.kind], { ...item.payload, client_uuid: item.id });
        removeQueued(item.id);
        sent.push({ queued: item, order: res.data?.data });
      } catch (err) {
        if (isNetworkError(err)) break;
        failed += 1;
        saveQueue(getQueue().map((o) => (o.id === item.id ? { ...o, error: getErrorMessage(err, 'Server buyurtmani qabul qilmadi') } : o)));
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
