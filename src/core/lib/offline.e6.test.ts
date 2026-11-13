import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const get = vi.fn();
vi.mock('../api/client', () => ({
  default: { post: (...args: unknown[]) => post(...args), get: (...args: unknown[]) => get(...args) },
}));

import { STORAGE_KEYS } from '../config/constants';

/**
 * E6 (QA) — D5 oflayn to'lov navbatining chekka holatlari (brauzersiz, vitest + jsdom localStorage).
 * `it.fails` — xato tasdiqlangan: test talabni yozadi, hozirgi kod uni bajarmaydi. Tuzatilgach `it` ga qaytaring.
 */

const PARTNER = 'p-1';
const ORDER = 'ord-1';
const BASE = `orders/partner-pos/${ORDER}/`;

const login = (staff: string) =>
  localStorage.setItem(
    STORAGE_KEYS.PARTNER_DATA,
    JSON.stringify({ uuid: PARTNER, staff_uuid: staff, role: 'cashier', user_type: 'staff', current_filial: { uuid: 'f-1' } }),
  );

const server = (o: Record<string, unknown> = {}) => ({
  data: { data: { uuid: ORDER, status: 'READY_FOR_PICKUP', is_paid: false, total_price: '60000.00', payment_method: 'CASH', payment_breakdown: [], ...o } },
});
const ok = (data: unknown = {}) => ({ data: { success: true, data } });
const httpError = (status: number, message: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { success: false, message } } });
const posts = (suffix: string) => post.mock.calls.filter((c) => c[0] === `${BASE}${suffix}`);

/** Har chaqiruvda modulning YANGI nusxasi — brauzerning alohida oynasi (o'z `flushing` bayrog'i, umumiy localStorage) */
const freshTab = async () => {
  vi.resetModules();
  return import('./offline');
};

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  get.mockReset();
});

describe('E6/D5: ikki oyna (kassa ikki tabda ochiq)', () => {
  it('talab: bir to\'lov bir marta yuboriladi va chek ro\'yxatida bir marta turadi', async () => {
    login('A');
    const tab1 = await freshTab();
    const tab2 = await freshTab();
    tab1.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockResolvedValue(server());
    post.mockResolvedValue(ok({ uuid: ORDER, status: 'DELIVERED' }));
    await Promise.all([tab1.flushQueue(), tab2.flushQueue()]);
    expect(posts('mark-paid/')).toHaveLength(1);
    expect(posts('complete/')).toHaveLength(1);
    expect(tab1.getSentPayments()).toHaveLength(1);
    // Qulf bo'shatilgan — keyingi yuborish to'silmaydi
    expect(localStorage.getItem('milliygo_offline_flush:p-1:A')).toBeNull();
  });

  it('yopilib qolgan tabning qulfi muddati o\'tgach to\'smaydi; amaldagi qulf to\'sadi', async () => {
    login('A');
    const tab = await freshTab();
    tab.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockResolvedValue(server());
    post.mockResolvedValue(ok({ uuid: ORDER, status: 'DELIVERED' }));
    // Boshqa tab hozir yubormoqda — bu tab kutib turadi
    localStorage.setItem('milliygo_offline_flush:p-1:A', JSON.stringify({ owner: 'other-tab', until: Date.now() + 10_000 }));
    expect((await tab.flushQueue()).sent).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
    // Boshqa xodimning qulfi to'smaydi
    localStorage.setItem('milliygo_offline_flush:p-1:A', JSON.stringify({ owner: 'other-tab', until: Date.now() - 1 }));
    localStorage.setItem('milliygo_offline_flush:p-1:B', JSON.stringify({ owner: 'other-tab', until: Date.now() + 10_000 }));
    expect((await tab.flushQueue()).sent).toHaveLength(1);
    expect(posts('mark-paid/')).toHaveLength(1);
  });

  it('Web Locks bor bo\'lsa — o\'sha ishlatiladi (ifAvailable, xodim bo\'yicha nom)', async () => {
    const held = new Set<string>();
    const request = vi.fn(async (name: string, _opts: unknown, cb: (lock: unknown) => Promise<unknown>) => {
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        return await cb({ name });
      } finally {
        held.delete(name);
      }
    });
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      login('A');
      const tab1 = await freshTab();
      const tab2 = await freshTab();
      tab1.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
      get.mockResolvedValue(server());
      post.mockResolvedValue(ok({ uuid: ORDER, status: 'DELIVERED' }));
      await Promise.all([tab1.flushQueue(), tab2.flushQueue()]);
      expect(request).toHaveBeenCalledWith('milliygo_offline_flush:p-1:A', { ifAvailable: true }, expect.any(Function));
      expect(posts('mark-paid/')).toHaveLength(1);
      expect(tab1.getSentPayments()).toHaveLength(1);
      expect(localStorage.getItem('milliygo_offline_flush:p-1:A')).toBeNull();
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });
});

