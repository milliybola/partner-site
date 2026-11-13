import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { t } from '../i18n';
import { getErrorMessage, isShiftNotOpen } from './errors';
import { formatMoney } from './format';
import { payMethodLabel } from './payments';
import { PARTNER_UPDATED_EVENT, getFilialUuid, getPartner, type PartnerSession } from './session';
import { getWorkingFilial } from './workingFilial';

/**
 * Oflayn rejim (kassa internet uzilganda ham ishlaydi):
 *  - menyu va stollar oxirgi muvaffaqiyatli yuklanganidan keshda saqlanadi;
 *  - internet yo'q paytda yaratilgan buyurtmalar navbatga yoziladi va aloqa tiklanganda yuboriladi.
 *    Har buyurtmada `client_uuid` bor — server uni bir martadan ortiq yaratmaydi (takror yuborish xavfsiz).
 *  - serverdagi buyurtmaning to'lovi/yakunlanishi ham shu navbatga yoziladi (`payment`): yuborishdan oldin server
 *    holati tekshiriladi, shuning uchun qayta yuborish pulni ikki marta sanamaydi (`sendPayment`).
 * Hammasi shu qurilmaning localStorage'ida.
 */

/* ---------------------------------------------------------------- network */

/** Javob kelmagan xato (internet yo'q, server yetib bo'lmaydi) — navbatga qo'yish mumkin */
export const isNetworkError = (err: unknown): boolean => {
  const e = err as { response?: unknown; code?: string; message?: string } | null;
  return !!e && !e.response && (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.message === 'Network Error' || !navigator.onLine);
};

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/* ------------------------------------------------------------------ cache */

const CACHE_PREFIX = 'milliygo_cache:';

export const cacheSet = (key: string, data: unknown) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* joy tugagan — kesh ixtiyoriy */
  }
};

export const cacheGet = <T>(key: string): { at: number; data: T } | null => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as { at: number; data: T }) : null;
  } catch {
    return null;
  }
};

/** Tarmoqdan oladi va keshlaydi; internet yo'q bo'lsa — keshdagi oxirgi nusxa (`fromCache: true`) */
export async function withCache<T>(key: string, load: () => Promise<T>): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await load();
    cacheSet(key, data);
    return { data, fromCache: false };
  } catch (err) {
    const cached = isNetworkError(err) ? cacheGet<T>(key) : null;
    if (!cached) throw err;
    return { data: cached.data, fromCache: true };
  }
}

/* ------------------------------------------------------------------ queue */

export type QueuedKind = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

/**
 * Oflayn to'lov / yakunlash (serverda bor buyurtma uchun). `collect: true` — kassir pulni oldi
 * (to'lov + yakunlash); `false` — buyurtma oldin to'langan, faqat yakunlanadi.
 */
export interface QueuedPayment {
  /** Buyurtma uuid si; stol hisobida (`table_bill`) — stol uuid si */
  order_uuid: string;
  collect: boolean;
  /** Asosiy usul (bitta usulda — o'zi) */
  method: string;
  /** Aralash to'lov qismlari (2+ usul) */
  payments?: Array<{ method: string; amount: number | string }>;
  split_count?: number;
  /** O'z-o'ziga xizmat zali buyurtmasi (navbatda «oldindan to'langan» deb yoziladi) */
  self_service?: boolean;
  /** Bor bo'lsa — butun stol hisobi (`bill/pay`, faqat bitta usul): bir nechta buyurtma bitta to'lovda */
  table_bill?: QueuedTableBill;
}

/** Oflayn to'langan stol hisobi */
export interface QueuedTableBill {
  table_uuid: string;
  /** Serverdagi buyurtmalar — aynan shular to'lanadi (oflayn paytda stolga qo'shilganlari to'lanmaydi) */
  order_uuids: string[];
  /**
   * Internetsiz ochilgan, hali serverga yetmagan buyurtmalar (navbat id = client_uuid). Navbatda ular to'lovdan
   * oldin turadi: yaratilgach server uuid si `order_uuids` ga o'tadi (`flushQueue`).
   */
  client_uuids?: string[];
}

export interface QueuedOrder {
  /** = client_uuid */
  id: string;
  kind: QueuedKind;
  payload: Record<string, unknown>;
  /** Navbatda ko'rsatish uchun: «3-stol», «Olib ketish · Ali» */
  label: string;
  total: number;
  created_at: string;
  /** Kim yaratgan: `<hamkor uuid>:<xodim uuid | owner>` — faqat shu xodim sessiyasida yuboriladi */
  actor?: string;
  /** Qaysi filial uchun yaratilgan (rahbar tanlagan filial yoki xodimning filiali) */
  filial?: string | null;
  /** Server rad etgan bo'lsa — sababi (avtomatik qayta yuborilmaydi) */
  error?: string;
  /** Bor bo'lsa — bu yozuv buyurtma yaratish emas, to'lov/yakunlash (`kind` e'tiborsiz) */
  payment?: QueuedPayment;
  /** Vaqtinchalik server xatosidan (5xx, 408, 429) keyin: shu vaqtgacha avtomatik qayta yuborilmaydi */
  retry_at?: string;
  /** Ketma-ket vaqtinchalik xatolar soni — kechikish shunga qarab oshadi */
  attempts?: number;
  /**
   * D36: server «smena ochilmagan» dedi (409 SHIFT_NOT_OPEN) — bu rad emas: yozuv navbatda kutadi va smena ochilgach
   * (`releaseShiftWait`) yoki kassir «Qayta urinish» / «Hozir yuborish»ni bosganda yuboriladi. Qiymati — qachondan beri.
   */
  shift_wait?: string;
}

