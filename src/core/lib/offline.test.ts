import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('../api/client', () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

import { STORAGE_KEYS } from '../config/constants';
import {
  LEGACY_QUEUE_ERROR,
  cacheGet,
  cacheSet,
  clearOfflineCache,
  enqueueOrder,
  flushQueue,
  getQueue,
  pendingCount,
  retryQueued,
} from './offline';

const PARTNER = 'p-1';
const login = (staff: string | null, extra: Record<string, unknown> = {}) =>
  localStorage.setItem(
    STORAGE_KEYS.PARTNER_DATA,
    JSON.stringify(
      staff
        ? { uuid: PARTNER, staff_uuid: staff, role: 'cashier', user_type: 'staff', current_filial: { uuid: 'f-staff' }, ...extra }
        : { uuid: PARTNER, role: 'superadmin', user_type: 'partner', ...extra },
    ),
  );
const logout = () => localStorage.removeItem(STORAGE_KEYS.PARTNER_DATA);

const order = (id: string, kind: 'DINE_IN' | 'PICKUP' | 'DELIVERY' = 'PICKUP') => ({
  id,
  kind,
  payload: { items: [{ product: 'x', quantity: 1 }] } as Record<string, unknown>,
  label: id,
  total: 10_000,
});

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const serverError = (message: string) => Object.assign(new Error('Request failed with status code 400'), { response: { status: 400, data: { message } } });

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
});

