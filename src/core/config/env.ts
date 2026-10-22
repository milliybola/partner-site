/**
 * Muhit sozlamalari (`.env.development`, `.env.production`, `.env.local`).
 * Faqat `VITE_` prefiksli o'zgaruvchilar brauzerga chiqadi — bu yerga maxfiy kalit qo'ymang.
 */
const raw = import.meta.env;

const withTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

const required = (name: 'VITE_API_URL' | 'VITE_WS_URL'): string => {
  const value = String(raw[name] ?? '').trim();
  if (!value) {
    throw new Error(`${name} .env faylida ko'rsatilmagan. .env.example dan nusxa oling.`);
  }
  return value;
};

const positiveNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const env = {
  apiUrl: withTrailingSlash(required('VITE_API_URL')),
  wsUrl: withTrailingSlash(required('VITE_WS_URL')),
  lowStockThreshold: positiveNumber(raw.VITE_LOW_STOCK_THRESHOLD, 5),
  yandexMapsKey: String(raw.VITE_YANDEX_MAPS_KEY ?? '').trim(),
  isDev: Boolean(raw.DEV),
} as const;