export const isPaymentItem = (o: QueuedOrder): o is QueuedOrder & { payment: QueuedPayment } => !!o.payment;

/**
 * Navbat xodim bo'yicha alohida kalitda saqlanadi: kassada A kirib oflayn buyurtma qilsa, keyin B kirsa —
 * A ning buyurtmalari B nomidan (B tokeni bilan) yuborilmaydi va B ga ko'rinmaydi. A qayta kirganda yuboriladi.
 */
const QUEUE_PREFIX = 'milliygo_offline_orders:';
/** Eski (xodimga bog'lanmagan) umumiy navbat kaliti — faqat ko'chirish uchun */
const LEGACY_QUEUE_KEY = 'milliygo_offline_orders';
export const QUEUE_EVENT = 'milliygo:offline-queue';
/** Oflayn navbat oynasini ochish (kassa pastidagi holat qatoridan) */
export const OFFLINE_SHEET_EVENT = 'milliygo:offline-sheet';
export const LEGACY_QUEUE_ERROR = "Eski navbatdan: kim yaratgani noma'lum. Tekshirib, kerak bo'lsa qayta yuboring";

const ENDPOINT: Record<QueuedKind, string> = {
  DINE_IN: 'orders/partner-pos/create-dine-in/',
  PICKUP: 'orders/partner-pos/create-pickup/',
  DELIVERY: 'orders/partner-pos/create-delivery/',
};

/** Joriy sessiya egasi (`<hamkor>:<xodim | owner>`); tizimga kirilmagan bo'lsa — null */
export const currentActor = (p: PartnerSession | null = getPartner()): string | null => {
  if (!p?.uuid) return null;
  return `${p.uuid}:${p.staff_uuid || (p.user_type === 'staff' ? 'staff' : 'owner')}`;
};

/** Joriy ishlayotgan filial: rahbar tanlagani yoki xodimning o'z filiali */
export const currentFilial = (p: PartnerSession | null = getPartner()): string | null => getWorkingFilial() || getFilialUuid(p) || null;

const queueKey = (actor: string) => QUEUE_PREFIX + actor;

const readList = (key: string): QueuedOrder[] => {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as QueuedOrder[]) : [];
  } catch {
    return [];
  }
};

/**
 * Eski umumiy navbatdagi buyurtmalar joriy xodim navbatiga xato belgisi bilan ko'chadi:
 * kim yaratgani noma'lum, shuning uchun avtomatik yuborilmaydi — xodim ko'rib, qo'lda qayta yuboradi yoki o'chiradi.
 * (Hodisa yuborilmaydi — render paytida chaqirilishi mumkin.)
 */
const migrateLegacy = (actor: string) => {
  try {
    if (localStorage.getItem(LEGACY_QUEUE_KEY) === null) return;
    const legacy = readList(LEGACY_QUEUE_KEY);
    const mine = readList(queueKey(actor));
    const ids = new Set(mine.map((o) => o.id));
    const moved = legacy.filter((o) => o && o.id && !ids.has(o.id)).map((o) => ({ ...o, actor, error: o.error || LEGACY_QUEUE_ERROR }));
    if (moved.length) localStorage.setItem(queueKey(actor), JSON.stringify([...mine, ...moved]));
    localStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    /* ignore */
  }
};

/** Joriy xodimning navbati (boshqa xodimlarniki ko'rinmaydi) */
export const getQueue = (actor: string | null = currentActor()): QueuedOrder[] => {
  if (!actor) return [];
  migrateLegacy(actor);
  return readList(queueKey(actor));
};

