import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const get = vi.fn();
vi.mock('../api/client', () => ({
  default: { post: (...args: unknown[]) => post(...args), get: (...args: unknown[]) => get(...args) },
}));

import { STORAGE_KEYS } from '../config/constants';
import {
  applyQueuedPayments,
  dismissSent,
  enqueueOrder,
  enqueuePayment,
  enqueueTablePayment,
  flushQueue,
  getQueue,
  getSentPayments,
  isPaymentQueued,
  markSentPrinted,
  queuedTableOrders,
  retryQueued,
  summarizeQueue,
} from './offline';

/**
 * D12 — oflayn stol hisobi to'lovi (`bill/pay`). Server `bill/pay` idempotent emas (takrori 409 NO_SESSION,
 * ro'yxatsiz yuborilsa yangi qo'shilganlarni ham to'laydi) — shuning uchun navbat avval har buyurtma holatini tekshiradi.
 */

const login = (staff = 'A') =>
  localStorage.setItem(
    STORAGE_KEYS.PARTNER_DATA,
    JSON.stringify({ uuid: 'p-1', staff_uuid: staff, role: 'cashier', user_type: 'staff', current_filial: { uuid: 'f-1' } }),
  );

const TABLE = 't-1';
const BILL_PAY = `partner/tables/${TABLE}/bill/pay/`;

const billPay = (extra: Partial<Parameters<typeof enqueueTablePayment>[0]> = {}) =>
  enqueueTablePayment({ table_uuid: TABLE, order_uuids: ['o-1', 'o-2'], method: 'CASH', label: '5-stol · Stol hisobi', total: 100_000, ...extra });

/** GET orders/partner-pos/<uuid>/ — har buyurtma uchun alohida javob */
const serverOrders = (orders: Record<string, Record<string, unknown>>) =>
  get.mockImplementation(async (url: string) => {
    const uuid = url.split('/')[2];
    const o = orders[uuid];
    if (!o) throw Object.assign(new Error('404'), { response: { status: 404, data: { message: 'Topilmadi' } } });
    return { data: { data: { uuid, status: 'PREPARING', is_paid: false, payment_method: 'CASH', payment_breakdown: [], ...o } } };
  });

const ok = (data: unknown = {}) => ({ data: { success: true, data } });
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status: number, message: string, code?: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { success: false, message, code } } });
const billPosts = () => post.mock.calls.filter((c) => c[0] === BILL_PAY);

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  get.mockReset();
});

describe('stol hisobi: navbatga yozish', () => {
  it("bitta to'lov yozuvi; shu buyurtmalardan qayta to'lov olinmaydi", () => {
    login();
    expect(billPay()).toBe(true);
    expect(isPaymentQueued('o-1')).toBe(true);
    expect(isPaymentQueued('o-2')).toBe(true);
    expect(billPay({ order_uuids: ['o-2'] })).toBe(false);
    // bitta buyurtma to'lovi ham (TableOrderModal / buyurtmalar navbati) bloklanadi
    expect(enqueuePayment({ label: 'x', total: 50_000, payment: { order_uuid: 'o-1', collect: true, method: 'CARD' } })).toBe(false);
    expect(summarizeQueue(getQueue())).toEqual({ payments: 1, orders: 0, pending: 1, rejected: 0 });
  });

  it("ro'yxatda to'langan ko'rinadi, lekin yakunlanmaydi (bill/pay ham yakunlamaydi)", () => {
    login();
    billPay();
    const [a, other] = applyQueuedPayments([
      { uuid: 'o-1', status: 'PREPARING', is_paid: false },
      { uuid: 'o-9', status: 'PREPARING', is_paid: false },
    ]);
    expect(a).toMatchObject({ status: 'PREPARING', is_paid: true, payment_method: 'CASH' });
    expect(other).toMatchObject({ is_paid: false });
  });
});

