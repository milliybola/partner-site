import { formatMoney } from '../../../core/lib/format';

/**
 * A31/D36: yopilgan smenadagi to'lov keyin bekor qilinsa yoki usuli o'zgarsa, farq JORIY smenaga tuzatish bo'lib
 * tushadi (backend `adjustments_*`). Bu summa backendda savdo, naqd va kutilgan kassaga allaqachon qo'shilgan —
 * bu yerda faqat alohida qator va izoh uchun ajratib ko'rsatiladi (qayta hisoblanmaydi).
 */
export interface ShiftAdjustmentFields {
  adjustments_count?: number | string | null;
  adjustments_total?: number | string | null;
  adjustments_cash?: number | string | null;
  cash_revenue?: number | string | null;
}

export interface AdjustmentView {
  count: number;
  total: number;
  cash: number;
  /** «shundan naqd» qatori kerakmi (naqd qism jamidan farq qilsa) */
  showCash: boolean;
  /** Naqd tushum minus — «savdo minus» emasligini tushuntirish kerak */
  cashNegative: boolean;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** Tuzatish yo'q (yoki eski backend maydon bermagan) — null */
export const adjustmentView = (s: ShiftAdjustmentFields | null | undefined): AdjustmentView | null => {
  if (!s) return null;
  const total = num(s.adjustments_total);
  const cash = num(s.adjustments_cash);
  if (!total && !cash) return null;
  return { count: num(s.adjustments_count), total, cash, showCash: cash !== 0 && cash !== total, cashNegative: num(s.cash_revenue) < 0 };
};

/** Ishorali summa: −60 000 so'm (haqiqiy minus belgisi), +60 000 so'm */
export const signedMoney = (v: number | string | null | undefined): string => {
  const n = num(v);
  if (n < 0) return `−${formatMoney(-n)}`;
  if (n > 0) return `+${formatMoney(n)}`;
  return formatMoney(0);
};