const saveQueue = (q: QueuedOrder[], actor: string | null = currentActor()) => {
  if (!actor) return;
  try {
    if (q.length) localStorage.setItem(queueKey(actor), JSON.stringify(q));
    else localStorage.removeItem(queueKey(actor));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
};

/**
 * Buyurtmani joriy xodim navbatiga yozadi. Filial muzlatiladi: olib ketish/yetkazishda `filial_uuid`
 * payload'ga yoziladi — keyin rahbar boshqa filialga o'tsa ham buyurtma o'z filialiga ketadi.
 * Tizimga kirilmagan bo'lsa — xato (chaqiruvchi ko'rsatadi, buyurtma jimgina yo'qolmaydi).
 */
export const enqueueOrder = (o: Omit<QueuedOrder, 'created_at' | 'actor' | 'filial'>) => {
  const p = getPartner();
  const actor = currentActor(p);
  if (!actor) throw new Error('Sessiya topilmadi. Qaytadan tizimga kiring.');
  const filial = currentFilial(p);
  const payload = o.kind !== 'DINE_IN' && filial && !o.payload.filial_uuid ? { ...o.payload, filial_uuid: filial } : o.payload;
  const queue = getQueue(actor);
  if (queue.some((x) => x.id === o.id)) return; // ikki marta bosish — bitta yozuv
  saveQueue([...queue, { ...o, payload, actor, filial, created_at: new Date().toISOString() }], actor);
};
/** To'lov yozuvi id si — bitta buyurtmaga bitta (ikki marta to'lov olinmasin) */
export const paymentQueueId = (orderUuid: string) => `pay:${orderUuid}`;

/** Shu kompyuterdagi barcha xodim navbatlari (faqat o'qish: «bu buyurtma to'lovi navbatdami?» uchun) */
const allQueues = (): QueuedOrder[] => {
  const out: QueuedOrder[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(QUEUE_PREFIX)) out.push(...readList(k));
    }
  } catch {
    /* ignore */
  }
  return out;
};

/**
 * Bu buyurtmaning to'lovi/yakunlanishi shu kompyuterda navbatda turibdimi (istalgan xodimniki, rad etilgani ham).
 * Navbatda bo'lsa — kassa qayta to'lov olmaydi: pul ikki marta olinmasin.
 */
export const isPaymentQueued = (orderUuid: string): boolean =>
  allQueues().some((o) => o.id === paymentQueueId(orderUuid) || paidUuidsOf(o).includes(orderUuid));

/** Stol hisobi to'lovi qamragan buyurtmalar (server uuid lari va hali yaratilmaganlarining client_uuid lari) */
const paidUuidsOf = (o: QueuedOrder): string[] => {
  const b = o.payment?.table_bill;
  return b ? [...(b.order_uuids || []), ...(b.client_uuids || [])] : [];
};

/** Joriy xodim navbatidagi, shu stolga internetsiz ochilgan (hali serverga yetmagan) buyurtmalar */
export const queuedTableOrders = (tableUuid: string): QueuedOrder[] =>
  getQueue().filter((o) => !o.payment && !o.error && o.kind === 'DINE_IN' && o.payload.table === tableUuid);

/**
 * Stol hisobini internetsiz to'lash (butun stol yoki tanlangan buyurtmalar, faqat BITTA usul — `bill/pay` aralashni
 * qabul qilmaydi). Buyurtmalardan biri allaqachon navbatda to'langan bo'lsa — `false` (pul ikki marta olinmasin).
 */
export const enqueueTablePayment = (o: {
  table_uuid: string;
  order_uuids: string[];
  client_uuids?: string[];
  method: string;
  label: string;
  total: number;
}): boolean => {
  const p = getPartner();
  const actor = currentActor(p);
  if (!actor) throw new Error('Sessiya topilmadi. Qaytadan tizimga kiring.');
  const all = [...o.order_uuids, ...(o.client_uuids || [])];
  if (!all.length || all.some(isPaymentQueued)) return false;
  const item: QueuedOrder = {
    id: `bill:${o.table_uuid}:${Date.now()}`,
    kind: 'DINE_IN',
    payload: {},
    label: o.label,
    total: Math.round(Number(o.total) || 0),
    payment: {
      order_uuid: o.table_uuid,
      collect: true,
      method: o.method,
      table_bill: { table_uuid: o.table_uuid, order_uuids: [...o.order_uuids], ...(o.client_uuids?.length ? { client_uuids: [...o.client_uuids] } : {}) },
    },
    actor,
    filial: currentFilial(p),
    created_at: new Date().toISOString(),
  };
  saveQueue([...getQueue(actor), item], actor);
  return true;
};

/** Boshqa xodimlarning shu kompyuterdagi yuborilmagan yozuvlari soni (ular kirgandagina yuboriladi) */
export const othersQueuedCount = (actor: string | null = currentActor()): number =>
  allQueues().filter((o) => o.actor && o.actor !== actor && !o.error).length;

/**
 * Internet yo'qligida qabul qilingan to'lov/yakunlashni navbatga yozadi.
 * `total` — kassir olgan summa: yuborishda server summasi bilan solishtiriladi (farq bo'lsa — yuborilmaydi, kassirga ko'rsatiladi).
 * Shu buyurtma allaqachon navbatda bo'lsa — `false` (ikkinchi to'lov yozilmaydi).
 */
