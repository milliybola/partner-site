import apiClient from '../../core/api/client';

export type StockState = 'ok' | 'low' | 'out';

export interface InventoryRow {
  uuid: string;
  name: string;
  image: string | null;
  unit: 'PIECE' | 'KG';
  step: number;
  barcode: string;
  sku: string;
  brand: string;
  price: number;
  quantity: number;
  is_available: boolean;
  state: StockState;
  filial: { uuid: string; name: string };
}

export interface InventoryList {
  count: number;
  summary: { total: number; out: number; low: number };
  threshold: number;
  filial: { uuid: string; name: string };
  results: InventoryRow[];
}

export interface InventoryQuery {
  filial?: string;
  search?: string;
  state?: StockState | '';
  ordering?: 'quantity' | '-quantity' | 'name';
  threshold?: number;
  page?: number;
  page_size?: number;
}

export interface InventoryUpdate {
  filial?: string;
  quantity?: number;
  mode?: 'set' | 'add';
  is_available?: boolean;
}

export const inventoryApi = {
  list: async (query: InventoryQuery): Promise<InventoryList> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined));
    return (await apiClient.get('partner/inventory/', { params })).data?.data;
  },

  update: async (productUuid: string, body: InventoryUpdate): Promise<InventoryRow> =>
    (await apiClient.patch(`partner/inventory/${productUuid}/`, body)).data?.data,
};

/** Miqdorni birlikka mos ko'rsatish: dona — butun, kg — 3 xonagacha. */
export const formatQty = (qty: number, unit: 'PIECE' | 'KG'): string =>
  unit === 'KG' ? `${Number(qty.toFixed(3))} kg` : `${Math.round(qty)} dona`;

export const STATE_META: Record<StockState, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ok: { label: 'Mavjud', tone: 'success' },
  low: { label: 'Oz qoldi', tone: 'warning' },
  out: { label: 'Tugagan', tone: 'danger' },
};
