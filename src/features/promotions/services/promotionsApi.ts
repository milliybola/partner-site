import apiClient from '../../../core/api/client';

/**
 * Sets (combos) & BUY_X_GET_Y promotions.
 * Contract: D:\Milliy\API_CONTRACT_SETS_PROMOS.md (shared across all MilliyGo frontends).
 * Backend does NOT have these endpoints yet — every field is read as optional
 * and callers must handle 404/405 (see isMissingEndpoint).
 */

export const PROMO_ENDPOINTS = {
  MY_SETS: 'partner/my/sets/',
  MY_SET: (uuid: string) => `partner/my/sets/${uuid}/`,
  MY_PROMOS: 'partner/my/promotions/',
  MY_PROMO: (uuid: string) => `partner/my/promotions/${uuid}/`,
};

export interface SetItem {
  product?: string; // product uuid
  name?: string;
  image?: string | null;
  quantity?: number;
}

export interface ComboSet {
  uuid?: string;
  partner?: string;
  name?: string;
  description?: string;
  image?: string | null;
  price?: number;
  old_price?: number | null;
  items?: SetItem[];
  is_active?: boolean;
  start_date?: string | null; // dd-MM-yyyy
  end_date?: string | null;
}

export interface Promotion {
  uuid?: string;
  partner?: string;
  type?: 'BUY_X_GET_Y' | string;
  buy_quantity?: number;
  get_quantity?: number;
  products?: string[];
  same_product?: boolean;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface SetPayload {
  name: string;
  description?: string;
  price: number;
  items: { product: string; quantity: number }[];
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface PromotionPayload {
  type: 'BUY_X_GET_Y';
  buy_quantity: number;
  get_quantity: number;
  products: string[];
  same_product: boolean;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

const extractList = <T,>(data: any): T[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.results)) return data.data.results;
  // Backend javobi: {success, data: {sets: [...]}} / {success, data: {promotions: [...]}}
  if (Array.isArray(data?.data?.sets)) return data.data.sets;
  if (Array.isArray(data?.data?.promotions)) return data.data.promotions;
  return [];
};
const extractOne = <T,>(data: any): T => (data?.data && !Array.isArray(data.data) ? data.data : data);

/** Shared free-item rule: group = buy + get; free = floor(qty / group) * get. */
export const calcBuyXGetY = (qty: number, buy: number, get: number) => {
  const group = Math.max(1, (buy || 0) + (get || 0));
  const free = Math.floor(Math.max(0, qty) / group) * Math.max(0, get || 0);
  return { free, pay: Math.max(0, qty) - free };
};

export const promoLabel = (p: Pick<Promotion, 'buy_quantity' | 'get_quantity'>) => `${p.buy_quantity ?? '?'}+${p.get_quantity ?? '?'}`;

/** Builds multipart body when an image file is attached; items are JSON-encoded. */
const toSetBody = (payload: Partial<SetPayload>, image?: File | null) => {
  if (!image) return { body: payload, headers: undefined };
  const fd = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (k === 'items') fd.append('items', JSON.stringify(v));
    else fd.append(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
  });
  fd.append('image', image);
  return { body: fd, headers: { 'Content-Type': 'multipart/form-data' } };
};

export const promotionsApi = {
  // ---- Sets
  getMySets: async (): Promise<ComboSet[]> => {
    const res = await apiClient.get(PROMO_ENDPOINTS.MY_SETS);
    return extractList<ComboSet>(res.data);
  },
  createSet: async (payload: SetPayload, image?: File | null): Promise<ComboSet> => {
    const { body, headers } = toSetBody(payload, image);
    const res = await apiClient.post(PROMO_ENDPOINTS.MY_SETS, body, headers ? { headers } : undefined);
    return extractOne<ComboSet>(res.data);
  },
  updateSet: async (uuid: string, payload: Partial<SetPayload>, image?: File | null): Promise<ComboSet> => {
    const { body, headers } = toSetBody(payload, image);
    const res = await apiClient.patch(PROMO_ENDPOINTS.MY_SET(uuid), body, headers ? { headers } : undefined);
    return extractOne<ComboSet>(res.data);
  },
  deleteSet: async (uuid: string): Promise<void> => {
    await apiClient.delete(PROMO_ENDPOINTS.MY_SET(uuid));
  },

  // ---- Promotions
  getMyPromotions: async (): Promise<Promotion[]> => {
    const res = await apiClient.get(PROMO_ENDPOINTS.MY_PROMOS);
    return extractList<Promotion>(res.data);
  },
  createPromotion: async (payload: PromotionPayload): Promise<Promotion> => {
    const res = await apiClient.post(PROMO_ENDPOINTS.MY_PROMOS, payload);
    return extractOne<Promotion>(res.data);
  },
  updatePromotion: async (uuid: string, payload: Partial<PromotionPayload>): Promise<Promotion> => {
    const res = await apiClient.patch(PROMO_ENDPOINTS.MY_PROMO(uuid), payload);
    return extractOne<Promotion>(res.data);
  },
  deletePromotion: async (uuid: string): Promise<void> => {
    await apiClient.delete(PROMO_ENDPOINTS.MY_PROMO(uuid));
  },
};

/* ------------------------------------------------ Catalog (read-only) */
export interface CatalogProduct {
  uuid: string;
  name: string;
  price: number;
  image: string | null;
  categoryName: string;
  is_available: boolean;
  /** SINGLE — oddiy mahsulot; SET — kombo (setga setni qo'shib bo'lmaydi) */
  kind: 'SINGLE' | 'SET';
}

/** Same call CatalogPage uses: categories come with their products embedded. */
export const loadCatalogProducts = async (partnerUuid: string): Promise<CatalogProduct[]> => {
  const res = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
  const raw = res.data?.data?.categories || res.data?.categories || res.data?.data || res.data || [];
  if (!Array.isArray(raw)) return [];
  const out: CatalogProduct[] = [];
  raw.forEach((c: any) => {
    const categoryName = c.category_details?.name || c.name || '';
    (Array.isArray(c.products) ? c.products : []).forEach((p: any) => {
      if (!p?.uuid) return;
      out.push({
        uuid: p.uuid,
        name: p.name || "Nomi yo'q",
        price: parseFloat(p.price || '0') || 0,
        image: p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null,
        categoryName,
        is_available: p.is_available !== false,
        kind: p.kind === 'SET' ? 'SET' : 'SINGLE',
      });
    });
  });
  return out;
};
