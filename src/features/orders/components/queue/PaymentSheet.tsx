import React, { useState } from 'react';
import { Banknote, CreditCard, Smartphone, Wallet, ArrowLeftRight, Split } from 'lucide-react';
import type { Order, PaymentPart } from '../../services/ordersApi';
import { Button, Input, Sheet } from '../../../../core/ui';
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

/** Payme/Click onlayn — aralash to'lovda qo'lda kiritilmaydi (backend ham qabul qilmaydi) */
const MIXABLE: PayMethod[] = ['CASH', 'CARD', 'TRANSFER'];

const digits = (v: string) => parseInt(v.replace(/\D/g, ''), 10) || 0;

/**
 * YAGONA to'lov oynasi (topshirish / yakunlash): faqat hamkor yoqqan usullar ko'rinadi.
 * Tasdiqlansa to'lov va yakunlash bitta so'rovda yuboriladi (OrdersPage → ordersApi.completeWithPayment).
 * «Aralash» — summa bir necha usulga bo'linadi (masalan, qismi naqd, qismi karta).
 */
interface Props {
  order: Order | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (method: PaymentMethod, splitCount: number, payments?: PaymentPart[]) => void;
}

/** Har buyurtma uchun tanlov holati yangidan boshlanadi (key) — qayta renderlar (WS yangilanishi va h.k.) uni tiklamaydi */
export const PaymentSheet: React.FC<Props> = ({ order, ...rest }) =>
  order ? <PaymentForm key={order.uuid} order={order} {...rest} /> : null;

const PaymentForm: React.FC<Props & { order: Order }> = ({ order, saving, onClose, onSubmit }) => {
  const { methods } = usePaymentMethods();
  const [picked, setMethod] = useState<PaymentMethod>(() => normalizePayCode(order.payment_method));
  const [splitCount, setSplitCount] = useState(1);
  const [mixed, setMixed] = useState(false);
  const [parts, setParts] = useState<Partial<Record<PayMethod, number>>>({});
  const [tendered, setTendered] = useState(0);
  // Buyurtmadagi usul hamkorda o'chirilgan bo'lsa — birinchi yoqilganini tanlaymiz
  const method = methods.some((x) => x.value === picked) ? picked : methods[0].value;

  const total = Math.round(Number(order.total_price) || 0);
  const mixable = methods.filter((m) => MIXABLE.includes(m.value));
  const partsSum = mixable.reduce((s, m) => s + (parts[m.value] || 0), 0);
  const left = total - partsSum;
  const filled = mixable.filter((m) => (parts[m.value] || 0) > 0);
  const mixedReady = left === 0 && filled.length > 0;
  const change = tendered - total;

  const submit = () => {
    const split = order.delivery_type === 'DINE_IN' ? splitCount : 1;
    if (!mixed) return onSubmit(method, split);
    const payments = filled.map((m) => ({ method: m.value, amount: parts[m.value]! }));
    const main = payments.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a));
    onSubmit(main.method as PayMethod, split, payments);
  };

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
          <Button size="lg" loading={saving} disabled={mixed && !mixedReady} onClick={submit} className="md:min-w-[180px]">
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

      <div className="mt-4 flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-semibold text-ink">To'lov turi</span>
        {mixable.length > 1 && (
          <button
            type="button"
            onClick={() => setMixed((v) => !v)}
            aria-pressed={mixed}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-bold cursor-pointer transition ${
              mixed ? 'bg-brand text-white' : 'bg-field text-ink hover:bg-edge'
            }`}
          >
            <Split className="w-4 h-4" /> Aralash
          </button>
        )}
      </div>

      {!mixed ? (
        <>
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
          {method === 'CASH' && (
            <div className="mt-3 grid grid-cols-2 gap-2 items-end">
              <Input
                label="Mijoz berdi"
                inputMode="numeric"
                placeholder={total.toLocaleString('uz-UZ')}
                value={tendered ? tendered.toLocaleString('uz-UZ') : ''}
                onChange={(e) => setTendered(digits(e.target.value))}
              />
              <div className={`h-11 rounded-xl px-3 flex items-center justify-between text-[14px] font-bold ${change >= 0 ? 'bg-field text-ink' : 'bg-danger-soft text-danger-ink'}`}>
                <span>{change >= 0 ? 'Qaytim' : 'Yetmaydi'}</span>
                <span className="tabular-nums">{tendered ? formatMoney(Math.abs(change)) : '—'}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {mixable.map((m) => (
            <div key={m.value} className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <Input
                label={m.label}
                inputMode="numeric"
                placeholder="0"
                value={parts[m.value] ? parts[m.value]!.toLocaleString('uz-UZ') : ''}
                onChange={(e) => setParts((p) => ({ ...p, [m.value]: digits(e.target.value) }))}
              />
              <Button
                variant="secondary"
                disabled={left <= 0}
                onClick={() => setParts((p) => ({ ...p, [m.value]: (p[m.value] || 0) + left }))}
              >
                Qolgani
              </Button>
            </div>
          ))}
          <div className={`rounded-xl px-3 py-2.5 flex items-center justify-between text-[14px] font-bold ${left === 0 ? 'bg-brand-soft text-brand' : 'bg-warning-soft text-warning-ink'}`}>
            <span>{left === 0 ? "To'liq taqsimlandi" : left > 0 ? 'Qolgan' : 'Ortiqcha'}</span>
            <span className="tabular-nums">{formatMoney(Math.abs(left))}</span>
          </div>
        </div>
      )}

      {order.delivery_type === 'DINE_IN' && (
        <SplitBill total={order.total_price} count={splitCount} onChange={setSplitCount} disabled={saving} />
      )}
      <p className="mt-3 text-[12px] text-muted">Tasdiqlangach buyurtma to'langan va yakunlangan deb belgilanadi, chek avtomatik chop etiladi.</p>
    </Sheet>
  );
};
