import apiClient from '../../core/api/client';

export type ScreenTheme = 'dark' | 'light';
/** MENU — menyu taxtasi; MEDIA — video/rasm pleylisti (orasida menyu taxtasi ham bo'lishi mumkin) */
export type ScreenKind = 'MENU' | 'MEDIA';

/** Zal TV ekrani (raqamli menyu) — Sozlamalar → TV ekranlar */
export interface PartnerScreen {
  uuid: string;
  name: string;
  kind: ScreenKind;
  code: string;
  interval: number;
  /** Hamkor kategoriyalari uuid — bo'sh: hammasi (katalog tartibida) */
  categories: string[];
  show_images: boolean;
  theme: ScreenTheme;
  /** Brend rangi #RRGGBB */
  accent: string;
  /** Video ekranda ovoz (brauzer ruxsat bermasa — ovozsiz) */
  sound: boolean;
  is_active: boolean;
  last_seen_at: string | null;
  online: boolean;
  filial_uuid: string | null;
  filial_name: string | null;
}

export type ScreenInput = Partial<Pick<PartnerScreen, 'name' | 'interval' | 'categories' | 'kind' | 'show_images' | 'theme' | 'accent' | 'sound' | 'is_active'>> & {
  filial_uuid?: string | null;
};

export type MediaKind = 'VIDEO' | 'IMAGE' | 'MENU';

/** Video ekran pleylisti elementi */
export interface ScreenMedia {
  uuid: string;
  kind: MediaKind;
  name: string;
  size: number;
  /** Rasm va menyu taxtasi — soniya; video o'zi tugaguncha */
  duration: number;
  /** TV uchun ochiq manzil (ekran kodi bilan); menyu taxtasida null */
  url: string | null;
}

export interface TvProduct {
  uuid: string;
  name: string;
  description: string;
  price: number;
  final_price: number;
  /** «110 000 / 130 000» — o'lchamli taom */
  variant_prices: number[];
  image: string | null;
  /** «1+1», «Aksiya» — stiker */
  badge: string | null;
}

export interface TvCategory {
  uuid: string;
  name: string;
  products: TvProduct[];
}

export interface TvPayload {
  uuid: string;
  name: string;
  interval: number;
  show_images: boolean;
  theme: ScreenTheme;
  accent: string;
  kind: ScreenKind;
  sound: boolean;
  playlist: ScreenMedia[];
  partner: { uuid: string; name: string; logo: string | null };
  menu: TvCategory[];
}

const list = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : ((d as { results?: T[] })?.results ?? []));

export const screensApi = {
  list: async (): Promise<PartnerScreen[]> => list<PartnerScreen>((await apiClient.get('partner/screens/')).data),
  create: async (data: ScreenInput): Promise<PartnerScreen> => (await apiClient.post('partner/screens/', data)).data,
  update: async (uuid: string, data: ScreenInput): Promise<PartnerScreen> => (await apiClient.patch(`partner/screens/${uuid}/`, data)).data,
  remove: async (uuid: string): Promise<void> => {
    await apiClient.delete(`partner/screens/${uuid}/`);
  },
  newCode: async (uuid: string): Promise<PartnerScreen> => (await apiClient.post(`partner/screens/${uuid}/new-code/`)).data,
  media: async (uuid: string): Promise<ScreenMedia[]> => (await apiClient.get(`partner/screens/${uuid}/media/`)).data,
  /** Video yoki rasm yuklash (yuklanish foizi bilan) */
  uploadMedia: async (uuid: string, file: File, onProgress?: (pct: number) => void): Promise<ScreenMedia[]> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post(`partner/screens/${uuid}/media/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 15 * 60_000,
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
    return res.data;
  },
  addMenuSlide: async (uuid: string, duration = 30): Promise<ScreenMedia[]> =>
    (await apiClient.post(`partner/screens/${uuid}/media/`, { kind: 'MENU', duration })).data,
  updateMedia: async (uuid: string, mediaUuid: string, data: { duration?: number; name?: string }): Promise<ScreenMedia[]> =>
    (await apiClient.patch(`partner/screens/${uuid}/media/${mediaUuid}/`, data)).data,
  removeMedia: async (uuid: string, mediaUuid: string): Promise<ScreenMedia[]> =>
    (await apiClient.delete(`partner/screens/${uuid}/media/${mediaUuid}/`)).data,
  reorderMedia: async (uuid: string, order: string[]): Promise<ScreenMedia[]> =>
    (await apiClient.post(`partner/screens/${uuid}/media-order/`, { order })).data,
  /** TV: login'siz (shu brauzerda kassaga kirilgan bo'lsa ham token yuborilmaydi) */
  publicScreen: async (code: string): Promise<TvPayload> =>
    (await apiClient.get(`partner/screens/public/${encodeURIComponent(code)}/`, { _skipAuth: true })).data.data,
};

/** TV brauzerida ochiladigan manzil. Kompyuter ilovasida (tauri/file) sayt manzili ma'lum emas — faqat yo'l. */
export const tvUrl = (code?: string): string => {
  const { protocol, origin, pathname } = window.location;
  const base = protocol.startsWith('http') ? `${origin}${pathname}#/tv` : '#/tv';
  return code ? `${base}?code=${code}` : base;
};
