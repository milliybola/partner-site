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
  enqueueTablePayment,
  flushQueue,
  getQueue,
  isPaymentQueued,
  isShiftWaiting,
  pendingCount,
  releaseShiftWait,
  retryQueued,
  shiftWaitCount,
} from './offline';
import { getErrorMessage, isShiftNotOpen } from './errors';
import { promptShiftNotOpen } from '../components/useShiftNotOpenPrompt';
import { t } from '../i18n';

/**
 * D36 (A31): smena ochilmagan bo'lsa server kassa to'lovini (mark-paid, complete, bill/pay) 409 SHIFT_NOT_OPEN bilan
 * rad etadi. Onlaynda — kassirga aniq xabar va «Smenani ochish»; oflayn navbatda — yozuv rad etilmaydi, smena ochilguncha
 * kutadi va keyin yuboriladi. Pul ikki marta sanalmaydi, tartib (D18/D19) buzilmaydi.
 */

const login = (staff = 'A', filial = 'f-1') =>
  localStorage.setItem(
    STORAGE_KEYS.PARTNER_DATA,
    JSON.stringify({ uuid: 'p-1', staff_uuid: staff, role: 'cashier', user_type: 'staff', current_filial: { uuid: filial } }),
  );

const ORDER = 'ord-1';
const BASE = `orders/partner-pos/${ORDER}/`;
const TABLE = 't-1';
const BILL_PAY = `partner/tables/${TABLE}/bill/pay/`;

const pay = (order = ORDER, total = 60_000) =>
  enqueuePayment({ label: '№ 12', total, payment: { order_uuid: order, collect: true, method: 'CASH' } });

const server = (o: Record<string, unknown> = {}) => ({
  data: { data: { uuid: ORDER, status: 'READY_FOR_PICKUP', is_paid: false, total_price: '60000.00', payment_method: 'CASH', payment_breakdown: [], ...o } },
});
const ok = (data: unknown = {}) => ({ data: { success: true, data } });
const shiftNotOpen = () =>
  Object.assign(new Error('Request failed with status code 409'), {
    response: { status: 409, data: { success: false, code: 'SHIFT_NOT_OPEN', message: 'Avval smenani oching.' } },
  });
const posts = (url: string) => post.mock.calls.filter((c) => c[0] === url);

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  get.mockReset();
});

