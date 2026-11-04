import apiClient from '../../core/api/client';
import { getWorkingFilial } from '../../core/lib/workingFilial';

export type IngredientUnit = 'KG' | 'L' | 'PIECE';
export type StockState = 'ok' | 'low' | 'out';
export type MovementKind = 'PURCHASE' | 'SALE' | 'SALE_RETURN' | 'WRITE_OFF' | 'COUNT' | 'ADJUST';
export type ManualKind = 'PURCHASE' | 'WRITE_OFF' | 'COUNT';

export interface Ingredient {
  uuid: string;
  name: string;
  unit: IngredientUnit;
  cost_price: number;
  min_stock: number;
  quantity: number;
  stock_value: number;
  state: StockState;
  recipes_count: number | null;
}

export interface IngredientList {
  filial: { uuid: string; name: string };
  summary: { total: number; out: number; low: number; stock_value: number };
  results: Ingredient[];
}

export interface Movement {
  uuid: string;
  kind: MovementKind;
  kind_label: string;
  ingredient: { uuid: string; name: string; unit: IngredientUnit };
  quantity: number;
  unit_cost: number;
  amount: number;
  balance_after: number;
  note: string;
  created_by: string;
  order: { uuid: string; number: string } | null;
  created_at: string;
}

export interface RecipeSummary {
  uuid: string;
  name: string;
  kind: 'SINGLE' | 'SET';
  image: string | null;
  price: number;
  cost: number;
  margin: number | null;
  food_cost_percent: number | null;
  items_count: number;
  has_recipe: boolean;
  from_set: boolean;
}

export interface RecipeLine {
  ingredient: { uuid: string; name: string; unit: IngredientUnit; cost_price: number };
  quantity: number;
  cost: number;
}

export interface RecipeDetail extends RecipeSummary {
  items: RecipeLine[];
}

export interface IngredientInput {
  name: string;
  unit: IngredientUnit;
  cost_price?: number;
  min_stock?: number;
}

/** Rahbar sarlavhada tanlagan filial (xodimda — server o'zi aniqlaydi). */
const filial = () => getWorkingFilial() || undefined;
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const warehouseApi = {
  ingredients: async (q: { search?: string; state?: StockState | '' } = {}): Promise<IngredientList> =>
    (await apiClient.get('partner/ingredients/', { params: clean({ ...q, filial: filial() }) })).data?.data,

  createIngredient: async (body: IngredientInput): Promise<Ingredient> =>
    (await apiClient.post('partner/ingredients/', body)).data?.data,

  updateIngredient: async (uuid: string, body: Partial<IngredientInput>): Promise<Ingredient> =>
    (await apiClient.patch(`partner/ingredients/${uuid}/`, body, { params: clean({ filial: filial() }) })).data?.data,

  deleteIngredient: async (uuid: string): Promise<void> => {
    await apiClient.delete(`partner/ingredients/${uuid}/`);
  },

  movements: async (q: { kind?: MovementKind | ''; ingredient?: string; date_from?: string; date_to?: string; page?: number }) =>
    (await apiClient.get('partner/stock/movements/', { params: clean({ ...q, filial: filial() }) })).data?.data as {
      count: number;
      results: Movement[];
    },

  createMovement: async (body: {
    kind: ManualKind;
    note?: string;
    items: { ingredient: string; quantity: number; unit_cost?: number }[];
  }): Promise<Movement[]> =>
    (await apiClient.post('partner/stock/movements/', clean({ ...body, filial: filial() }))).data?.data?.results,

  recipes: async (q: { search?: string; state?: 'with' | 'without' | '' } = {}): Promise<RecipeSummary[]> =>
    (await apiClient.get('partner/recipes/', { params: clean(q) })).data?.data?.results || [],

  recipe: async (productUuid: string): Promise<RecipeDetail> =>
    (await apiClient.get(`partner/recipes/${productUuid}/`)).data?.data,

  saveRecipe: async (productUuid: string, items: { ingredient: string; quantity: number }[]): Promise<RecipeDetail> =>
    (await apiClient.put(`partner/recipes/${productUuid}/`, { items })).data?.data,
};

export const UNIT_LABEL: Record<IngredientUnit, string> = { KG: 'kg', L: 'l', PIECE: 'dona' };
export const UNIT_OPTIONS: { value: IngredientUnit; label: string }[] = [
  { value: 'KG', label: 'Kilogramm (kg)' },
  { value: 'L', label: 'Litr (l)' },
  { value: 'PIECE', label: 'Dona' },
];

/** 0.25 kg · 3 dona — dona butun, kg/l 4 xonagacha (0.0002 kg = 0.2 g). */
export const formatQty = (qty: number, unit: IngredientUnit): string =>
  `${unit === 'PIECE' ? Math.round(qty) : Number(qty.toFixed(4))} ${UNIT_LABEL[unit]}`;

/** Kiritilgan matnni songa: vergul ham qabul qilinadi. NaN — noto'g'ri. */
/** Server 4 ta kasr xonagacha qabul qiladi (0.0001 kg = 0.1 g). */
export const tooPrecise = (v: string): boolean => (v.trim().split(/[.,]/)[1] || '').length > 4;

export const parseNum = (v: string): number => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

export const STATE_META: Record<StockState, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ok: { label: 'Yetarli', tone: 'success' },
  low: { label: 'Kam qoldi', tone: 'warning' },
  out: { label: 'Tugagan', tone: 'danger' },
};

export const KIND_META: Record<MovementKind, { label: string; tone: 'success' | 'danger' | 'info' | 'neutral' | 'warning' }> = {
  PURCHASE: { label: 'Kirim', tone: 'success' },
  SALE: { label: 'Sotuv', tone: 'neutral' },
  SALE_RETURN: { label: 'Sotuv qaytdi', tone: 'info' },
  WRITE_OFF: { label: 'Hisobdan chiqarish', tone: 'danger' },
  COUNT: { label: 'Inventarizatsiya', tone: 'warning' },
  ADJUST: { label: 'Tuzatish', tone: 'neutral' },
};
