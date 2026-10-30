import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, ArrowLeftRight, Smartphone, Wallet } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import type { TableBill, TableModel } from '../services/tablesApi';
import { Button, Sheet } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { usePaymentMethods } from '../../../core/lib/payments';
import type { PayMethod } from '../../../core/lib/payments';

const ICONS: Record<PayMethod, React.ReactNode> = {
  CASH: <Banknote className="w-5 h-5" />,
  CARD: <CreditCard className="w-5 h-5" />,
  TRANSFER: <ArrowLeftRight className="w-5 h-5" />,
  CLICK: <Smartphone className="w-5 h-5" />,
  PAYME: <Wallet className="w-5 h-5" />,
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Stolning joriy seansi hisobi: barcha buyurtmalar. Kassir butun stolni yoki faqat tanlangan buyurtmalarni
 * (hisobni bo'lib to'lash) to'laydi; hamma buyurtma to'langach seans yopiladi. Ofitsiant faqat ko'radi.
 */
export const TableBillSheet: React.FC<{
  table: TableModel | null;
  canPay: boolean;
  onClose: () => void;
  /** To'lovdan keyin stollar ro'yxatini yangilash uchun */
  onChanged: () => void;
}> = ({ table, canPay, onClose, onChanged }) => {
  const toast = useToast();
  const { methods: payMethods } = usePaymentMethods();
  const [bill, setBill] = useState<TableBill | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PayMethod>('CASH');

  const apply = useCallback((b: TableBill) => {
    setBill(b);
    // Odatada butun stol to'lanadi: tasdiqlangan, to'lanmagan buyurtmalar oldindan tanlangan
    setPicked(new Set(b.orders.filter((o) => o.billable).map((o) => o.uuid)));
  }, []);

  const load = useCallback(async () => {
    if (!table) return;
    setLoading(true);
    setError(null);
    try {
      apply(await tablesApi.getTableBill(table.uuid));
    } catch (e) {
      setError(getErrorMessage(e, "Hisobni yuklab bo'lmadi."));
    } finally {
      setLoading(false);
    }
  }, [table, apply]);

  useEffect(() => {
    setBill(null);
    if (table) void load();
  }, [table, load]);

  useEffect(() => {
    if (payMethods.length && !payMethods.some((m) => m.value === method)) setMethod(payMethods[0].value);
  }, [payMethods, method]);

  const billable = useMemo(() => (bill?.orders ?? []).filter((o) => o.billable), [bill]);
  const selectedTotal = billable.filter((o) => picked.has(o.uuid)).reduce((s, o) => s + num(o.total_price), 0);
  const allPicked = billable.length > 0 && billable.every((o) => picked.has(o.uuid));

  const toggle = (uuid: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });

  const pay = async () => {
    if (!table || !bill || picked.size === 0) return;
    setSaving(true);
    try {
      // Hammasi tanlangan bo'lsa ro'yxat yubormaymiz: server o'sha paytdagi hamma to'lanmaganni to'laydi
      const uuids = allPicked ? undefined : [...picked];
      const next = await tablesApi.payTableBill(table.uuid, method, uuids);
      toast.success("To'lov qabul qilindi.");
      onChanged();
      if (next.session) apply(next);
      else onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "To'lovni qabul qilib bo'lmadi."));
      void load(); // boshqa kassir to'lagan bo'lishi mumkin — yangi holatni ko'rsatamiz
    } finally {
      setSaving(false);
    }
  };

  const showPay = canPay && billable.length > 0;

  return (
    <Sheet
      open={!!table}
      persistent={saving}
      onClose={onClose}
      size="md"
      title="Stol hisobi"
      subtitle={table ? `Stol ${table.table_number}` : ''}
      footer={
        showPay ? (
          <>
            <Button variant="secondary" size="lg" disabled={saving} onClick={onClose}>
              Yopish
            </Button>
            <Button size="lg" loading={saving} disabled={picked.size === 0} onClick={() => void pay()} className="md:min-w-[220px]">
              To'lovni qabul qilish · {formatMoney(selectedTotal)}
            </Button>
          </>
        ) : undefined
      }
    >
      {loading && !bill && <p className="py-8 text-center text-[14px] text-muted">Yuklanmoqda…</p>}
      {error && <p className="py-6 text-center text-[14px] font-semibold text-danger-ink">{error}</p>}
      {bill && !bill.session && <p className="py-8 text-center text-[14px] font-semibold text-muted">Bu stolda ochiq hisob yo'q.</p>}
      {bill?.session && (
        <>
          <div className="rounded-2xl bg-brand-soft px-4 py-4 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-brand">To'lanishi kerak</div>
              <div className="text-[12px] text-muted">{bill.bill.orders_count} ta tasdiqlangan buyurtma</div>
            </div>
            <span className="text-[24px] font-black text-brand tracking-tightest tabular-nums">{formatMoney(num(bill.bill.total))}</span>
          </div>

          <ul className="mt-3 space-y-2">
            {bill.orders.map((o) => {
              const paid = o.is_paid;
              const selectable = showPay && o.billable;
              return (
                <li key={o.uuid}>
                  <label
                    className={`flex items-start gap-3 rounded-2xl border p-3 ${
                      paid ? 'border-edge bg-field opacity-70' : o.billable ? 'border-edge bg-surface' : 'border-dashed border-edge-strong bg-surface'
                    } ${selectable ? 'cursor-pointer' : ''}`}
                  >
                    {selectable ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 accent-[var(--color-brand)]"
                        checked={picked.has(o.uuid)}
                        onChange={() => toggle(o.uuid)}
                        aria-label={`${o.order_number} ni to'lash`}
                      />
                    ) : paid ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                    ) : (
                      <span className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-black text-ink">{o.order_number}</span>
                        <span className="text-[12px] text-muted">
                          {o.order_source === 'QR' ? 'Stol QR' : o.waiter_name || ''}
                          {o.guest_name ? ` · ${o.guest_name}` : ''}
                        </span>
                        <span className="ml-auto text-[12px] font-bold text-muted">
                          {paid ? "To'langan" : o.billable ? o.status_display : o.status === 'PENDING' || o.status === 'NEW' ? 'Tasdiqlanmagan' : o.status_display}
                        </span>
                      </div>
                      <div className="mt-1 text-[13px] text-ink-2 leading-snug">
                        {o.items.map((it) => `${it.quantity - it.free_quantity > 0 ? it.quantity - it.free_quantity : it.quantity}× ${it.name}`).join(', ')}
                      </div>
                      <div className="mt-1 text-right text-[14px] font-black tabular-nums text-ink">{formatMoney(num(o.total_price))}</div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          {showPay && (
            <>
              <div className="mt-4 mb-2 text-[13px] font-semibold text-ink">To'lov turi</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup">
                {payMethods.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={m.value === method}
                    onClick={() => setMethod(m.value)}
                    className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-[13px] font-bold cursor-pointer transition ${
                      m.value === method ? 'border-brand bg-brand-soft text-brand' : 'border-edge bg-surface text-ink hover:bg-field'
                    }`}
                  >
                    {ICONS[m.value]}
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-muted">
                Hisobni bo'lib to'lash uchun faqat mehmon aytgan buyurtmalarni belgilang. Hammasi to'langach stol hisobi yopiladi.
              </p>
            </>
          )}
          {!canPay && billable.length > 0 && <p className="mt-3 text-[12px] text-muted">To'lovni manager yoki hamkor qabul qiladi.</p>}
        </>
      )}
    </Sheet>
  );
};
