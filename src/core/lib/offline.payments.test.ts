import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const get = vi.fn();
vi.mock('../api/client', () => ({
  default: { post: (...args: unknown[]) => post(...args), get: (...args: unknown[]) => get(...args) },
}));

import { STORAGE_KEYS } from '../config/constants';
import {
  applyQueuedPayments,
  enqueueOrder,
  enqueuePayment,
  flushQueue,
  getQueue,
  isPaymentQueued,
  othersQueuedCount,
  pendingCount,
  retryQueued,
  summarizeQueue,
  type QueuedPayment,
} from './offline';

/**
 * D5 — oflayn to'lov va yakunlash navbati. Asosiy talab: qayta yuborish pulni ikki marta sanamaydi,
 * server rad etsa to'lov jimgina yo'qolmaydi, boshqa xodim tokeni bilan yuborilmaydi.
 */

const PARTNER = 'p-1';
const login = (staff: string) =>
  localStorage.setItem(
    STORAGE_KEYS.PARTNER_DATA,
    JSON.stringify({ uuid: PARTNER, staff_uuid: staff, role: 'cashier', user_type: 'staff', current_filial: { uuid: 'f-1' } }),
  );

const ORDER = 'ord-1';
const BASE = `orders/partner-pos/${ORDER}/`;

const pay = (extra: Partial<QueuedPayment> = {}, total = 60_000) =>
  enqueuePayment({ label: '№ 12', total, payment: { order_uuid: ORDER, collect: true, method: 'CASH', ...extra } });

/** Serverdagi buyurtma holati (GET orders/partner-pos/<uuid>/) */
const server = (o: Record<string, unknown>) => ({
  data: { data: { uuid: ORDER, status: 'READY_FOR_PICKUP', is_paid: false, total_price: '60000.00', payment_method: 'CASH', payment_breakdown: [], ...o } },
});
const ok = (data: unknown = {}) => ({ data: { success: true, data } });

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status: number, message: string, code?: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { success: false, message, code } } });

const posts = (suffix: string) => post.mock.calls.filter((c) => c[0] === `${BASE}${suffix}`);

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  get.mockReset();
});

describe("oflayn to'lov: navbatga yozish", () => {
  it("bitta buyurtmaga bitta to'lov — ikkinchisi yozilmaydi", () => {
    login('A');
    expect(pay()).toBe(true);
    expect(pay({ method: 'CARD' })).toBe(false);
    expect(getQueue()).toHaveLength(1);
    expect(isPaymentQueued(ORDER)).toBe(true);
    expect(summarizeQueue(getQueue())).toEqual({ payments: 1, orders: 0, pending: 1, rejected: 0 });
  });

  it("tizimga kirilmagan bo'lsa — xato (to'lov jimgina yo'qolmaydi)", () => {
    expect(() => pay()).toThrow();
  });

  it("ro'yxat yangilanganda navbatdagi to'lov ustiga qo'yiladi (to'lanmagan bo'lib qaytmaydi)", () => {
    login('A');
    pay();
    const [o, other] = applyQueuedPayments([
      { uuid: ORDER, status: 'READY_FOR_PICKUP', is_paid: false },
      { uuid: 'x', status: 'ACCEPTED', is_paid: false },
    ]);
    expect(o).toMatchObject({ status: 'DELIVERED', is_paid: true, payment_method: 'CASH' });
    expect(other).toMatchObject({ status: 'ACCEPTED', is_paid: false });
  });
});

