import { describe, expect, it } from 'vitest';
import type { Order } from '../../services/ordersApi';
import { getQueueActions, isCancelManagerOnly, type ActionContext } from './actions';

const mk = (o: Partial<Order>): Order => ({ id: 1, uuid: 'u', status: 'ACCEPTED', delivery_type: 'PICKUP', ...o }) as Order;
const base: ActionContext = { skipPreparing: false, fastMode: false, hasOwnCouriers: false, shop: false };
const fast: ActionContext = { ...base, fastMode: true };
const kinds = (r: ReturnType<typeof getQueueActions>) => ({
  primary: r.primary?.kind,
  secondary: r.secondary.map((a) => a.kind),
  danger: r.danger?.kind,
});

describe('Tez rejim tugmalari', () => {
  it('olib ketish, qabul qilingan, to\'lanmagan: bitta «Mijozga berish» (to\'lov bilan) + bekor qilish', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'PICKUP', is_paid: false }), fast);
    expect(kinds(r)).toEqual({ primary: 'pay_and_complete', secondary: [], danger: 'cancel' });
    expect(r.primary?.label).toBe('Mijozga berish');
  });

  it('zal (stol) buyurtmasi: «To\'lov va yakunlash»', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'DINE_IN', is_paid: false }), fast);
    expect(r.primary).toMatchObject({ kind: 'pay_and_complete', label: "To'lov va yakunlash" });
  });

  it('oldindan to\'langan bo\'lsa — to\'lov qayta so\'ralmaydi (complete)', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'PICKUP', is_paid: true }), fast);
    expect(r.primary?.kind).toBe('complete');
  });

  it('PREPARING holatida ham bitta tugma, bekor qilish yo\'q', () => {
    const r = getQueueActions(mk({ status: 'PREPARING', delivery_type: 'PICKUP' }), fast);
    expect(kinds(r)).toEqual({ primary: 'pay_and_complete', secondary: [], danger: undefined });
  });

  it('ilovadan olib ketish: ixtiyoriy «Tayyor (mijozga xabar)» qo\'shimcha tugma', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'PICKUP', order_source: 'CUSTOMER' } as Partial<Order>), fast);
    expect(kinds(r).secondary).toEqual(['mark_ready']);
  });

  it('yetkazib berish Tez rejimda ham oddiy oqimda: tayyorlashsiz «Tayyor»', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'DELIVERY' }), fast);
    expect(kinds(r)).toEqual({ primary: 'mark_ready', secondary: [], danger: 'cancel' });
  });

  it('yetkazib berish, o\'z kuryerlari bor: kuryer biriktirish ham chiqadi', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'DELIVERY' }), { ...fast, hasOwnCouriers: true });
    expect(kinds(r).secondary).toEqual(['assign_courier']);
  });

  it('kutilayotgan buyurtma: qabul qilish / rad etish; QR buyurtma — «Tasdiqlash» (Tez rejimda ham tasdiq shart)', () => {
    expect(kinds(getQueueActions(mk({ status: 'PENDING' }), fast))).toEqual({ primary: 'accept', secondary: [], danger: 'reject' });
    const qr = getQueueActions(mk({ status: 'PENDING', delivery_type: 'DINE_IN', order_source: 'QR' } as Partial<Order>), fast);
    expect(qr.primary).toMatchObject({ kind: 'accept', label: 'Tasdiqlash' });
  });

  it('o\'z-o\'ziga xizmat zali: Tez rejimda ham «Tayyor» asosiy, berish ikkinchi darajali', () => {
    const r = getQueueActions(mk({ status: 'ACCEPTED', delivery_type: 'DINE_IN', hall_uuid: 'h1', is_paid: true } as Partial<Order>), fast);
    expect(kinds(r)).toEqual({ primary: 'mark_ready', secondary: ['complete'], danger: 'cancel' });
  });

  it('kuryerga topshirilgan buyurtmada tugma yo\'q', () => {
    const r = getQueueActions(mk({ status: 'ON_THE_WAY', delivery_type: 'DELIVERY', courier_phone: '+998' } as Partial<Order>), fast);
    expect(kinds(r)).toEqual({ primary: undefined, secondary: [], danger: undefined });
  });
});

describe("To'langan buyurtmani bekor qilish (faqat menejer/ega)", () => {
  const paid = mk({ status: 'ACCEPTED', delivery_type: 'PICKUP', is_paid: true });
  it('kassirga bekor qilish tugmasi ko\'rsatilmaydi, izoh chiqadi', () => {
    const cashier = { ...base, canCancelPaid: false };
    expect(getQueueActions(paid, cashier).danger).toBeUndefined();
    expect(isCancelManagerOnly(paid, cashier)).toBe(true);
  });
  it('menejer/egaga tugma bor', () => {
    expect(getQueueActions(paid, { ...base, canCancelPaid: true }).danger?.kind).toBe('cancel');
    expect(isCancelManagerOnly(paid, { ...base, canCancelPaid: true })).toBe(false);
  });
  it('to\'lanmagan buyurtmani kassir ham bekor qiladi', () => {
    const unpaid = mk({ status: 'ACCEPTED', delivery_type: 'PICKUP', is_paid: false });
    expect(getQueueActions(unpaid, { ...base, canCancelPaid: false }).danger?.kind).toBe('cancel');
    expect(isCancelManagerOnly(unpaid, { ...base, canCancelPaid: false })).toBe(false);
  });
  it('bekor qilib bo\'lmaydigan holatda izoh ham yo\'q', () => {
    const ready = mk({ status: 'READY_FOR_PICKUP', delivery_type: 'PICKUP', is_paid: true });
    expect(isCancelManagerOnly(ready, { ...base, canCancelPaid: false })).toBe(false);
  });
});

describe('Oddiy rejim (taqqoslash)', () => {
  it('qabul qilingan → «Tayyorlashni boshlash»', () => {
    expect(getQueueActions(mk({ status: 'ACCEPTED' }), base).primary?.kind).toBe('start_preparing');
  });
  it('skipPreparing → «Tayyor»', () => {
    expect(getQueueActions(mk({ status: 'ACCEPTED' }), { ...base, skipPreparing: true }).primary?.kind).toBe('mark_ready');
  });
  it('tayyor (olib ketish) → berish va orqaga qaytarish', () => {
    expect(kinds(getQueueActions(mk({ status: 'READY_FOR_PICKUP' }), base))).toEqual({ primary: 'pay_and_complete', secondary: ['back_to_preparing'], danger: undefined });
  });
  it('tayyor (yetkazish) → kassada tugma yo\'q, kuryer boshqaradi', () => {
    expect(getQueueActions(mk({ status: 'READY_FOR_PICKUP', delivery_type: 'DELIVERY' }), base).primary).toBeUndefined();
  });
});
