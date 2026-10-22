import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { getToken } from './session';

/** Hamkor tarifi: qaysi imkoniyatlar ochiq va limitlar (backend: GET /partner/tariff/). */
export interface PartnerTariff {
  code: string;
  name: string;
  /** false — tarif belgilanmagan, cheklov yo'q */
  restricted: boolean;
  allow_delivery: boolean;
  allow_pickup: boolean;
  allow_dine_in: boolean;
  /** null — cheksiz */
  max_tables: number | null;
  max_filials: number | null;
  usage: { tables: number; filials: number };
  can_add_table: boolean;
  can_add_filial: boolean;
}

/** Yuklanmaguncha yoki so'rov xato bo'lsa — hech narsani yashirmaymiz (cheklovni baribir server qo'llaydi) */
export const UNRESTRICTED: PartnerTariff = {
  code: 'unlimited', name: 'Cheklovsiz', restricted: false, allow_delivery: true, allow_pickup: true, allow_dine_in: true,
  max_tables: null, max_filials: null, usage: { tables: 0, filials: 0 }, can_add_table: true, can_add_filial: true,
};

let cached: PartnerTariff | null = null;
let inflight: Promise<PartnerTariff> | null = null;
const listeners = new Set<(t: PartnerTariff) => void>();

export async function loadTariff(force = false): Promise<PartnerTariff> {
  if (!getToken()) return UNRESTRICTED;
  if (cached && !force) return cached;
  inflight ??= apiClient
    .get('partner/tariff/')
    .then((res) => (res.data?.data ?? UNRESTRICTED) as PartnerTariff)
    .catch(() => cached ?? UNRESTRICTED)
    .then((t) => {
      cached = t;
      listeners.forEach((l) => l(t));
      return t;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Stol/filial qo'shilgach yoki o'chirilgach foydalanishni yangilash uchun */
export const refreshTariff = () => loadTariff(true);

export function clearTariffCache() {
  cached = null;
}

export function useTariff() {
  const [tariff, setTariff] = useState<PartnerTariff>(cached ?? UNRESTRICTED);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    const listener = (t: PartnerTariff) => alive && setTariff(t);
    listeners.add(listener);
    loadTariff().then((t) => {
      if (alive) {
        setTariff(t);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => refreshTariff(), []);
  return { tariff, loading, refresh };
}

export const limitText = (n: number | null) => (n === null ? 'Cheksiz' : String(n));
