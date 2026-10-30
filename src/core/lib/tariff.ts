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
  /** stol QR menyusi (Plus) */
  allow_qr_menu: boolean;
  /** null — cheksiz. `tables_per_filial` bo'lsa — jami (cap × filiallar soni) */
  max_tables: number | null;
  /** stol limiti har filialga nisbatanmi */
  tables_per_filial: boolean;
  /** har filialga stol soni (jami emas) */
  table_per_filial_cap: number | null;
  max_filials: number | null;
  max_products: number | null;
  max_couriers: number | null;
  /** oyiga bepul MilliyGo buyurtmalari; null — cheksiz */
  free_orders_monthly: number | null;
  /** kvotadan ortgan har buyurtma narxi (so'm) */
  extra_order_fee: number;
  price_monthly: number;
  /** aksiyagacha (chizilgan) narx; 0 yoki price_monthly dan kichik bo'lsa — ko'rsatilmaydi */
  price_monthly_original: number;
  listing_priority: number;
  priority_support: boolean;
  usage: {
    tables: number;
    filials: number;
    products: number;
    couriers: number;
    orders_this_month: number;
    orders_over: number;
    overage_fee: number;
  };
  can_add_table: boolean;
  can_add_filial: boolean;
  can_add_product: boolean;
  can_add_courier: boolean;
  /** Barcha faol tariflar (taqqoslash uchun); joriysi `code` bo'yicha. Eski backendda yo'q. */
  plans?: TariffPlan[];
}

/** Tariflar ro'yxatidagi bitta tarif (limitlar xom: `max_tables` — har filialga, agar `tables_per_filial`) */
export interface TariffPlan {
  code: string;
  name: string;
  description: string;
  price_monthly: number;
  price_monthly_original: number;
  allow_pickup: boolean;
  allow_dine_in: boolean;
  allow_qr_menu: boolean;
  max_tables: number | null;
  tables_per_filial: boolean;
  max_filials: number | null;
  max_products: number | null;
  max_couriers: number | null;
  free_orders_monthly: number | null;
  extra_order_fee: number;
  listing_priority: number;
  priority_support: boolean;
}

/** Yuklanmaguncha yoki so'rov xato bo'lsa — hech narsani yashirmaymiz (cheklovni baribir server qo'llaydi) */
export const UNRESTRICTED: PartnerTariff = {
  code: 'unlimited', name: 'Cheklovsiz', restricted: false, allow_delivery: true, allow_pickup: true, allow_dine_in: true, allow_qr_menu: true,
  max_tables: null, tables_per_filial: false, table_per_filial_cap: null, max_filials: null,
  max_products: null, max_couriers: null, free_orders_monthly: null, extra_order_fee: 0,
  price_monthly: 0, price_monthly_original: 0, listing_priority: 0, priority_support: true,
  usage: { tables: 0, filials: 0, products: 0, couriers: 0, orders_this_month: 0, orders_over: 0, overage_fee: 0 },
  can_add_table: true, can_add_filial: true, can_add_product: true, can_add_courier: true,
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
