import { describe, expect, it } from 'vitest';
import type { TableBill, TableBillOrder } from '../services/tablesApi';
import { billChangedSince, seenTotal, unseenBillable } from './billCheck';
import type { SeenBill } from './billCheck';

/**
 * D14 — butun stol to'lanayotganda kassir ko'rmagan buyurtma "to'langan" bo'lib qolmasin:
 * kassir ko'rgan ro'yxat va summa serverdagi joriy hisob bilan solishtiriladi.
 */
const order = (uuid: string, total: number, billable = true): TableBillOrder => ({
  uuid,
  order_number: uuid,
  status: 'CONFIRMED',
  status_display: '',
  created_at: '2026-11-09T10:00:00Z',
  is_paid: !billable,
  billable,
  order_source: 'POS',
  payment_method: 'CASH',
  guest_name: null,
  waiter_name: null,
  items: [],
  total_price: String(total),
});

const bill = (...orders: TableBillOrder[]): TableBill => ({
  table_uuid: 't-1',
  table_number: '5',
  session: { uuid: 's-1', opened_at: '2026-11-09T10:00:00Z' },
  orders,
  bill: { subtotal: 0, service_charge_amount: 0, total: 0, orders_count: orders.length },
});

const whole: SeenBill = {
  billable: ['o-1', 'o-2'],
  picked: [
    { uuid: 'o-1', total: '50000' },
    { uuid: 'o-2', total: 30_000 },
  ],
  wholeTable: true,
};

describe('billChangedSince (D14)', () => {
  it("o'zgarmagan hisob — to'lov davom etadi", () => {
    expect(billChangedSince(whole, bill(order('o-1', 50_000), order('o-2', 30_000)))).toBe(false);
  });

  it("butun stol: ofitsiant yangi buyurtma qo'shgan — to'xtatiladi", () => {
    expect(billChangedSince(whole, bill(order('o-1', 50_000), order('o-2', 30_000), order('o-3', 20_000)))).toBe(true);
  });

  it("tanlangan buyurtmaga taom qo'shilgan (summa o'zgargan) — to'xtatiladi", () => {
    expect(billChangedSince(whole, bill(order('o-1', 65_000), order('o-2', 30_000)))).toBe(true);
  });

  it("tanlangan buyurtmani boshqa kassir to'lagan — to'xtatiladi", () => {
    expect(billChangedSince(whole, bill(order('o-1', 50_000, false), order('o-2', 30_000)))).toBe(true);
  });

  it("bo'lib to'lash: yangi buyurtma tanlanganlarga ta'sir qilmaydi — davom etadi", () => {
    const split: SeenBill = { billable: ['o-1', 'o-2'], picked: [{ uuid: 'o-1', total: 50_000 }], wholeTable: false };
    expect(billChangedSince(split, bill(order('o-1', 50_000), order('o-2', 30_000), order('o-3', 20_000)))).toBe(false);
  });

  it("to'lovi oflayn navbatdagi buyurtma yangi hisoblanmaydi", () => {
    const fresh = bill(order('o-1', 50_000), order('o-2', 30_000), order('o-q', 10_000));
    expect(billChangedSince(whole, fresh, (u) => u === 'o-q')).toBe(false);
  });

  it("to'lovdan keyin qolgan ko'rilmagan buyurtmalar sanaladi", () => {
    const after = bill(order('o-1', 50_000, false), order('o-2', 30_000, false), order('o-3', 20_000));
    expect(unseenBillable(whole, after)).toBe(1);
    expect(seenTotal(whole)).toBe(80_000);
  });
});
