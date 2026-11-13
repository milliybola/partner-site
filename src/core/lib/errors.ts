import { t } from '../i18n';
import type { I18nKey } from '../i18n';

/**
 * Xatolar uchun yagona namuna (barcha ilovada bir xil): nima bo'ldi (sarlavha) · nima qilish kerak · qayta urinish.
 * Serverning o'zbekcha matni bo'lsa — u ustun turadi (masalan, «Parol noto'g'ri»).
 */
export type ErrorKind = 'offline' | 'unreachable' | 'timeout' | 'server' | 'auth' | 'forbidden' | 'notFound' | 'validation' | 'unknown';

export interface ClassifiedError {
  kind: ErrorKind;
  title: string;
  message: string;
  /** «Qayta urinish» tugmasi ma'noli bo'lsa */
  retryable: boolean;
}

const KIND_TEXT: Record<ErrorKind, { title: string; message: string; retryable: boolean }> = {
  offline: { title: "Internet yo'q.", message: 'Wi-Fi yoki mobil internetni tekshiring.', retryable: true },
  unreachable: { title: "Serverga ulanib bo'lmadi.", message: "Birozdan keyin qayta urinib ko'ring.", retryable: true },
  timeout: { title: 'Javob kelmadi.', message: "Internet sekin bo'lishi mumkin — qayta urinib ko'ring.", retryable: true },
  server: { title: 'Serverda nosozlik.', message: "Birozdan keyin qayta urinib ko'ring.", retryable: true },
  auth: { title: 'Sessiya tugadi.', message: 'Qaytadan kiring.', retryable: false },
  forbidden: { title: "Ruxsat yo'q.", message: 'Bu amalni rahbar yoki menejer bajaradi.', retryable: false },
  notFound: { title: 'Topilmadi.', message: "Ehtimol o'chirilgan yoki boshqa filialga tegishli.", retryable: false },
  validation: { title: "Ma'lumot noto'g'ri.", message: "Maydonlarni tekshirib, qayta urinib ko'ring.", retryable: false },
  unknown: { title: 'Nimadir xato ketdi.', message: "Qayta urinib ko'ring.", retryable: true },
};

/** DRF maydon nomlari xodimga o'zbekcha; lug'atda yo'q maydon nomi ko'rsatilmaydi — faqat xabar */
export const FIELD_LABELS: Record<string, string> = {
  contact_phone: 'Telefon',
  contact_name: 'Mijoz ismi',
  address: 'Manzil',
  items: 'Taomlar',
  quantity: 'Miqdor',
  table: 'Stol',
  price: 'Narx',
  name: 'Nomi',
  amount: 'Summa',
  payments: "To'lov",
};

/**
 * Server `code` bo'yicha xodimga tushunarli matn (uz/ru). Server matnidan ustun turadi: server faqat
 * o'zbekcha yozadi, bu yerda esa kassaning tili va «nima qilish kerak» hisobga olinadi.
 */
const CODE_TEXT: Record<string, I18nKey> = {
  PAID_CANCEL_MANAGER_ONLY: 'err.paidCancelManagerOnly',
  PAYMENT_CHANGE_MANAGER_ONLY: 'err.paymentChangeManagerOnly',
  ORDER_PAID: 'err.orderPaid',
  REASON_REQUIRED: 'err.reasonRequired',
  // Platforma bosqichi yetmaydi (backend stage_gate): tarif xabaridan farqli — hamkor hech narsa qila olmaydi
  STAGE_LOCKED: 'err.stageLocked',
  // Qo'lda chegirma (A10): `DISCOUNT_LIMIT` javobida `limit_percent` — matnga {n} sifatida qo'yiladi
  DISCOUNT_MANAGER_ONLY: 'err.discountManagerOnly',
  DISCOUNT_LIMIT: 'err.discountLimit',
  DISCOUNT_TOO_BIG: 'err.discountTooBig',
  ORDER_CLOSED: 'err.discountClosed',
  ONLINE_PAYMENT: 'err.discountOnline',
  NO_DISCOUNT: 'err.discountNone',
  EMPTY_ORDER: 'err.discountEmpty',
  // A3: buyurtma tushadigan filialda smena ochiq emas (kassa, stol, hisobni bo'lish)
  SHIFT_CLOSED: 'err.shiftClosed',
  // A31/D36: kassa to'lovi (naqd/karta/o'tkazma) — buyurtma filialida smena ochiq emas (409)
  SHIFT_NOT_OPEN: 'err.shiftNotOpen',
};

/** Kod matnidagi o'zgaruvchilar (masalan, chegirma chegarasi foizi) */
const codeVars = (err: any): Record<string, string | number> | undefined => {
  const limit = Number(err?.response?.data?.limit_percent);
  return Number.isFinite(limit) && limit > 0 ? { n: Math.round(limit) } : undefined;
};