export const enqueuePayment = (o: { payment: QueuedPayment; label: string; total: number }): boolean => {
  const p = getPartner();
  const actor = currentActor(p);
  if (!actor) throw new Error('Sessiya topilmadi. Qaytadan tizimga kiring.');
  if (isPaymentQueued(o.payment.order_uuid)) return false;
  const item: QueuedOrder = {
    id: paymentQueueId(o.payment.order_uuid),
    kind: 'PICKUP', // to'lov yozuvida ishlatilmaydi (eski kod uchun to'g'ri tur)
    payload: {},
    label: o.label,
    total: Math.round(Number(o.total) || 0),
    payment: o.payment,
    actor,
    filial: currentFilial(p),
    created_at: new Date().toISOString(),
  };
  saveQueue([...getQueue(actor), item], actor);
  return true;
};

/**
 * Serverdan kelgan ro'yxatga navbatdagi (hali yuborilmagan) to'lovlarni qo'yadi: internet qaytib ro'yxat yangilanganda
 * oflayn to'langan buyurtma navbat yuborilguncha «to'lanmagan» bo'lib qaytib chiqmasin.
 */
export const applyQueuedPayments = <T extends { uuid: string; status: string; is_paid?: boolean }>(orders: T[]): T[] => {
  const live = allQueues().filter((o): o is QueuedOrder & { payment: QueuedPayment } => isPaymentItem(o) && !o.error);
  const queued = new Map(live.filter((o) => !o.payment.table_bill).map((o) => [o.payment.order_uuid, o.payment]));
  // Stol hisobi to'lovi buyurtmani faqat to'langan qiladi (server ham yakunlamaydi)
  const billPaid = new Map(live.flatMap((o) => paidUuidsOf(o).map((u) => [u, o.payment.method] as const)));
  if (!queued.size && !billPaid.size) return orders;
  return orders.map((o) => {
    const billMethod = billPaid.get(o.uuid);
    if (billMethod && !o.is_paid) return { ...o, is_paid: true, payment_method: billMethod } as T;
    const p = queued.get(o.uuid);
    if (!p || DONE_STATUSES.includes(o.status)) return o;
    return { ...o, status: 'DELIVERED', ...(p.collect ? { is_paid: true, payment_method: p.method } : {}) } as T;
  });
};

/** Navbat tarkibi — yuqoridagi banner va pastki holat qatori bir xil sonlarni ko'rsatadi */
export const summarizeQueue = (q: QueuedOrder[]) => {
  const live = q.filter((o) => !o.error);
  const payments = live.filter(isPaymentItem).length;
  return { payments, orders: live.length - payments, pending: live.length, rejected: q.length - live.length };
};

/** «2 ta to'lov, 1 ta buyurtma» — nol bo'lganlari yozilmaydi */
export const queueWhat = (s: { payments: number; orders: number }) =>
  [s.payments ? `${s.payments} ta to'lov` : '', s.orders ? `${s.orders} ta buyurtma` : ''].filter(Boolean).join(', ');

export const removeQueued = (id: string) => saveQueue(getQueue().filter((o) => o.id !== id));
/** Rad etilgan buyurtmani qayta urinish uchun (xato belgisini olib tashlaydi) */
export const retryQueued = (id: string) =>
  saveQueue(getQueue().map((o) => (o.id === id ? { ...o, error: undefined, retry_at: undefined, attempts: undefined, shift_wait: undefined } : o)));

/** Smenani kutayotgan (SHIFT_NOT_OPEN) yozuvlar — rad etilmagan, smena ochilgach yuboriladi */
export const isShiftWaiting = (o: QueuedOrder): boolean => !o.error && !!o.shift_wait;
export const shiftWaitCount = (q: QueuedOrder[]): number => q.filter(isShiftWaiting).length;

/**
 * Smena ochildi: shu filialdagi kutayotgan yozuvlar yana yuboriladigan bo'ladi (navbat hodisasi OfflineSync'ni
 * uyg'otadi). Filial noma'lum bo'lsa (yozuvda yoki smenada) — hammasi: server baribir o'zi tekshiradi.
 * Hech narsa o'zgarmasa — saqlanmaydi (smena so'rovi har daqiqada keladi).
 */
export const releaseShiftWait = (filialUuid?: string | null): number => {
  const q = getQueue();
  let n = 0;
  const next = q.map((o) => {
    if (!isShiftWaiting(o) || (filialUuid && o.filial && o.filial !== filialUuid)) return o;
    n += 1;
    return { ...o, shift_wait: undefined };
  });
  if (n) saveQueue(next);
  return n;
};
/** Joriy xodimning yuborilmagan (xatosiz) buyurtmalari soni — chiqishdan oldin ogohlantirish uchun */
export const pendingCount = () => getQueue().filter((o) => !o.error).length;

/** Kesh (menyu, stollar) chiqishda tozalanadi: boshqa hamkor/xodim eski ma'lumotni ko'rmasin */
export const clearOfflineCache = () => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
};

