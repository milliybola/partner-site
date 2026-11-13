import React from 'react';
import { formatMoney } from '../../../core/lib/format';

/**
 * Savat jami bloki (Kassa va Stol oynasi uchun umumiy): mahsulotlar → aksiya → yetkazish → xizmat haqi → umumiy summa.
 * Faqat ko'rsatadi; raqamlar utils/posCart.ts dan keladi.
 */
export const CartTotals: React.FC<{
  /** "Jami · 3 ta" */
  countLabel: string;
  subtotal: number;
  /** > 0 bo'lsa «Aksiya / chegirma» qatori */
  discount?: number;
  /** Chegirma qatori yozuvi (ochiq buyurtmada — qo'lda chegirma: «Chegirma») */
  discountLabel?: string;
  /** Berilsa «Yetkazib berish» qatori: null — server hisoblaydi, 0 — bepul */
  deliveryFee?: number | null;
  showDelivery?: boolean;
  serviceCharge: number;
  serviceChargePercent: number;
  /** Xizmat haqi qatori ko'rinadimi (oqimlar shartni o'zi beradi) */
  showServiceCharge: boolean;
  totalLabel: string;
  total: number;
}> = ({ countLabel, subtotal, discount = 0, discountLabel = 'Aksiya / chegirma', deliveryFee = 0, showDelivery = false, serviceCharge, serviceChargePercent, showServiceCharge, totalLabel, total }) => (
  <div className="space-y-0.5">
    <div className="flex items-center justify-between text-[13px] text-muted font-semibold">
      <span>{countLabel}</span>
      <span className="tabular-nums">{formatMoney(subtotal)}</span>
    </div>
    {discount > 0 && (
      <div className="flex items-center justify-between text-[13px] text-brand font-semibold">
        <span>{discountLabel}</span>
        <span className="tabular-nums">−{formatMoney(discount)}</span>
      </div>
    )}
    {showDelivery && (
      <div className="flex items-center justify-between text-[13px] text-muted font-semibold">
        <span>Yetkazib berish</span>
        <span className="tabular-nums">{deliveryFee === null ? 'Buyurtmadan keyin hisoblanadi' : deliveryFee === 0 ? 'Bepul' : formatMoney(deliveryFee)}</span>
      </div>
    )}
    {showServiceCharge && (
      <div className="flex items-center justify-between text-[13px] text-muted font-semibold">
        <span>Xizmat haqi{serviceChargePercent > 0 ? ` (${serviceChargePercent}%)` : ''}</span>
        <span className="tabular-nums">{formatMoney(serviceCharge)}</span>
      </div>
    )}
    <div className="flex items-center justify-between pt-0.5">
      <span className="text-[14px] text-ink font-extrabold">{totalLabel}</span>
      <span className="text-[20px] font-black text-ink tracking-tightest tabular-nums leading-tight">{formatMoney(total)}</span>
    </div>
  </div>
);
