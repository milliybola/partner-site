import React, { useState } from 'react';
import { Banknote, CreditCard, Smartphone, Wallet, ArrowLeftRight } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { Button, Sheet } from '../../../../core/ui';
import { formatMoney } from '../../../../core/lib/format';
import { normalizePayCode, usePaymentMethods } from '../../../../core/lib/payments';
import type { PayMethod } from '../../../../core/lib/payments';
import { orderNo } from './actions';
import { SplitBill } from './SplitBill';

/** Eski nom — endi backend kodlari (core/lib/payments.ts) */
export type PaymentMethod = PayMethod;

const ICONS: Record<PayMethod, React.ReactNode> = {
  CASH: <Banknote className="w-6 h-6" />,
  CARD: <CreditCard className="w-6 h-6" />,
  TRANSFER: <ArrowLeftRight className="w-6 h-6" />,
  CLICK: <Smartphone className="w-6 h-6" />,
  PAYME: <Wallet className="w-6 h-6" />,
};

/**
 * YAGONA to'lov oynasi (topshirish / yakunlash): faqat hamkor yoqqan usullar ko'rinadi.
 * Tasdiqlansa to'lov va yakunlash bitta so'rovda yuboriladi (OrdersPage → ordersApi.completeWithPayment).
 */
interface Props {
  order: Order | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (method: PaymentMethod, splitCount: number) => void;
}

/** Har buyurtma uchun tanlov holati yangidan boshlanadi (key) — qayta renderlar (WS yangilanishi va h.k.) uni tiklamaydi */
export const PaymentSheet: React.FC<Props> = ({ order, ...rest }) =>
  order ? <PaymentForm key={order.uuid} order={order} {...rest} /> : null;

const PaymentForm: React.FC<Props & { order: Order }> = ({ order, saving, onClose, onSubmit }) => {
  const { methods } = usePaymentMethods();
  const [picked, setMethod] = useState<PaymentMethod>(() => normalizePayCode(order.payment_method));
  const [splitCount, setSplitCount] = useState(1);
  // Buyurtmadagi usul hamkorda o'chirilgan bo'lsa — birinchi yoqilganini tanlaymiz
  const method = methods.some((x) => x.value === picked) ? picked : methods[0].value;

  return (
    <Sheet
      open
      persistent={saving}
      onClose={onClose}
      size="sm"
      title="To'lov va yakunlash"
      subtitle={`${orderNo(order)}${order.table_number ? ` · ${order.table_number}-stol` : ''}`}
      footer={
        <>
          <Button variant="secondary" size="lg" disabled={saving} onClick={onClose}>
            Bekor qilish
          </Button>
          <Button size="lg" loading={saving} onClick={() => onSubmit(method, order.delivery_type === 'DINE_IN' ? splitCount : 1)} className="md:min-w-[180px]">
            Tasdiqlash va yakunlash
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-brand-soft px-4 py-4 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-brand">Jami summa</span>
        <span className="text-[24px] font-black text-brand tracking-tightest tabular-nums">{formatMoney(order.total_price)}</span>
      </div>
      {order.is_paid && <p className="mt-2 text-[13px] text-muted">Buyurtma allaqachon to'langan deb belgilangan. To'lov turini tekshirib, yakunlang.</p>}
      <div className="mt-4 text-[13px] font-semibold text-ink mb-2">To'lov turi</div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {methods.map((m) => {
          const active = m.value === method;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMethod(m.value)}
              className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 text-[14px] font-bold transition cursor-pointer ${
                active ? 'border-brand bg-brand-soft text-brand' : 'border-edge bg-surface text-ink hover:bg-field'
              }`}
            >
              {ICONS[m.value]}
              {m.label}
            </button>
          );
        })}
      </div>
      {order.delivery_type === 'DINE_IN' && (
        <SplitBill total={order.total_price} count={splitCount} onChange={setSplitCount} disabled={saving} />
      )}
      <p className="mt-3 text-[12px] text-muted">Tasdiqlangach buyurtma to'langan va yakunlangan deb belgilanadi, chek avtomatik chop etiladi.</p>
    </Sheet>
  );
};