describe("oflayn to'lov: yuborish", () => {
  it("internet qaytdi: mark-paid → complete, navbat bo'shaydi", async () => {
    login('A');
    pay({ split_count: 3 });
    get.mockResolvedValueOnce(server({}));
    post.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({ uuid: ORDER, status: 'DELIVERED' }));
    const res = await flushQueue();
    expect(res.sent).toHaveLength(1);
    expect(posts('mark-paid/')[0][1]).toEqual({ payment_method: 'CASH', is_paid: true });
    // complete — to'lov maydonlarisiz (to'lov mark-paid'da yozilgan), faqat hisob bo'linishi
    expect(posts('complete/')[0][1]).toEqual({ split_count: 3 });
    expect(getQueue()).toHaveLength(0);
  });

  it('internet hali yo\'q (GET ham yetmadi) — hech narsa yuborilmaydi, navbatda xatosiz qoladi', async () => {
    login('A');
    pay();
    get.mockRejectedValueOnce(networkError());
    const res = await flushQueue();
    expect(res).toEqual({ sent: [], failed: 0, deferred: false });
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toBeUndefined();
    expect(pendingCount()).toBe(1);
  });

  it("ikki marta yuborish: javob yo'qolgan bo'lsa ham pul bir marta yoziladi", async () => {
    login('A');
    pay();
    // 1-urinish: mark-paid yetib bordi, complete paytida internet uzildi (server bajarganmi — noma'lum)
    get.mockResolvedValueOnce(server({}));
    post.mockResolvedValueOnce(ok()).mockRejectedValueOnce(networkError());
    expect((await flushQueue()).sent).toHaveLength(0);
    expect(getQueue()).toHaveLength(1);

    // 2-urinish: server buyurtmani to'langan va yakunlangan ko'rsatadi — hech narsa qayta yuborilmaydi
    get.mockResolvedValueOnce(server({ status: 'DELIVERED', is_paid: true }));
    expect((await flushQueue()).sent).toHaveLength(1);
    expect(posts('mark-paid/')).toHaveLength(1);
    expect(posts('complete/')).toHaveLength(1);
    expect(getQueue()).toHaveLength(0);
  });

  it("to'langan-u yakunlanmagan bo'lsa — faqat complete (mark-paid qayta yuborilmaydi)", async () => {
    login('A');
    pay();
    get.mockResolvedValueOnce(server({ is_paid: true }));
    post.mockResolvedValueOnce(ok());
    await flushQueue();
    expect(posts('mark-paid/')).toHaveLength(0);
    expect(posts('complete/')).toHaveLength(1);
  });

  it("aralash to'lov qismlar bilan yuboriladi; serverda xuddi shu taqsimot bo'lsa — takror yozilmaydi", async () => {
    login('A');
    const payments = [
      { method: 'CASH', amount: 40_000 },
      { method: 'CARD', amount: 20_000 },
    ];
    pay({ payments });
    get.mockResolvedValueOnce(server({}));
    post.mockResolvedValueOnce(ok()).mockRejectedValueOnce(networkError());
    await flushQueue();
    expect(posts('mark-paid/')[0][1]).toEqual({ payments, is_paid: true });

    get.mockResolvedValueOnce(
      server({ is_paid: true, payment_breakdown: [{ method: 'CARD', amount: '20000.00' }, { method: 'CASH', amount: '40000.00' }] }),
    );
    post.mockResolvedValueOnce(ok());
    expect((await flushQueue()).sent).toHaveLength(1);
    expect(posts('mark-paid/')).toHaveLength(1);
  });

  it("yakunlash (oldin to'langan): faqat complete", async () => {
    login('A');
    enqueuePayment({ label: '№ 3', total: 60_000, payment: { order_uuid: ORDER, collect: false, method: 'CARD' } });
    get.mockResolvedValueOnce(server({ is_paid: true, payment_method: 'CARD' }));
    post.mockResolvedValueOnce(ok());
    await flushQueue();
    expect(posts('mark-paid/')).toHaveLength(0);
    expect(posts('complete/')[0][1]).toEqual({});
  });
});

