import React, { useEffect, useState } from 'react';
import { Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { Button, Sheet } from '../../../../core/ui';
import { formatMoney } from '../../../../core/lib/format';
import { orderNo } from './actions';

export type PaymentMethod = 'CASH' | 'CLICK' | 'PAYME' | 'UZCARD';

const METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Naqd pul', icon: <Banknote className="w-6 h-6" /> },
  { value: 'CLICK', label: 'Click', icon: <Smartphone className="w-6 h-6" /> },
  { value: 'PAYME', label: 'Payme', icon: <Wallet className="w-6 h-6" /> },
  { value: 'UZCARD', label: 'Uzcard', icon: <CreditCard className="w-6 h-6" /> },
];

export const PaymentSheet: React.FC<{
  order: Order | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (method: PaymentMethod) => void;
}> = ({ order, saving, onClose, onSubmit }) => {
  const [method, setMethod] = useState<PaymentMethod>('CASH');

  useEffect(() => {
    if (!order) return;
    const m = String(order.payment_method || '').toUpperCase();
    setMethod((METHODS.some((x) => x.value === m) ? m : 'CASH') as PaymentMethod);
  }, [order]);

  if (!order) return null;
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
          <Button size="lg" loading={saving} onClick={() => onSubmit(method)} className="md:min-w-[180px]">
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
        {METHODS.map((m) => {
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
              {m.icon}
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted">Tasdiqlangach buyurtma to'langan va yakunlangan deb belgilanadi, chek avtomatik chop etiladi.</p>
    </Sheet>
  );
};
