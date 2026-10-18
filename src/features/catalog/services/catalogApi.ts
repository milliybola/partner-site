import apiClient from '../../../core/api/client';

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
  promotion: p.promotion && typeof p.promotion === 'object' ? p.promotion : null,
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

  createProduct: async (data: FormData) => {
    await apiClient.post('products/', data, multipart);
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

  deleteProduct: async (uuid: string) => {
    await apiClient.delete(`products/${uuid}/`);
  },
};