describe('stol hisobi: yuborish', () => {
  it("hech biri to'lanmagan — bill/pay aynan shu buyurtmalar va bitta usul bilan; chek o'zi chiqmaydi, ro'yxatga yoziladi", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: '60000.00' }, 'o-2': { total_price: '40000.00' } });
    post.mockResolvedValueOnce(ok());
    const res = await flushQueue();
    expect(res.sent).toHaveLength(1);
    expect(billPosts()[0][1]).toEqual({ payment_method: 'CASH', order_uuids: ['o-1', 'o-2'] });
    expect(getQueue()).toHaveLength(0);
    expect(getSentPayments()).toMatchObject([{ order_uuids: ['o-1', 'o-2'], total: 100_000 }]);
  });

  it("javob yo'qolgan: 2-urinishda hammasi shu usulda to'langan — bill/pay qayta yuborilmaydi (pul bir marta)", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 60_000 }, 'o-2': { total_price: 40_000 } });
    post.mockRejectedValueOnce(networkError());
    expect((await flushQueue()).sent).toHaveLength(0);
    expect(getQueue()[0].error).toBeUndefined();

    serverOrders({ 'o-1': { total_price: 60_000, is_paid: true }, 'o-2': { total_price: 40_000, is_paid: true } });
    expect((await flushQueue()).sent).toHaveLength(1);
    expect(billPosts()).toHaveLength(1);
    expect(getQueue()).toHaveLength(0);
  });

  it("internet hali yo'q (GET yetmadi) — hech narsa yuborilmaydi, navbatda xatosiz qoladi", async () => {
    login();
    billPay();
    get.mockRejectedValue(networkError());
    expect(await flushQueue()).toEqual({ sent: [], failed: 0, deferred: false });
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toBeUndefined();
  });
});

describe("stol hisobi: rad etish (yozilmaydi, sabab kassirga)", () => {
  it("summa o'zgargan", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 75_000 }, 'o-2': { total_price: 40_000 } });
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/Summa o'zgargan/);
  });

  it("boshqa usulda to'langan", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 60_000, is_paid: true, payment_method: 'CARD' }, 'o-2': { total_price: 40_000, is_paid: true, payment_method: 'CARD' } });
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/boshqa usulda/);
  });

  it("qisman boshqa joyda to'langan (server bitta tranzaksiyada to'laydi — bu bizning urinish emas)", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 60_000, is_paid: true }, 'o-2': { total_price: 40_000 } });
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/bir qismi/);
  });

  it('buyurtma bekor qilingan', async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 60_000, status: 'CANCELLED' }, 'o-2': { total_price: 40_000 } });
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
    expect(getQueue()[0].error).toMatch(/bekor qilingan/);
  });

  it("409 NO_SESSION (stol ko'chirilgan) — xato bilan qoladi, o'zi qayta yuborilmaydi; «Qayta urinish» ishlaydi", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 60_000 }, 'o-2': { total_price: 40_000 } });
    post.mockRejectedValueOnce(httpError(409, "Bu stolda ochiq hisob yo'q.", 'NO_SESSION'));
    expect((await flushQueue()).failed).toBe(1);
    expect(getQueue()[0].error).toMatch(/ko'chirilgan/);
    expect(isPaymentQueued('o-1')).toBe(true);

    post.mockClear();
    await flushQueue();
    expect(post).not.toHaveBeenCalled();

    retryQueued(getQueue()[0].id);
    post.mockResolvedValueOnce(ok());
    expect((await flushQueue()).sent).toHaveLength(1);
  });

  it("403 (ofitsiant / usul o'chirilgan) — xato bilan qoladi", async () => {
    login();
    billPay();
    serverOrders({ 'o-1': { total_price: 60_000 }, 'o-2': { total_price: 40_000 } });
    post.mockRejectedValueOnce(httpError(403, "To'lovni ofitsiant qabul qilmaydi"));
    expect((await flushQueue()).failed).toBe(1);
    expect(getQueue()[0].error).toBeTruthy();
  });
});