export function useOfflineQueue(): QueuedOrder[] {
  const [q, setQ] = useState(() => getQueue());
  useEffect(() => {
    const sync = () => setQ(getQueue());
    window.addEventListener(QUEUE_EVENT, sync);
    window.addEventListener(PARTNER_UPDATED_EVENT, sync); // PIN bilan boshqa xodim kirdi
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(QUEUE_EVENT, sync);
      window.removeEventListener(PARTNER_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return q;
}

export const newClientUuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Kassa o'zi aniqlagan rad sababi (server so'rovisiz) — to'lov jimgina yo'qolmaydi, kassirga ko'rsatiladi */
class QueueRejected extends Error {}

const DONE_STATUSES = ['DELIVERED', 'COMPLETED'];
const DEAD_STATUSES = ['CANCELLED', 'REJECTED'];

const amount = (v: unknown) => Math.round(Number(v) || 0);

/** Serverdagi to'lov kassada olingani bilan bir xilmi (usul va aralash taqsimot) */
const samePayment = (o: { payment_method?: string; payment_breakdown?: Array<{ method: string; amount: number | string }> }, p: QueuedPayment) => {
  const norm = (parts: Array<{ method: string; amount: number | string }>) =>
    parts
      .map((x) => `${x.method}:${amount(x.amount)}`)
      .sort()
      .join('|');
  const server = o.payment_breakdown || [];
  const mine = p.payments && p.payments.length > 1 ? p.payments : [];
  if (mine.length || server.length) return norm(server) === norm(mine);
  return (o.payment_method || '').toUpperCase() === p.method.toUpperCase();
};

/**
 * To'lov/yakunlashni yuborish — qayta yuborilsa ham pul bir marta sanaladi:
 *  1) buyurtmaning serverdagi holati olinadi (oldingi urinish javobi yo'qolgan bo'lishi mumkin);
 *  2) bekor qilingan / summasi o'zgargan / boshqa usulda to'langan bo'lsa — YUBORILMAYDI, sabab kassirga;
 *  3) hali to'lanmagan bo'lsa — `mark-paid` (server: bir xil to'lov takrori o'zgarishsiz 200);
 *  4) hali yakunlanmagan bo'lsa — `complete` (to'lov maydonlarisiz: to'lov 3-qadamda yozilgan).
 */
async function sendPayment(item: QueuedOrder & { payment: QueuedPayment }): Promise<unknown> {
  const p = item.payment;
  const base = `orders/partner-pos/${p.order_uuid}/`;
  let o = (await apiClient.get(base)).data?.data as
    | { status?: string; is_paid?: boolean; total_price?: number | string; payment_method?: string; payment_breakdown?: Array<{ method: string; amount: number | string }> }
    | undefined;
  if (!o) throw new QueueRejected('Buyurtma serverda topilmadi.');
  if (DEAD_STATUSES.includes(o.status || '')) {
    throw new QueueRejected(
      p.collect
        ? `Buyurtma bekor qilingan, kassada ${formatMoney(item.total)} olingan. Pulni mijozga qaytaring yoki menejerga ayting.`
        : 'Buyurtma bekor qilingan — yakunlanmadi.',
    );
  }
  if (p.collect) {
    if (amount(o.total_price) !== item.total) {
      throw new QueueRejected(
        `Summa o'zgargan: kassada ${formatMoney(item.total)} olingan, buyurtmada hozir ${formatMoney(o.total_price)}. Menejer tekshirsin.`,
      );
    }
    if (o.is_paid) {
      if (!samePayment(o, p)) {
        const was = o.payment_breakdown?.length ? 'aralash' : payMethodLabel(o.payment_method);
        throw new QueueRejected(`Buyurtma allaqachon boshqa usulda to'langan (${was}). Menejer hal qiladi.`);
      }
      // Bir xil to'lov allaqachon yozilgan (oldingi urinish yetib borgan) — qayta yozilmaydi
    } else {
      const pay = p.payments && p.payments.length > 1 ? { payments: p.payments } : { payment_method: p.method };
      await apiClient.post(`${base}mark-paid/`, { ...pay, is_paid: true });
    }
  } else if (!o.is_paid) {
    throw new QueueRejected("Buyurtma serverda to'lanmagan ko'rinadi — to'lovni qayta qabul qiling.");
  }
  if (!DONE_STATUSES.includes(o.status || '')) {
    const res = await apiClient.post(`${base}complete/`, p.split_count && p.split_count > 1 ? { split_count: p.split_count } : {});
    o = res.data?.data ?? o;
  }
  return o;
}

/**
 * Stol hisobi to'lovini yuborish — qayta yuborilsa ham pul bir marta sanaladi. `bill/pay` o'zi idempotent emas
 * (hamma to'langach takrori 409 NO_SESSION; ro'yxatsiz yuborilsa oflayn paytda qo'shilgan buyurtmalarni ham to'laydi),
 * shuning uchun:
 *  1) har buyurtmaning serverdagi holati olinadi;
 *  2) bekor qilingan / jami summa o'zgargan / boshqa usulda yoki qisman to'langan bo'lsa — YUBORILMAYDI, sabab kassirga;
 *  3) hammasi shu usulda to'langan bo'lsa — oldingi urinish yetib borgan (server bitta tranzaksiyada to'laydi), qayta yozilmaydi;
 *  4) hech biri to'lanmagan bo'lsa — `bill/pay` AYNAN shu `order_uuids` bilan.
 */
async function sendTableBill(item: QueuedOrder & { payment: QueuedPayment }, bill: QueuedTableBill): Promise<string[]> {
  const p = item.payment;
  if (bill.client_uuids?.length) throw new QueueRejected(t('offline.billOrderUnsent'));
  const orders: Array<{ status?: string; is_paid?: boolean; total_price?: number | string; payment_method?: string; payment_breakdown?: Array<{ method: string; amount: number | string }> }> = [];
  for (const uuid of bill.order_uuids) {
    const o = (await apiClient.get(`orders/partner-pos/${uuid}/`)).data?.data;
    if (!o) throw new QueueRejected('Buyurtma serverda topilmadi.');
    orders.push(o);
  }
  if (orders.some((o) => DEAD_STATUSES.includes(o.status || ''))) {
    throw new QueueRejected(t('offline.billCancelled', { sum: formatMoney(item.total) }));
  }
  const serverTotal = orders.reduce((s, o) => s + amount(o.total_price), 0);
  if (serverTotal !== item.total) {
    throw new QueueRejected(t('offline.billSumChanged', { paid: formatMoney(item.total), now: formatMoney(serverTotal) }));
  }
  const paid = orders.filter((o) => o.is_paid);
  if (paid.length === orders.length) {
    if (paid.every((o) => samePayment(o, p))) return bill.order_uuids; // oldingi urinish yetib borgan
    throw new QueueRejected(t('offline.billPaidOther'));
  }
  if (paid.length) throw new QueueRejected(t('offline.billPartlyPaid', { n: paid.length }));
  try {
    await apiClient.post(`partner/tables/${bill.table_uuid}/bill/pay/`, { payment_method: p.method, order_uuids: bill.order_uuids });
  } catch (err) {
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code === 'NO_SESSION' || code === 'ORDER_NOT_PAYABLE') throw new QueueRejected(t('offline.billNoSession'));
    throw err;
  }
  return bill.order_uuids;
}

/* ------------------------------------------------- yuborilgan to'lovlar (chek uchun) */

/**
 * Serverga yetgan oflayn to'lovlar: chek AVTOMATIK chiqmaydi (egasi qarori), kassir navbat oynasida «Chek»ni o'zi bosadi.
 * Xodim bo'yicha saqlanadi, 12 soatdan eskisi va 30 tadan ortig'i tashlanadi.
 */
export interface SentPayment {
  id: string;
  label: string;
  total: number;
  /** Chek chiqadigan buyurtmalar (stol hisobida — bir nechta) */
  order_uuids: string[];
  sent_at: string;
  printed?: boolean;
}

const SENT_PREFIX = 'milliygo_offline_paid:';
const SENT_TTL_MS = 12 * 60 * 60 * 1000;

export const getSentPayments = (actor: string | null = currentActor()): SentPayment[] => {
  if (!actor) return [];
  try {
    const list = JSON.parse(localStorage.getItem(SENT_PREFIX + actor) || '[]');
    return Array.isArray(list) ? (list as SentPayment[]).filter((s) => Date.now() - new Date(s.sent_at).getTime() < SENT_TTL_MS) : [];
  } catch {
    return [];
  }
};

const saveSent = (list: SentPayment[], actor: string | null = currentActor()) => {
  if (!actor) return;
  try {
    if (list.length) localStorage.setItem(SENT_PREFIX + actor, JSON.stringify(list.slice(-30)));
    else localStorage.removeItem(SENT_PREFIX + actor);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
};

export const markSentPrinted = (id: string) => saveSent(getSentPayments().map((s) => (s.id === id ? { ...s, printed: true } : s)));
export const dismissSent = (id?: string) => saveSent(id ? getSentPayments().filter((s) => s.id !== id) : []);

export function useSentPayments(): SentPayment[] {
  const [list, setList] = useState(() => getSentPayments());
  useEffect(() => {
    const sync = () => setList(getSentPayments());
    window.addEventListener(QUEUE_EVENT, sync);
    window.addEventListener(PARTNER_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(QUEUE_EVENT, sync);
      window.removeEventListener(PARTNER_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return list;
}

/** Oflayn yaratilgan buyurtma serverga yetdi: uni kutayotgan stol hisobi to'loviga server uuid si yoziladi */
const linkCreated = (q: QueuedOrder[], clientUuid: string, serverUuid: string | undefined): QueuedOrder[] =>
  serverUuid
    ? q.map((o) => {
        const pay = o.payment;
        const b = pay?.table_bill;
        if (!pay || !b?.client_uuids?.includes(clientUuid)) return o;
        const rest = b.client_uuids.filter((c) => c !== clientUuid);
        const table_bill: QueuedTableBill = { table_uuid: b.table_uuid, order_uuids: [...b.order_uuids, serverUuid] };
        if (rest.length) table_bill.client_uuids = rest;
        return { ...o, payment: { ...pay, table_bill } };
      })
    : q;

let flushing = false;

/**
 * Tablar orasidagi yagona qulf (kassa ikki oynada ochiq bo'lsa, navbat bir marta yuborilsin). Xodim bo'yicha —
 * navbat kaliti ham xodim bo'yicha. Brauzer qo'llasa Web Locks (tab yopilsa qulf o'zi bo'shaydi); bo'lmasa
 * localStorage qulfi: muddati bor va har qadamda yangilanadi, tab yopilib qolsa `FLUSH_LOCK_TTL_MS` dan keyin bo'shaydi.
 */
const FLUSH_LOCK_PREFIX = 'milliygo_offline_flush:';
const FLUSH_LOCK_TTL_MS = 30_000;
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** localStorage qulfini oladi yoki (o'ziniki bo'lsa) muddatini yangilaydi; boshqa tab ushlab turgan bo'lsa — false */
const takeStorageLock = (name: string): boolean => {
  try {
    const raw = localStorage.getItem(name);
    const cur = raw ? (JSON.parse(raw) as { owner?: string; until?: number }) : null;
    if (cur && cur.owner !== TAB_ID && (cur.until ?? 0) > Date.now()) return false;
    localStorage.setItem(name, JSON.stringify({ owner: TAB_ID, until: Date.now() + FLUSH_LOCK_TTL_MS }));
    return (JSON.parse(localStorage.getItem(name) || 'null') as { owner?: string } | null)?.owner === TAB_ID;
  } catch {
    return true; // localStorage yo'q — navbat ham yo'q, to'sadigan narsa yo'q
  }
};

const releaseStorageLock = (name: string) => {
  try {
    const raw = localStorage.getItem(name);
    if (raw && (JSON.parse(raw) as { owner?: string }).owner === TAB_ID) localStorage.removeItem(name);
  } catch {
    /* ignore */
  }
};

/** `fn` faqat qulf olinganda bajariladi; boshqa tab yuborayotgan bo'lsa — null. `renew()` false bo'lsa, qulf yo'qolgan: to'xtash kerak */
async function withFlushLock<T>(actor: string, fn: (renew: () => boolean) => Promise<T>): Promise<T | null> {
  const name = FLUSH_LOCK_PREFIX + actor;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request(name, { ifAvailable: true }, async (lock) => (lock ? fn(() => true) : null));
  }
  if (!takeStorageLock(name)) return null;
  try {
    return await fn(() => takeStorageLock(name));
  } finally {
    releaseStorageLock(name);
  }
}

/** HTTP holati (javob kelgan bo'lsa) */
const httpStatus = (err: unknown): number | undefined => (err as { response?: { status?: number } } | null)?.response?.status;

/**
 * Vaqtinchalik server xatosi (deploy, nginx, ortiqcha so'rov): yozuv «kutmoqda» qoladi va keyinroq o'zi yuboriladi.
 * 400/403/404/409 kabi biznes xatolari bunga kirmaydi — ular «hal qiling» holatiga o'tadi.
 */
export const isTransientError = (err: unknown): boolean => {
  if (err instanceof QueueRejected) return false;
  const s = httpStatus(err);
  return s !== undefined && (s >= 500 || s === 408 || s === 429);
};

/** Qayta urinish kechikishi: 20 s, 40 s, 80 s, 160 s, keyin har 5 daqiqada (OfflineSync sikli 20 s) */
export const retryDelayMs = (attempts: number): number => Math.min(20_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);

/**
 * Joriy xodim navbatini tartib bilan yuboradi. Internet yana uzilsa — to'xtaydi (keyingi safar davom etadi);
 * server rad etsa (mahsulot yo'q …) — buyurtma `error` bilan qoladi, kassir hal qiladi.
 * «Smena ochilmagan» (409 SHIFT_NOT_OPEN) — rad emas: yozuv `shift_wait` bilan kutadi (`releaseShiftWait`).
 * Yuborish paytida sessiya almashsa (PIN bilan boshqa xodim, chiqish) — darhol to'xtaydi.
 * Vaqtinchalik server xatosi (5xx, 408, 429) — yozuv «kutmoqda» qoladi, yuborish to'xtaydi (tartib buzilmasin) va
 * kechikish asta-sekin oshadi (`retry_at`); 401 — sessiya tugagan: yozuv o'zgarmaydi, shu xodim qayta kirgach yuboriladi.
 * `force` (kassir «Hozir yuborish»ni bosdi) — kechikish kutilmaydi.
 * Yuborilgan buyurtmalar ro'yxati qaytadi (oshxona printeri ularni qayta chiqarmasligi uchun).
 */
export async function flushQueue(
  opts: { force?: boolean } = {},
): Promise<{ sent: Array<{ queued: QueuedOrder; order: unknown }>; failed: number; deferred: boolean }> {
  const sent: Array<{ queued: QueuedOrder; order: unknown }> = [];
  let failed = 0;
  let deferred = false;
  const actor = currentActor();
  if (flushing || !actor) return { sent, failed, deferred };
  const now = Date.now();
  if (!opts.force && getQueue(actor).some((o) => !o.error && o.retry_at && new Date(o.retry_at).getTime() > now)) {
    return { sent, failed, deferred: true };
  }
  flushing = true;
  try {
    // Boshqa tab shu xodim navbatini yuborayotgan bo'lsa — bu tab kutmaydi va yubormaydi (natija o'sha tabda)
    await withFlushLock(actor, async (renew) => {
      // Smenani kutayotganlar avtomatik yuborilmaydi (smena ochilganda bo'shatiladi); kassir bosganda (`force`) — yuboriladi
      for (const item of getQueue(actor).filter((o) => !o.error && (opts.force || !o.shift_wait))) {
        if (currentActor() !== actor) break;
        if (!renew()) break; // qulf muddati o'tib, boshqa tabga o'tgan — u davom ettiradi
        if (item.actor && item.actor !== actor) continue; // boshqa xodimniki — bu token bilan hech qachon emas
        try {
          // Navbatdan qayta o'qiladi: oldingi qadamda yaratilgan buyurtma uuid si shu to'lovga yozilgan bo'lishi mumkin
          const fresh = getQueue(actor).find((o) => o.id === item.id);
          if (!fresh || fresh.error || (fresh.shift_wait && !opts.force)) continue; // shu orada yuborilgan, rad etilgan yoki smenani kutmoqda
          const cur = fresh;
          const bill = cur.payment?.table_bill;
          let order: unknown;
          let paidUuids: string[] = [];
          if (isPaymentItem(cur) && bill) {
            paidUuids = await sendTableBill(cur, bill);
            order = { order_uuids: paidUuids };
          } else if (isPaymentItem(cur)) {
            order = await sendPayment(cur);
            paidUuids = cur.payment.collect ? [cur.payment.order_uuid] : [];
          } else {
            order = (await apiClient.post(ENDPOINT[cur.kind], { ...cur.payload, client_uuid: cur.id })).data?.data;
          }
          const createdUuid = !isPaymentItem(cur) ? (order as { uuid?: string } | undefined)?.uuid : undefined;
          saveQueue(linkCreated(getQueue(actor).filter((o) => o.id !== cur.id), cur.id, createdUuid), actor);
          const sentList = getSentPayments(actor);
          if (paidUuids.length && !sentList.some((s) => s.id === cur.id)) {
            saveSent([...sentList, { id: cur.id, label: cur.label, total: cur.total, order_uuids: paidUuids, sent_at: new Date().toISOString() }], actor);
          }
          sent.push({ queued: cur, order });
        } catch (err) {
          if (isNetworkError(err)) break;
          if (httpStatus(err) === 401) {
            // Sessiya tugagan (client.ts kirish oynasiga o'tkazadi): yozuv o'zgarmaydi, shu xodim qayta kirgach yuboriladi
            deferred = true;
            break;
          }
          if (isTransientError(err)) {
            deferred = true;
            saveQueue(
              getQueue(actor).map((o) => {
                if (o.id !== item.id) return o;
                const attempts = (o.attempts || 0) + 1;
                return { ...o, attempts, retry_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString() };
              }),
              actor,
            );
            break;
          }
          if (isShiftNotOpen(err)) {
            // D36: smena ochilmagan — server hech narsa yozmagan. Yozuv kutadi (rad emas); qolganlari yuborilaveradi:
            // keyingi yozuvlar bunga bog'liq emas (stol hisobi faqat o'zidan OLDINgi yaratilgan buyurtmalarga bog'liq)
            const at = new Date().toISOString();
            saveQueue(getQueue(actor).map((o) => (o.id === item.id ? { ...o, shift_wait: at, retry_at: undefined, attempts: undefined } : o)), actor);
            continue;
          }
          failed += 1;
          const message =
            err instanceof QueueRejected
              ? err.message
              : getErrorMessage(err, isPaymentItem(item) ? "Server to'lovni qabul qilmadi" : 'Server buyurtmani qabul qilmadi');
          saveQueue(getQueue(actor).map((o) => (o.id === item.id ? { ...o, error: message } : o)), actor);
        }
      }
    });
  } finally {
    flushing = false;
  }
  return { sent, failed, deferred };
}