describe("oflayn to'lov: rad etish (to'lov jimgina yo'qolmaydi)", () => {
  it('server 403 (usulni faqat menejer o\'zgartiradi) — xato bilan qoladi, o\'zi qayta yuborilmaydi; «Qayta urinish» ishlaydi', async () => {
    login('A');
    pay();
    get.mockResolvedValueOnce(server({}));
    post.mockRejectedValueOnce(httpError(403, "To'lovni faqat menejer o'zgartiradi", 'PAYMENT_CHANGE_MANAGER_ONLY'));
    const res = await flushQueue();
    expect(res.failed).toBe(1);
    expect(getQueue()[0].error).toBeTruthy();
    expect(summarizeQueue(getQueue())).toMatchObject({ pending: 0, rejected: 1 });

    post.mockClear();
    get.mockClear();
    await flushQueue();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    // rad etilgan to'lov ham navbatda — kassa shu buyurtmadan qayta to'lov olmaydi
    expect(isPaymentQueued(ORDER)).toBe(true);

    retryQueued(`pay:${ORDER}`);
    get.mockResolvedValueOnce(server({}));
    post.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
    expect((await flushQueue()).sent).toHaveLength(1);
    expect(getQueue()).toHaveLength(0);
  });

  it('server 409 (complete) — xato bilan qoladi', async () => {
    login('A');
    pay();
    get.mockResolvedValueOnce(server({}));
    post.mockResolvedValueOnce(ok()).mockRejectedValueOnce(httpError(409, 'Kuryer buyurtmani olgan', 'HANDED_TO_COURIER'));
    const res = await flushQueue();
    expect(res.failed).toBe(1);
    expect(getQueue()[0].error).toBeTruthy();
  });

  it("serverda boshqa usulda to'langan — hech narsa yuborilmaydi, sabab ko'rsatiladi", async () => {
    login('A');
    pay();
    get.mockResolvedValueOnce(server({ is_paid: true, payment_method: 'CARD' }));
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/boshqa usulda/);
  });

  it("summa o'zgargan (oflayn paytda taom qo'shilgan) — to'lov yozilmaydi", async () => {
    login('A');
    pay();
    get.mockResolvedValueOnce(server({ total_price: '75000.00' }));
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/Summa o'zgargan/);
  });

  it("buyurtma bekor qilingan — to'lov yozilmaydi, pulni qaytarish so'raladi", async () => {
    login('A');
    pay();
    get.mockResolvedValueOnce(server({ status: 'CANCELLED' }));
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/bekor qilingan/);
  });
});

describe("oflayn to'lov: sessiya almashuvi", () => {
  it("A ning to'lovi B tokeni bilan yuborilmaydi, lekin B ham shu buyurtmadan qayta to'lov ololmaydi", async () => {
    login('A');
    pay();
    login('B');
    expect(getQueue()).toHaveLength(0);
    expect(isPaymentQueued(ORDER)).toBe(true);
    expect(pay({ method: 'CARD' })).toBe(false);
    expect(othersQueuedCount()).toBe(1);
    await flushQueue();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();

    login('A');
    get.mockResolvedValueOnce(server({}));
    post.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
    expect((await flushQueue()).sent).toHaveLength(1);
  });

  it('yuborish paytida sessiya almashsa — keyingi yozuvlar yangi token bilan ketmaydi', async () => {
    login('A');
    enqueueOrder({ id: 'o-1', kind: 'PICKUP', payload: { items: [] }, label: 'o-1', total: 1 });
    pay();
    post.mockImplementationOnce(async () => {
      login('B');
      return ok({ uuid: 'srv-1' });
    });
    const res = await flushQueue();
    expect(res.sent.map((s) => s.queued.id)).toEqual(['o-1']);
    expect(get).not.toHaveBeenCalled();
    login('A');
    expect(getQueue().map((o) => o.id)).toEqual([`pay:${ORDER}`]);
  });

  it("navbat tartibi saqlanadi: oldingi buyurtmada internet uzilsa, to'lov ham kutadi", async () => {
    login('A');
    enqueueOrder({ id: 'o-1', kind: 'PICKUP', payload: { items: [] }, label: 'o-1', total: 1 });
    pay();
    post.mockRejectedValueOnce(networkError());
    await flushQueue();
    expect(get).not.toHaveBeenCalled();
    expect(summarizeQueue(getQueue())).toEqual({ payments: 1, orders: 1, pending: 2, rejected: 0 });
  });
});