describe('internetsiz ochilib internetsiz to\'langan stol buyurtmasi', () => {
  const offlineOrder = (id: string) =>
    enqueueOrder({ id, kind: 'DINE_IN', payload: { table: TABLE, items: [] }, label: '5-stol', total: 30_000 });

  it("stol oynasida ko'rinadi; yaratilgach server uuid si to'lovga yoziladi va birga to'lanadi", async () => {
    login();
    offlineOrder('c-1');
    expect(queuedTableOrders(TABLE).map((o) => o.id)).toEqual(['c-1']);
    expect(billPay({ order_uuids: ['o-1'], client_uuids: ['c-1'], total: 90_000 })).toBe(true);
    expect(isPaymentQueued('c-1')).toBe(true);

    post.mockImplementation(async (url: string) => (url === BILL_PAY ? ok() : ok({ uuid: 'srv-9' })));
    serverOrders({ 'o-1': { total_price: 60_000 }, 'srv-9': { total_price: 30_000 } });
    const res = await flushQueue();
    expect(res.sent).toHaveLength(2);
    expect(billPosts()[0][1]).toEqual({ payment_method: 'CASH', order_uuids: ['o-1', 'srv-9'] });
    expect(getSentPayments()[0].order_uuids).toEqual(['o-1', 'srv-9']);
  });

  it("buyurtma rad etilsa — to'lov yuborilmaydi, sabab ko'rsatiladi", async () => {
    login();
    offlineOrder('c-1');
    billPay({ order_uuids: [], client_uuids: ['c-1'], total: 30_000 });
    post.mockRejectedValueOnce(httpError(400, 'Smena yopiq'));
    const res = await flushQueue();
    expect(res.failed).toBe(2);
    expect(billPosts()).toHaveLength(0);
    expect(getQueue()[1].error).toMatch(/serverga yetmagan/);
  });

  it("buyurtma yaratildi, to'lov paytida internet uzildi — keyingi safar server uuid si bilan davom etadi", async () => {
    login();
    offlineOrder('c-1');
    billPay({ order_uuids: [], client_uuids: ['c-1'], total: 30_000 });
    post.mockResolvedValueOnce(ok({ uuid: 'srv-9' }));
    get.mockRejectedValueOnce(networkError());
    await flushQueue();
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].payment?.table_bill).toEqual({ table_uuid: TABLE, order_uuids: ['srv-9'] });
    expect(isPaymentQueued('srv-9')).toBe(true);
  });
});

describe("yuborilgan to'lovlar ro'yxati (chek kassir bosganda)", () => {
  it("bitta buyurtma to'lovi ham yoziladi; chek belgisi va ro'yxatdan olish", async () => {
    login();
    enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: 'o-5', collect: true, method: 'CASH' } });
    get.mockResolvedValueOnce({ data: { data: { uuid: 'o-5', status: 'READY_FOR_PICKUP', is_paid: false, total_price: 60_000 } } });
    post.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
    await flushQueue();
    const [s] = getSentPayments();
    expect(s).toMatchObject({ order_uuids: ['o-5'], label: '№ 12' });
    markSentPrinted(s.id);
    expect(getSentPayments()[0].printed).toBe(true);
    dismissSent(s.id);
    expect(getSentPayments()).toHaveLength(0);
  });

  it("faqat yakunlash (pul olinmagan) — chek ro'yxatiga yozilmaydi; boshqa xodim ko'rmaydi", async () => {
    login('A');
    enqueuePayment({ label: '№ 3', total: 60_000, payment: { order_uuid: 'o-6', collect: false, method: 'CARD' } });
    get.mockResolvedValueOnce({ data: { data: { uuid: 'o-6', status: 'READY_FOR_PICKUP', is_paid: true, total_price: 60_000, payment_method: 'CARD' } } });
    post.mockResolvedValueOnce(ok());
    await flushQueue();
    expect(getSentPayments()).toHaveLength(0);

    billPay();
    serverOrders({ 'o-1': { total_price: 60_000 }, 'o-2': { total_price: 40_000 } });
    post.mockResolvedValueOnce(ok());
    await flushQueue();
    expect(getSentPayments()).toHaveLength(1);
    login('B');
    expect(getSentPayments()).toHaveLength(0);
  });
});