describe('oflayn navbat: xodimga bog\'lanish', () => {
  it('A ning buyurtmasi B kirganda ko\'rinmaydi va B tokeni bilan yuborilmaydi', async () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    expect(getQueue()).toHaveLength(1);

    logout();
    login('staff-B');
    expect(getQueue()).toHaveLength(0);
    expect(pendingCount()).toBe(0);
    const res = await flushQueue();
    expect(res.sent).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();

    // A qayta kirsa — o'z buyurtmasi joyida va yuboriladi
    logout();
    login('staff-A');
    post.mockResolvedValueOnce({ data: { data: { uuid: 'srv-1' } } });
    const back = await flushQueue();
    expect(back.sent).toHaveLength(1);
    expect(post).toHaveBeenCalledWith('orders/partner-pos/create-pickup/', expect.objectContaining({ client_uuid: 'o-1' }));
    expect(getQueue()).toHaveLength(0);
  });

  it('tizimga kirilmagan bo\'lsa navbatga yozish xato beradi (jimgina yo\'qolmaydi)', () => {
    expect(() => enqueueOrder(order('o-1'))).toThrow();
  });

  it('filial muzlatiladi: olib ketish payload\'iga xodim filiali yoziladi, stol buyurtmasiga yozilmaydi', () => {
    login('staff-A');
    enqueueOrder(order('o-1', 'PICKUP'));
    enqueueOrder(order('o-2', 'DINE_IN'));
    const [pickup, dineIn] = getQueue();
    expect(pickup.payload.filial_uuid).toBe('f-staff');
    expect(pickup.filial).toBe('f-staff');
    expect(dineIn.payload.filial_uuid).toBeUndefined();
  });

  it('rahbar tanlagan filial muzlatiladi — keyin boshqa filialga o\'tsa ham eski filialga ketadi', async () => {
    login(null);
    localStorage.setItem(STORAGE_KEYS.WORKING_FILIAL, 'f-A');
    enqueueOrder(order('o-1', 'DELIVERY'));
    localStorage.setItem(STORAGE_KEYS.WORKING_FILIAL, 'f-B');
    post.mockResolvedValueOnce({ data: { data: {} } });
    await flushQueue();
    expect(post.mock.calls[0][1]).toMatchObject({ filial_uuid: 'f-A', client_uuid: 'o-1' });
  });

  it('eski umumiy navbat xato belgisi bilan ko\'chadi va avtomatik yuborilmaydi', async () => {
    localStorage.setItem('milliygo_offline_orders', JSON.stringify([{ ...order('old-1'), created_at: new Date().toISOString() }]));
    login('staff-B');
    const q = getQueue();
    expect(q).toHaveLength(1);
    expect(q[0].error).toBe(LEGACY_QUEUE_ERROR);
    expect(localStorage.getItem('milliygo_offline_orders')).toBeNull();
    await flushQueue();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('oflayn navbat: idempotentlik', () => {
  it('bir xil client_uuid ikki marta navbatga yozilmaydi (ikki marta bosish)', () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    enqueueOrder(order('o-1'));
    expect(getQueue()).toHaveLength(1);
  });

  it('parallel flush bitta buyurtmani ikki marta yubormaydi', async () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    let resolve!: (v: unknown) => void;
    post.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const first = flushQueue();
    const second = await flushQueue(); // birinchisi hali tugamagan
    expect(second.sent).toHaveLength(0);
    resolve({ data: { data: { uuid: 'srv-1' } } });
    const done = await first;
    expect(done.sent).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('har yuborishda client_uuid = navbat id (server takrorni yaratmaydi)', async () => {
    login('staff-A');
    enqueueOrder({ ...order('o-1'), payload: { client_uuid: 'boshqa', items: [] } });
    post.mockResolvedValueOnce({ data: { data: {} } });
    await flushQueue();
    expect(post.mock.calls[0][1].client_uuid).toBe('o-1');
  });
});

describe('oflayn navbat: xatoli yuborish', () => {
  it('internet yana uzilsa — to\'xtaydi, buyurtmalar navbatda xatosiz qoladi', async () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    enqueueOrder(order('o-2'));
    post.mockRejectedValueOnce(networkError());
    const res = await flushQueue();
    expect(res).toEqual({ sent: [], failed: 0, deferred: false });
    expect(post).toHaveBeenCalledTimes(1);
    expect(getQueue().map((o) => o.error)).toEqual([undefined, undefined]);
  });

  it('server rad etsa — xato belgisi qo\'yiladi, keyingisi yuboriladi, rad etilgan qayta yuborilmaydi', async () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    enqueueOrder(order('o-2'));
    post.mockRejectedValueOnce(serverError('Smena yopiq')).mockResolvedValueOnce({ data: { data: { uuid: 'srv-2' } } });
    const res = await flushQueue();
    expect(res.failed).toBe(1);
    expect(res.sent.map((s) => s.queued.id)).toEqual(['o-2']);
    const q = getQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: 'o-1', error: 'Smena yopiq' });

    post.mockClear();
    await flushQueue();
    expect(post).not.toHaveBeenCalled();

    // Qo'lda «Qayta urinish» — yana yuboriladi
    retryQueued('o-1');
    post.mockResolvedValueOnce({ data: { data: {} } });
    const again = await flushQueue();
    expect(again.sent).toHaveLength(1);
    expect(getQueue()).toHaveLength(0);
  });

  it('yuborish paytida boshqa xodim PIN bilan kirsa — qolganlari yangi token bilan yuborilmaydi', async () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    enqueueOrder(order('o-2'));
    post.mockImplementationOnce(async () => {
      login('staff-B'); // sessiya almashdi
      return { data: { data: {} } };
    });
    const res = await flushQueue();
    expect(res.sent.map((s) => s.queued.id)).toEqual(['o-1']);
    expect(post).toHaveBeenCalledTimes(1);
    login('staff-A');
    expect(getQueue().map((o) => o.id)).toEqual(['o-2']);
  });
});

describe('kesh', () => {
  it('chiqishda kesh tozalanadi, boshqa kalitlarga tegmaydi', () => {
    login('staff-A');
    enqueueOrder(order('o-1'));
    cacheSet('tables:f-1', [1]);
    localStorage.setItem('sidebar_collapsed', 'true');
    clearOfflineCache();
    expect(cacheGet('tables:f-1')).toBeNull();
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
    expect(getQueue()).toHaveLength(1); // navbat saqlanadi
  });
});
