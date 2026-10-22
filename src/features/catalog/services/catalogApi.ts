import apiClient from '../../../core/api/client';

export type ProductUnit = 'PIECE' | 'KG';

/** Variant (opsiya): masalan "Sous: Achchiq (+0)", "O'lcham: Katta (+8 000)". */
export interface OptionInput {
  uuid?: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  order?: number;
}

/** Mijoz tanlaydigan guruh: kamida `min_select`, ko'pi bilan `max_select` ta variant (min 0 — ixtiyoriy). */
export interface OptionGroupInput {
  uuid?: string;
  name: string;
  min_select: number;
  max_select: number;
  is_active: boolean;
  order?: number;
  options: OptionInput[];
}

/** Qadoq (quti, blok, xalta): `multiplier` dona (yoki kg) ichida, `price` — 1 qadoq narxi. */
export interface ProductPackaging {
  uuid?: string;
  name: string;
  multiplier: number;
  price: number;
  barcode?: string;
}

/** Filial bo'yicha qoldiq (asosiy birlikda: dona yoki kg). */
export interface FilialStock {
  filial: string;
  filial_name: string;
  quantity: number;
}

export interface CatalogProduct {
  uuid?: string;
  id?: number | string;
  name: string;
  description: string;
  price: number;
  category: number | string;
  is_available: boolean;
  is_active: boolean;
  image_url?: string | null;
  /** Shops: present only if backend sends a stock field (not confirmed — see API_GAPS.md). */
  stock?: number | null;
  /** Do'kon (supermarket): sotuv birligi, qadam, identifikatorlar, qadoqlar. */
  unit?: ProductUnit;
  step?: number;
  min_quantity?: number;
  barcode?: string;
  sku?: string;
  brand?: string;
  packagings?: ProductPackaging[];
  /** Variantlar (sous, o'lcham, qo'shimcha) — backend `option_groups` */
  option_groups?: OptionGroupInput[];
  /** SINGLE — oddiy; SET — kombo */
  kind?: 'SINGLE' | 'SET';
  /** Sets/promos contract (D:\Milliy\API_CONTRACT_SETS_PROMOS.md) — only shown when the backend sends it. */
  promotion?: { uuid?: string; type?: string; buy_quantity?: number; get_quantity?: number; label?: string } | null;
}

export interface CatalogCategory {
  id: number | string;
  uuid: string;
  baseCategoryUuid?: string;
  name: string;
  is_active: boolean;
  products: CatalogProduct[];
}

export interface BaseCategory {
  uuid: string;
  name: string;
  logo: string | null;
  description: string;
}

const pickStock = (p: any): number | null => {
  const v = p.stock ?? p.stock_quantity ?? p.quantity_in_stock;
  return v === undefined || v === null || v === '' ? null : Number(v);
};

