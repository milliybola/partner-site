import { describe, expect, it } from 'vitest';
import { adjustmentView, signedMoney } from './adjustments';

/** D36 (A31): oldingi smenalardan tushgan qaytarish / tuzatish qatori */
describe('smena tuzatish qatori', () => {
  it("tuzatish yo'q yoki eski backend — qator chiqmaydi", () => {
    expect(adjustmentView(null)).toBeNull();
    expect(adjustmentView({})).toBeNull();
    expect(adjustmentView({ adjustments_count: 0, adjustments_total: '0.00', adjustments_cash: '0.00' })).toBeNull();
  });

  it('qaytarish: −60 000, naqd jami bilan bir xil — «shundan naqd» qatori kerak emas', () => {
    const a = adjustmentView({ adjustments_count: 1, adjustments_total: '-60000.00', adjustments_cash: '-60000.00', cash_revenue: '40000.00' });
    expect(a).toEqual({ count: 1, total: -60_000, cash: -60_000, showCash: false, cashNegative: false });
    expect(signedMoney(a!.total)).toBe("−60 000 so'm");
  });

  it("naqd minus — izoh kerak (savdo minus emas)", () => {
    const a = adjustmentView({ adjustments_count: 1, adjustments_total: '-60000', adjustments_cash: '-60000', cash_revenue: '-20000' });
    expect(a?.cashNegative).toBe(true);
  });

  it("usul o'zgardi (naqd → karta): jami 0, naqd −60 000 — qator chiqadi, naqd alohida", () => {
    const a = adjustmentView({ adjustments_count: 1, adjustments_total: '0', adjustments_cash: '-60000', cash_revenue: '100000' });
    expect(a).toMatchObject({ total: 0, cash: -60_000, showCash: true });
  });

  it('ishorali summa', () => {
    expect(signedMoney(15000)).toBe("+15 000 so'm");
    expect(signedMoney(0)).toBe("0 so'm");
    expect(signedMoney('-1234567.40')).toBe("−1 234 567 so'm");
  });
});