describe('E6/D5: vaqtinchalik server xatosi', () => {
  it("502/503 (deploy, nginx) — to'lov «rad etilgan» bo'lib qolmasin, o'zi qayta yuborilsin", async () => {
    login('A');
    const off = await freshTab();
    off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockRejectedValueOnce(httpError(502, 'Bad Gateway'));
    const res = await off.flushQueue();
    expect(res).toMatchObject({ failed: 0, deferred: true });
    expect(off.getQueue()[0].error).toBeUndefined();
    expect(off.pendingCount()).toBe(1);
    // ShiftPage smena yopishni bloklaydi (pending > 0)
    expect(off.summarizeQueue(off.getQueue()).pending).toBe(1);
  });

  it('vaqtinchalik xatodan keyin kechikish kutiladi, keyin o\'zi yuboriladi; kechikish asta-sekin oshadi', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
      login('A');
      const off = await freshTab();
      off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
      get.mockRejectedValueOnce(httpError(503, 'Service Unavailable'));
      await off.flushQueue();
      expect(off.getQueue()[0].attempts).toBe(1);
      // Kechikish ichida — server so'ralmaydi
      get.mockClear();
      expect(await off.flushQueue()).toMatchObject({ deferred: true, sent: [] });
      expect(get).not.toHaveBeenCalled();
      // Ikkinchi xato — kechikish ikki baravar
      vi.setSystemTime(new Date('2026-11-10T10:00:21Z'));
      get.mockRejectedValueOnce(httpError(500, 'Server Error'));
      await off.flushQueue();
      const q = off.getQueue()[0];
      expect(q.attempts).toBe(2);
      expect(new Date(q.retry_at!).getTime() - Date.now()).toBe(40_000);
      // Kechikish o'tdi — yuboriladi
      vi.setSystemTime(new Date('2026-11-10T10:01:05Z'));
      get.mockResolvedValue(server());
      post.mockResolvedValue(ok({ uuid: ORDER, status: 'DELIVERED' }));
      const res = await off.flushQueue();
      expect(res.sent).toHaveLength(1);
      expect(posts('mark-paid/')).toHaveLength(1);
      expect(off.getQueue()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kechikish 5 daqiqadan oshmaydi; «Hozir yuborish» (force) kechikishni kutmaydi', async () => {
    const off = await freshTab();
    expect([1, 2, 3, 4, 5, 9].map(off.retryDelayMs)).toEqual([20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    login('A');
    off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockRejectedValueOnce(httpError(429, 'Too Many Requests'));
    await off.flushQueue();
    expect(off.pendingCount()).toBe(1);
    get.mockResolvedValue(server());
    post.mockResolvedValue(ok({ uuid: ORDER, status: 'DELIVERED' }));
    expect((await off.flushQueue({ force: true })).sent).toHaveLength(1);
  });

  it("401 (sessiya tugagan) — yozuv o'zgarmaydi va «kutmoqda» qoladi, keyingilar yuborilmaydi", async () => {
    login('A');
    const off = await freshTab();
    off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    off.enqueuePayment({ label: '№ 13', total: 10_000, payment: { order_uuid: 'ord-2', collect: true, method: 'CASH' } });
    get.mockRejectedValueOnce(httpError(401, 'Token expired'));
    const res = await off.flushQueue();
    expect(res).toMatchObject({ failed: 0, deferred: true });
    expect(get).toHaveBeenCalledTimes(1);
    expect(off.getQueue().every((o) => !o.error && !o.retry_at)).toBe(true);
    expect(off.pendingCount()).toBe(2);
  });

  it.each([400, 403, 404, 409])('%i (biznes xatosi) — avvalgidek «hal qiling» holatiga o\'tadi', async (status) => {
    login('A');
    const off = await freshTab();
    off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(httpError(status, 'Smena yopiq'));
    const res = await off.flushQueue();
    expect(res.failed).toBe(1);
    expect(off.getQueue()[0].error).toBe('Smena yopiq');
    expect(off.pendingCount()).toBe(0);
  });
});

describe('E6/D5: boshqa qurilmada ham pul olingan', () => {
  it("fakt: serverda xuddi shu usulda to'langan bo'lsa — jim «yuborildi», kassirga ogohlantirish yo'q", async () => {
    // A (oflayn) naqd oldi. Shu orada B boshqa kompyuterdan (onlayn) shu buyurtmadan yana naqd oldi.
    login('A');
    const off = await freshTab();
    off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockResolvedValueOnce(server({ is_paid: true, status: 'DELIVERED' }));
    const res = await off.flushQueue();
    expect(res).toMatchObject({ failed: 0 });
    expect(res.sent).toHaveLength(1);
    expect(post).not.toHaveBeenCalled();
    expect(off.getQueue()).toHaveLength(0); // kassada ortiqcha 60 000 — tizim buni ko'rsatmaydi
  });
});

describe('E6/D5: tekshirilgan, OK', () => {
  it("bir oynada ikki marta «Hozir yuborish» (parallel) — bitta yuborish", async () => {
    login('A');
    const off = await freshTab();
    off.enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } });
    get.mockResolvedValue(server());
    post.mockResolvedValue(ok({ uuid: ORDER, status: 'DELIVERED' }));
    await Promise.all([off.flushQueue(), off.flushQueue()]);
    expect(posts('mark-paid/')).toHaveLength(1);
  });

  it("aralash to'lovda qismlar jami server summasidan farq qilsa ham summa tekshiruvi buyurtma summasi bo'yicha", async () => {
    login('A');
    const off = await freshTab();
    off.enqueuePayment({
      label: '№ 12',
      total: 60_000,
      payment: { order_uuid: ORDER, collect: true, method: 'CARD', payments: [{ method: 'CASH', amount: 20_000 }, { method: 'CARD', amount: 40_000 }] },
    });
    get.mockResolvedValueOnce(server({ total_price: '65000.00' }));
    await off.flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(off.getQueue()[0].error).toMatch(/Summa o'zgargan/);
  });
});