const mapProduct = (p: any): CatalogProduct => ({
  id: p.id,
  uuid: p.uuid,
  category: p.category,
  name: p.name,
  description: p.description || '',
  price: parseFloat(p.price || '0'),
  is_available: !!p.is_available,
  is_active: !!p.is_active,
  image_url: p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null,
  stock: pickStock(p),
  unit: p.unit === 'KG' ? 'KG' : 'PIECE',
  step: p.step !== undefined ? Number(p.step) : undefined,
  min_quantity: p.min_quantity !== undefined ? Number(p.min_quantity) : undefined,
  barcode: p.barcode || '',
  sku: p.sku || '',
  brand: p.brand || '',
  packagings: Array.isArray(p.packagings)
    ? p.packagings.map((k: { uuid?: string; name: string; multiplier: unknown; price?: string; barcode?: string }) => ({
        uuid: k.uuid,
        name: k.name,
        multiplier: Number(k.multiplier),
        price: Math.round(parseFloat(k.price || '0')),
        barcode: k.barcode || '',
      }))
    : [],
  promotion: p.promotion && typeof p.promotion === 'object' ? p.promotion : null,
  kind: p.kind === 'SET' ? 'SET' : 'SINGLE',
  option_groups: Array.isArray(p.option_groups)
    ? p.option_groups.map((g: any, gi: number) => ({
        uuid: g.uuid,
        name: g.name,
        min_select: Number(g.min_select ?? 0),
        max_select: Number(g.max_select ?? 1),
        is_active: g.is_active !== false,
        order: g.order ?? gi,
        options: (Array.isArray(g.options) ? g.options : []).map((o: any, oi: number) => ({
          uuid: o.uuid,
          name: o.name,
          price_delta: Math.round(parseFloat(o.price_delta || '0')),
          is_available: o.is_available !== false,
          order: o.order ?? oi,
        })),
      }))
    : [],
});

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const catalogApi = {
  getCategories: async (partnerUuid: string): Promise<CatalogCategory[]> => {
    const res = await apiClient.get('partner/category/', { params: { partner: partnerUuid } });
    const raw = res.data?.data?.categories || res.data?.categories || res.data?.data || res.data || [];
    return Array.isArray(raw)
      ? raw.map((c: any) => ({
          id: c.id,
          uuid: c.uuid,
          baseCategoryUuid: c.category_details?.uuid || '',
          name: c.category_details?.name || c.name || "Nomi yo'q",
          is_active: !!c.is_active,
          products: Array.isArray(c.products) ? c.products.map(mapProduct) : [],
        }))
      : [];
  },

  getBaseCategories: async (partnerType: string): Promise<BaseCategory[]> => {
    const res = await apiClient.get('base-categories/', { params: partnerType ? { partner_type: partnerType } : undefined });
    const raw = res.data?.data?.categories || res.data?.categories || res.data?.data || res.data?.results || res.data || [];
    return Array.isArray(raw)
      ? raw.map((e: any) => ({ uuid: e.uuid, name: e.name, logo: e.logo || e.image_url || null, description: e.description || '' }))
      : [];
  },

  setCategoryActive: async (uuid: string, isActive: boolean) => {
    await apiClient.post('partner/category/', { categories: [{ uuid, is_active: isActive }] });
  },

  /** Yaratilgan mahsulot uuid'sini qaytaradi (qadoq va qoldiqni keyin shu bilan saqlash uchun). */
  createProduct: async (data: FormData): Promise<string | undefined> => {
    const res = await apiClient.post('products/', data, multipart);
    return res.data?.data?.uuid || res.data?.uuid;
  },

  updateProduct: async (uuid: string, data: FormData) => {
    await apiClient.put(`products/${uuid}/`, data, multipart);
  },

  /**
   * The old code sent a partial body with PUT. That works only if the backend
   * treats PUT as partial; fall back to PATCH if it rejects with 400/405.
   */
  setAvailability: async (uuid: string, isAvailable: boolean) => {
    try {
      await apiClient.put(`products/${uuid}/`, { is_available: isAvailable });
    } catch (err: any) {
      const s = err?.response?.status;
      if (s === 400 || s === 405) {
        await apiClient.patch(`products/${uuid}/`, { is_available: isAvailable });
      } else {
        throw err;
      }
    }
  },

  /** Filiallar bo'yicha qoldiq (asosiy birlikda). */
  getStock: async (uuid: string): Promise<FilialStock[]> => {
    const res = await apiClient.get(`products/${uuid}/stock/`);
    const rows = res.data?.data?.stocks || [];
    return rows.map((r: { filial: string; filial_name: string; quantity: unknown }) => ({
      filial: r.filial,
      filial_name: r.filial_name,
      quantity: Number(r.quantity),
    }));
  },

  saveStock: async (uuid: string, stocks: Array<{ filial: string; quantity: number }>) => {
    await apiClient.put(`products/${uuid}/stock/`, { stocks });
  },

  /** Qadoqlarni to'liq almashtiradi (uuid berilganlar yangilanadi, ro'yxatda yo'qlari o'chadi). */
  /** Variant guruhlarini to'liq almashtiradi (uuid berilganlar yangilanadi, ro'yxatda yo'qlari o'chadi). */
  saveOptionGroups: async (uuid: string, optionGroups: OptionGroupInput[]) => {
    await apiClient.put(`products/${uuid}/option-groups/`, { option_groups: optionGroups });
  },

  savePackagings: async (uuid: string, packagings: ProductPackaging[]) => {
    await apiClient.put(`products/${uuid}/packagings/`, { packagings });
  },

  deleteProduct: async (uuid: string) => {
    await apiClient.delete(`products/${uuid}/`);
  },
};