describe('SHIFT_NOT_OPEN — onlayn', () => {
  it('xato kodi taniladi va matn aniq: «Avval smenani oching»', () => {
    const err = shiftNotOpen();
    expect(isShiftNotOpen(err)).toBe(true);
    expect(getErrorMessage(err, 'x')).toBe(t('err.shiftNotOpen'));
    expect(getErrorMessage(err, 'x')).toMatch(/^Avval smenani oching/);
    expect(isShiftNotOpen(Object.assign(new Error('x'), { response: { status: 409, data: { code: 'NO_SESSION' } } }))).toBe(false);
  });

  it("kassirga «Smenani ochish» taklif qilinadi; bossa — smena sahifasi", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const go = vi.fn();
    expect(promptShiftNotOpen(shiftNotOpen(), confirm, go)).toBe(true);
    expect(confirm).toHaveBeenCalledWith(t('shiftGate.msg'), expect.objectContaining({ title: t('shiftGate.title'), confirmText: t('shiftGate.open') }));
    await Promise.resolve();
    await Promise.resolve();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("«Keyinroq» — smena sahifasiga o'tmaydi; boshqa xato — bu yerda ushlanmaydi", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const go = vi.fn();
    expect(promptShiftNotOpen(shiftNotOpen(), confirm, go)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(go).not.toHaveBeenCalled();
    const other = Object.assign(new Error('x'), { response: { status: 400, data: { code: 'ORDER_PAID' } } });
    expect(promptShiftNotOpen(other, confirm, go)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe('SHIFT_NOT_OPEN — oflayn navbat', () => {
  it("to'lov rad etilmaydi: «smenani kutmoqda» holatida qoladi, xato emas, pul yo'qolmaydi", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    const r = await flushQueue();
    expect(r).toMatchObject({ failed: 0 });
    const [item] = getQueue();
    expect(item.error).toBeUndefined();
    expect(isShiftWaiting(item)).toBe(true);
    expect(shiftWaitCount(getQueue())).toBe(1);
    // Hali yuborilmagan: chiqishda ogohlantiriladi, qayta to'lov olinmaydi, ro'yxatda to'langan ko'rinadi
    expect(pendingCount()).toBe(1);
    expect(isPaymentQueued(ORDER)).toBe(true);
    expect(applyQueuedPayments([{ uuid: ORDER, status: 'READY_FOR_PICKUP', is_paid: false }])[0]).toMatchObject({ is_paid: true });
  });

  it("kutayotgan yozuv avtomatik qayta yuborilmaydi (har 20 s so'rov yo'q)", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    await flushQueue();
    get.mockClear();
    post.mockClear();
    const r = await flushQueue();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(r.sent).toHaveLength(0);
    expect(getQueue()).toHaveLength(1);
  });

  it("smena ochilgach o'zi ketadi: mark-paid → complete, bir marta", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    await flushQueue();

    expect(releaseShiftWait('f-1')).toBe(1);
    get.mockResolvedValueOnce(server());
    post.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({ status: 'DELIVERED', is_paid: true }));
    const r = await flushQueue();
    expect(r.sent).toHaveLength(1);
    expect(posts(`${BASE}mark-paid/`)).toHaveLength(2); // 1-urinish (rad) + 2-urinish
    expect(posts(`${BASE}complete/`)).toHaveLength(1);
    expect(getQueue()).toHaveLength(0);
  });

  it("boshqa filial smenasi ochilsa — bu filial yozuvi kutishda qoladi", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    await flushQueue();
    expect(releaseShiftWait('f-2')).toBe(0);
    expect(isShiftWaiting(getQueue()[0])).toBe(true);
  });

  it("«Qayta urinish» kutishni olib tashlaydi va yuboradi", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    await flushQueue();
    retryQueued(getQueue()[0].id);
    expect(isShiftWaiting(getQueue()[0])).toBe(false);
    get.mockResolvedValueOnce(server());
    post.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({ status: 'DELIVERED' }));
    const r = await flushQueue();
    expect(r.sent).toHaveLength(1);
    expect(getQueue()).toHaveLength(0);
  });

  it("«Hozir yuborish» (force) kutayotganni ham yuboradi; smena hali yopiq — yana kutadi, xato bo'lmaydi", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    await flushQueue();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen());
    const r = await flushQueue({ force: true });
    expect(r).toMatchObject({ failed: 0 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(isShiftWaiting(getQueue()[0])).toBe(true);
  });

  it("navbat tartibi: kutayotgan to'lovdan keyingi buyurtma yaratish baribir yuboriladi, to'lov o'z o'rnida qoladi", async () => {
    login();
    pay();
    enqueueOrder({ id: 'c-1', kind: 'PICKUP', payload: { items: [] }, label: 'Olib ketish', total: 10_000 });
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(shiftNotOpen()).mockResolvedValueOnce(ok({ uuid: 'srv-1' }));
    const r = await flushQueue();
    expect(r.sent.map((s) => s.queued.id)).toEqual(['c-1']);
    expect(post.mock.calls[1][0]).toBe('orders/partner-pos/create-pickup/');
    const q = getQueue();
    expect(q).toHaveLength(1);
    expect(isShiftWaiting(q[0])).toBe(true);
  });

  it("stol hisobi (bill/pay) ham kutishga o'tadi va smena ochilgach bir marta to'lanadi", async () => {
    login();
    expect(enqueueTablePayment({ table_uuid: TABLE, order_uuids: ['o-1'], method: 'CASH', label: '3-stol', total: 50_000 })).toBe(true);
    const unpaid = { data: { data: { uuid: 'o-1', status: 'ACCEPTED', is_paid: false, total_price: '50000', payment_method: 'CASH', payment_breakdown: [] } } };
    get.mockResolvedValueOnce(unpaid);
    post.mockRejectedValueOnce(shiftNotOpen());
    const r1 = await flushQueue();
    expect(r1).toMatchObject({ failed: 0 });
    expect(getQueue()[0].error).toBeUndefined();

    releaseShiftWait('f-1');
    get.mockResolvedValueOnce(unpaid);
    post.mockResolvedValueOnce(ok({ paid: { total: 50_000 } }));
    const r2 = await flushQueue();
    expect(r2.sent).toHaveLength(1);
    expect(posts(BILL_PAY)).toHaveLength(2);
    expect(getQueue()).toHaveLength(0);
  });

  it("boshqa 409 (masalan, ORDER_PAID) — oldingidek «hal qiling» xatosi", async () => {
    login();
    pay();
    get.mockResolvedValueOnce(server());
    post.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), { response: { status: 409, data: { code: 'SOMETHING', message: 'Boshqa sabab' } } }),
    );
    const r = await flushQueue();
    expect(r).toMatchObject({ failed: 1 });
    expect(getQueue()[0].error).toBe('Boshqa sabab');
  });
});
