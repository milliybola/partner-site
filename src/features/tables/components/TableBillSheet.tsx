import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, CloudOff, CreditCard, ArrowLeftRight, Smartphone, Wallet } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import { billChangedSince, seenTotal, unseenBillable } from '../lib/billCheck';
import type { SeenBill } from '../lib/billCheck';
import type { TableBill, TableModel } from '../services/tablesApi';
import { Button, Sheet } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { useShiftNotOpenPrompt } from '../../../core/components/useShiftNotOpenPrompt';
import { formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { usePaymentMethods } from '../../../core/lib/payments';
import type { PayMethod } from '../../../core/lib/payments';
import { cacheGet, enqueueTablePayment, isNetworkError, isPaymentQueued, queuedTableOrders, useOfflineQueue, withCache } from '../../../core/lib/offline';
import { t } from '../../../core/i18n';

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

const billCacheKey = (tableUuid: string) => `table-bill:${tableUuid}`;
const hhmm = (d: string | number) => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

/**
 * Stolning joriy seansi hisobi: barcha buyurtmalar. Kassir butun stolni yoki faqat tanlangan buyurtmalarni
 * (hisobni bo'lib to'lash) to'laydi; hamma buyurtma to'langach seans yopiladi. Ofitsiant faqat ko'radi.
 *
 * Internet yo'q bo'lsa: hisob shu kompyuterdagi oxirgi nusxadan ko'rsatiladi (vaqti bilan), stolga internetsiz
 * ochilgan buyurtmalar ham qo'shiladi; to'lov oflayn navbatga yoziladi (aynan tanlangan buyurtmalar, bitta usul) va
 * internet qaytgach server holati tekshirilib yuboriladi (core/lib/offline.ts → sendTableBill).
 */
export const TableBillSheet: React.FC<{
  table: TableModel | null;
  canPay: boolean;
  onClose: () => void;
  /** To'lovdan keyin stollar ro'yxatini yangilash uchun */
  onChanged: () => void;
}> = ({ table, canPay, onClose, onChanged }) => {
  const toast = useToast();
  const promptShift = useShiftNotOpenPrompt();
  const { methods: payMethods } = usePaymentMethods();
  const queue = useOfflineQueue();
  const [bill, setBill] = useState<TableBill | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Internet yo'q: null — hisob serverdan; raqam — keshdagi nusxa vaqti; 0 — keshda yo'q */
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PayMethod>('CASH');
  /** D14: hisob kassir ko'rganidan o'zgargani haqida ogohlantirish (yangi buyurtma, summa farqi) */
  const [notice, setNotice] = useState<string | null>(null);
  const offline = cachedAt !== null;

  const apply = useCallback(
    (b: TableBill) => {
      setBill(b);
      // Odatada butun stol to'lanadi: tasdiqlangan, to'lanmagan (va to'lovi navbatda bo'lmagan) buyurtmalar oldindan tanlangan
      const server = b.orders.filter((o) => o.billable && !isPaymentQueued(o.uuid)).map((o) => o.uuid);
      const unsent = table ? queuedTableOrders(table.uuid).filter((o) => !isPaymentQueued(o.id)).map((o) => o.id) : [];
      setPicked(new Set([...server, ...unsent]));
    },
    [table],
  );

  const load = useCallback(async () => {
    if (!table) return;
    setLoading(true);
    setError(null);
    try {
      const key = billCacheKey(table.uuid);
      const { data, fromCache } = await withCache(key, () => tablesApi.getTableBill(table.uuid));
      setCachedAt(fromCache ? (cacheGet(key)?.at ?? 0) : null);
      apply(data);
    } catch (e) {
      if (isNetworkError(e)) {
        // Keshda yo'q: faqat stolga internetsiz ochilgan buyurtmalar (bo'lsa) to'lanadi
        setCachedAt(0);
        apply({
          table_uuid: table.uuid,
          table_number: table.table_number,
          session: null,
          orders: [],
          bill: { subtotal: 0, service_charge_amount: 0, total: 0, orders_count: 0 },
        });
      } else {
        setError(getErrorMessage(e, t('bill.loadFail')));
      }
    } finally {
      setLoading(false);
    }
  }, [table, apply]);

  useEffect(() => {
    setBill(null);
    setCachedAt(null);
    setNotice(null);
    if (table) void load();
  }, [table, load]);

  useEffect(() => {
    if (payMethods.length && !payMethods.some((m) => m.value === method)) setMethod(payMethods[0].value);
  }, [payMethods, method]);

  // Har renderda navbatdan o'qiladi (useOfflineQueue navbat o'zgarganda qayta chizadi): to'lovi navbatdagi
  // buyurtma qayta tanlanmaydi — pul ikki marta olinmasin
  const queuedSet = new Set((bill?.orders ?? []).filter((o) => isPaymentQueued(o.uuid)).map((o) => o.uuid));
  const billable = (bill?.orders ?? []).filter((o) => o.billable && !queuedSet.has(o.uuid));
  /** Stolga internetsiz ochilgan, hali serverga yetmagan buyurtmalar (shu xodim navbatidan) */
  const unsent = queue.length && table ? queuedTableOrders(table.uuid) : [];
  const unsentPayable = unsent.filter((o) => !isPaymentQueued(o.id));

  const selectedTotal =
    billable.filter((o) => picked.has(o.uuid)).reduce((s, o) => s + num(o.total_price), 0) +
    unsentPayable.filter((o) => picked.has(o.id)).reduce((s, o) => s + num(o.total), 0);
  const dueTotal = billable.reduce((s, o) => s + num(o.total_price), 0) + unsentPayable.reduce((s, o) => s + num(o.total), 0);
  const dueCount = billable.length + unsentPayable.length;
  const allPicked = billable.length > 0 && billable.every((o) => picked.has(o.uuid));
  const pickedCount = billable.filter((o) => picked.has(o.uuid)).length + unsentPayable.filter((o) => picked.has(o.id)).length;

  const toggle = (uuid: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });

  /** To'lovni oflayn navbatga yozish: aynan tanlangan buyurtmalar, bitta usul */
  const queuePayment = () => {
    if (!table) return;
    try {
      const added = enqueueTablePayment({
        table_uuid: table.uuid,
        order_uuids: billable.filter((o) => picked.has(o.uuid)).map((o) => o.uuid),
        client_uuids: unsentPayable.filter((o) => picked.has(o.id)).map((o) => o.id),
        method,
        label: `${t('table.n', { n: table.table_number })} · ${t('bill.title')}`,
        total: selectedTotal,
      });
      if (!added) {
        toast.error(t('bill.queuedAlready'));
        return;
      }
      toast.success(t('bill.queuedSaved', { n: table.table_number }));
      onChanged();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, t('msg.paySaveFail')));
    }
  };

  const pay = async () => {
    if (!table || !bill || pickedCount === 0) return;
    // Internet yo'q yoki serverga hali yetmagan buyurtma tanlangan — to'g'ridan navbatga
    if (offline || unsentPayable.some((o) => picked.has(o.id))) {
      queuePayment();
      return;
    }
    setSaving(true);
    setNotice(null);
    // D14: doim kassir ko'rgan buyurtmalar ro'yxati yuboriladi (butun stol bo'lsa ham) — kassir hisobni ko'rib
    // turganda ofitsiant qo'shgan buyurtma ko'rilmasdan "to'langan" bo'lib qolmasin
    const seen: SeenBill = {
      billable: billable.map((o) => o.uuid),
      picked: billable.filter((o) => picked.has(o.uuid)).map((o) => ({ uuid: o.uuid, total: o.total_price })),
      wholeTable: allPicked,
    };
    try {
      // To'lovdan oldin serverdagi hisob bilan solishtiriladi: yangi buyurtma yoki taom qo'shilgan bo'lsa — to'lamaymiz
      const fresh = await tablesApi.getTableBill(table.uuid);
      if (billChangedSince(seen, fresh, isPaymentQueued)) {
        apply(fresh);
        setNotice(t('bill.changed'));
        return;
      }
      const next = await tablesApi.payTableBill(table.uuid, method, seen.picked.map((p) => p.uuid));
      onChanged();
      // Tekshiruv va to'lov orasidagi soniyada taom qo'shilgan bo'lsa — server ko'proq yozadi: kassirga farqni aytamiz
      const paidTotal = next.paid ? Number(next.paid.total) : NaN;
      const expected = seenTotal(seen);
      if (Number.isFinite(paidTotal) && paidTotal !== expected) {
        toast.error(t('bill.paidDiff', { paid: formatMoney(paidTotal), seen: formatMoney(expected) }));
        setNotice(t('bill.paidDiff', { paid: formatMoney(paidTotal), seen: formatMoney(expected) }));
      } else {
        toast.success(t('bill.paid'));
      }
      if (next.session) {
        apply(next);
        if (seen.wholeTable && unseenBillable(seen, next, isPaymentQueued) > 0) setNotice((n) => n ?? t('bill.newAfterPay'));
      } else if (!Number.isFinite(paidTotal) || paidTotal === expected) {
        onClose();
      } else {
        apply(next); // stol yopildi, lekin farq ogohlantirishi ko'rinib tursin
      }
    } catch (e) {
      if (isNetworkError(e)) {
        // So'rov yetib borganmi — noma'lum: navbat yuborishdan oldin server holatini tekshiradi (pul ikki marta yozilmaydi)
        queuePayment();
        return;
      }
      // D36: smena ochilmagan — hech narsa to'lanmadi, hisob o'zgarmadi
      if (promptShift(e)) return;
      toast.error(getErrorMessage(e, t('bill.payFail')));
      void load(); // boshqa kassir to'lagan bo'lishi mumkin — yangi holatni ko'rsatamiz
    } finally {
      setSaving(false);
    }
  };

  const showPay = canPay && dueCount > 0;
  const hasContent = !!bill?.session || unsent.length > 0;

  return (
    <Sheet
      open={!!table}
      persistent={saving}
      onClose={onClose}
      size="md"
      title={t('bill.title')}
      subtitle={table ? t('table.n', { n: table.table_number }) : ''}
      footer={
        showPay ? (
          <>
            <Button variant="secondary" size="lg" disabled={saving} onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button size="lg" loading={saving} disabled={pickedCount === 0} onClick={() => void pay()} className="md:min-w-[220px]">
              {t('bill.payBtn', { sum: formatMoney(selectedTotal) })}
            </Button>
          </>
        ) : undefined
      }
    >
      {loading && !bill && <p className="py-8 text-center text-[14px] text-muted">{t('common.loading')}</p>}
      {error && <p className="py-6 text-center text-[14px] font-semibold text-danger-ink">{error}</p>}
      {offline && bill && (cachedAt || hasContent) ? (
        <div className="mb-3 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-[13px] font-semibold text-warning-ink">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{cachedAt ? t('bill.offlineCached', { time: hhmm(cachedAt) }) : t('bill.offlineUnsentOnly')}</span>
        </div>
      ) : null}
      {notice && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-bold text-danger-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      )}
      {bill && !hasContent && (
        <p className="py-8 text-center text-[14px] font-semibold text-muted">
          {offline && !cachedAt ? t('bill.offlineNoCache') : t('bill.noOpen')}
        </p>
      )}
      {bill && hasContent && (
        <>
          <div className="rounded-2xl bg-brand-soft px-4 py-4 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-brand">{t('bill.due')}</div>
              <div className="text-[12px] text-muted">{t('bill.dueCount', { n: dueCount })}</div>
            </div>
            <span className="text-[24px] font-black text-brand tracking-tightest tabular-nums">{formatMoney(dueTotal)}</span>
          </div>

          <ul className="mt-3 space-y-2">
            {bill.orders.map((o) => {
              const queued = queuedSet.has(o.uuid);
              const paid = o.is_paid || queued;
              const selectable = showPay && o.billable && !queued;
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
                        aria-label={t('bill.payAria', { n: o.order_number ?? '' })}
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
                          {o.order_source === 'QR' ? t('table.qr') : o.waiter_name || ''}
                          {o.guest_name ? ` · ${o.guest_name}` : ''}
                        </span>
                        <span className="ml-auto text-[12px] font-bold text-muted">
                          {queued
                            ? t('bill.queued')
                            : paid
                              ? t('card.paid')
                              : o.billable
                                ? o.status_display
                                : o.status === 'PENDING' || o.status === 'NEW'
                                  ? t('bill.notConfirmed')
                                  : o.status_display}
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

          {unsent.length > 0 && (
            <>
              <div className="mt-4 mb-2 text-[13px] font-semibold text-ink">{t('bill.unsentTitle')}</div>
              <ul className="space-y-2">
                {unsent.map((o) => {
                  const queued = isPaymentQueued(o.id);
                  const selectable = showPay && !queued;
                  return (
                    <li key={o.id}>
                      <label
                        className={`flex items-center gap-3 rounded-2xl border border-dashed p-3 ${
                          queued ? 'border-edge bg-field opacity-70' : 'border-warning bg-surface'
                        } ${selectable ? 'cursor-pointer' : ''}`}
                      >
                        {selectable ? (
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[var(--color-brand)]"
                            checked={picked.has(o.id)}
                            onChange={() => toggle(o.id)}
                            aria-label={t('bill.payAria', { n: o.label })}
                          />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-black text-ink">{hhmm(o.created_at)}</span>
                          <span className="block text-[12px] font-bold text-warning-ink">{queued ? t('bill.queued') : t('bill.unsent')}</span>
                        </span>
                        <span className="text-[14px] font-black tabular-nums text-ink">{formatMoney(num(o.total))}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {showPay && (
            <>
              <div className="mt-4 mb-2 text-[13px] font-semibold text-ink">{t('pay.method')}</div>
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
                {t('bill.splitHint')}
              </p>
            </>
          )}
          {!canPay && dueCount > 0 && <p className="mt-3 text-[12px] text-muted">{t('bill.whoPays')}</p>}
        </>
      )}
    </Sheet>
  );
};