/** Backend: 403 { code: "STAGE_LOCKED", required_stage } — bo'lim platformaning keyingi bosqichida */
export const isStageLocked = (err: any): boolean => errorCode(err) === 'STAGE_LOCKED';

/** Backend: 403 { code: "SHIFT_CLOSED" } — buyurtma filialida smena ochilmagan */
export const isShiftClosed = (err: any): boolean => errorCode(err) === 'SHIFT_CLOSED';

/** Backend (A31): 409 { code: "SHIFT_NOT_OPEN" } — kassa to'lovi rad etildi, buyurtma o'zgarmadi */
export const isShiftNotOpen = (err: any): boolean => errorCode(err) === 'SHIFT_NOT_OPEN';

/** Serverning xato kodi (`{ code: "ORDER_PAID" }`) — bo'lmasa undefined */
export const errorCode = (err: any): string | undefined => {
  const code = err?.response?.data?.code;
  return typeof code === 'string' ? code : undefined;
};

const withField = (key: string, msg: string) => (FIELD_LABELS[key] ? `${FIELD_LABELS[key]}: ${msg}` : msg);

/** Server javobidagi odam o'qiy oladigan matn (bo'lmasa null) */
const serverMessage = (data: any): string | null => {
  if (typeof data === 'string') return data.length < 200 && data.trim() && !data.trim().startsWith('<') ? data : null;
  if (!data || typeof data !== 'object') return null;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  if (Array.isArray(data.non_field_errors)) return data.non_field_errors.join(' ');
  // DRF field errors: { field: ["msg"] }
  const src = data.errors && typeof data.errors === 'object' ? data.errors : data;
  for (const key of Object.keys(src)) {
    const v = src[key];
    if (Array.isArray(v) && typeof v[0] === 'string') return withField(key, v[0]);
    if (typeof v === 'string' && key !== 'success') return withField(key, v);
  }
  // Ichma-ich (ro'yxat) xatolar: { items: [{}, { quantity: ["msg"] }] } → "2-qator: msg"
  for (const key of Object.keys(src)) {
    const v = src[key];
    if (!Array.isArray(v)) continue;
    const idx = v.findIndex((x) => x && typeof x === 'object' && Object.keys(x).length);
    if (idx < 0) continue;
    const inner = Object.values(v[idx] as Record<string, unknown>)[0];
    const msg = Array.isArray(inner) ? inner[0] : inner;
    if (typeof msg === 'string') return `${idx + 1}-qator: ${msg}`;
  }
  return null;
};

const kindOfStatus = (status?: number): ErrorKind | null => {
  if (!status) return null;
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status >= 500) return 'server';
  if (status >= 400) return 'validation';
  return null;
};

const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Xatoni turga ajratadi: sarlavha, nima qilish kerak, qayta urinish ma'nolimi */
export const classifyError = (err: any, fallback?: string): ClassifiedError => {
  const make = (kind: ErrorKind, message?: string): ClassifiedError => {
    const t = KIND_TEXT[kind];
    return message ? { kind, title: t.title, message, retryable: t.retryable } : { kind, ...t };
  };
  if (!err) return fallback ? make('unknown', fallback) : make('unknown');
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return make('timeout');
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') return make(browserOffline() ? 'offline' : 'unreachable');
  const status: number | undefined = err.response?.status;
  const kind = kindOfStatus(status);
  const code = errorCode(err);
  if (code && CODE_TEXT[code]) {
    const text = t(CODE_TEXT[code], codeVars(err));
    // {n} to'ldirilmagan bo'lsa (server chegarani yubormadi) — serverning o'z matni
    if (!text.includes('{')) return make(kind || 'validation', text);
  }
  const fromServer = serverMessage(err.response?.data);
  if (fromServer) return make(kind || 'validation', fromServer);
  if (kind && kind !== 'validation') return make(kind);
  if (err instanceof Error && err.message && !/status code/i.test(err.message)) return make('unknown', err.message);
  return fallback ? make(kind || 'unknown', fallback) : make(kind || 'unknown');
};

/** Bitta qatorli matn (eski imzo — 30+ chaqiruv joyi o'zgarmaydi) */
export const getErrorMessage = (err: any, fallback = "Xatolik yuz berdi. Qaytadan urinib ko'ring."): string => {
  if (!err) return fallback;
  const c = classifyError(err, fallback);
  const generic = KIND_TEXT[c.kind];
  // Umumiy (bizning) matn — sarlavha + nima qilish; serverning yoki chaqiruvchining matni — o'zi
  return c.message === generic.message && c.title === generic.title ? `${c.title} ${c.message}` : c.message;
};

/** True when an endpoint simply does not exist (yet) on the backend. */
export const isMissingEndpoint = (err: any) => {
  const s = err?.response?.status;
  return s === 404 || s === 405 || s === 501;
};
