import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, Clock, CloudOff, Printer, RefreshCw, Trash2, TriangleAlert, Wifi, X } from 'lucide-react';
import { Button, IconButton, Sheet } from '../ui';
import { formatMoney } from '../lib/format';
import { payMethodLabel } from '../lib/payments';
import { getErrorMessage, isStageLocked } from '../lib/errors';
import { t } from '../i18n';
import {
  OFFLINE_SHEET_EVENT,
  dismissSent,
  flushQueue,
  isPaymentItem,
  getQueue,
  isShiftWaiting,
  queueWhat,
  releaseShiftWait,
  shiftWaitCount,
  removeQueued,
  retryQueued,
  summarizeQueue,
  useOfflineQueue,
  markSentPrinted,
  useOnline,
  useSentPayments,
  type QueuedOrder,
  type SentPayment,
} from '../lib/offline';
import { SHIFT_EVENT, type Shift } from '../../features/shifts/services/shiftApi';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { markKitchenPrinted } from '../../features/orders/kitchenPrinted';
import type { Order } from '../../features/orders/services/ordersApi';
import { printReceipt } from '../../features/orders/utils/printing';

const RETRY_MS = 20_000;

/** Smena sahifasi (HashRouter) — bu panel routerdan tashqarida ham chiziladi, shuning uchun useNavigate emas */
const goShift = () => {
  window.location.hash = '#/shift';
};

const payText = (o: QueuedOrder) => {
  const p = o.payment;
  if (!p) return null;
  if (p.table_bill) {
    const n = p.table_bill.order_uuids.length + (p.table_bill.client_uuids?.length || 0);
    return t('offline.payTable', { method: payMethodLabel(p.method), n });
  }
  // Oldindan to'lov faqat o'z-o'ziga xizmat zalida; yetkazish/olib ketish/stolda — shunchaki «to'langan»
  if (!p.collect) return t(p.self_service ? 'offline.payPrepaid' : 'offline.payPaid');
  if (p.payments && p.payments.length > 1) return `To'lov: ${p.payments.map((x) => `${payMethodLabel(x.method)} ${formatMoney(x.amount)}`).join(' + ')}`;
  return `To'lov: ${payMethodLabel(p.method)}`;
};

/**
 * Oflayn holat paneli: internet yo'qligi va navbatdagi to'lov/buyurtmalar soni ko'rinadi.
 * Aloqa tiklanganda (va har 20 soniyada) navbat serverga yuboriladi; server rad etganlari
 * ro'yxatda qoladi — kassir qayta urinadi yoki o'chiradi (to'lovni o'chirish — alohida ogohlantirish bilan).
 * `receipts={false}` — kassa yopiq bosqich (1-bosqich, Q48/Q56): navbat baribir yuboriladi, lekin chek taklif
 * qilinmaydi (backend `receipt/` 403 STAGE_LOCKED); yetib borgan to'lovlar «pul hisobga olindi» deb ko'rinadi.
 */
export const OfflineSync: React.FC<{ receipts?: boolean }> = ({ receipts = true }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const online = useOnline();
  const queue = useOfflineQueue();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sum = summarizeQueue(queue);
  const failed = queue.filter((o) => o.error);
  // D36: smenani kutayotganlar — rad emas, lekin hozir yuborilmaydi (smena ochilgach o'zi ketadi)
  const shiftWait = queue.filter(isShiftWaiting).length;
  const pending = sum.pending - shiftWait;
  const sendingWhat = queueWhat(summarizeQueue(queue.filter((o) => !isShiftWaiting(o))));
  const sentPays = useSentPayments();
  const unprinted = sentPays.filter((s) => !s.printed).length;
  // Kassa yopiq bosqichda: chek yo'q, lekin yetib borgan to'lovlar ko'rinib turadi (kassir pul yo'qoldi deb qo'rqmasin)
  const sentNotice = receipts ? unprinted : sentPays.length;
  const [printing, setPrinting] = useState<string | null>(null);

  /** Chek faqat kassir bosganda (egasi qarori): stol hisobida har buyurtmaning cheki ketma-ket chiqadi */
  const printSent = async (s: SentPayment) => {
    setPrinting(s.id);
    try {
      for (const uuid of s.order_uuids) await printReceipt(uuid, true);
      markSentPrinted(s.id);
    } catch (err) {
      // Bosqich pasaytirilgan (403 STAGE_LOCKED): chek yo'q, to'lov esa serverda — xato ko'rsatilmaydi
      if (!isStageLocked(err)) toast.error(getErrorMessage(err, t('offline.receiptFail')));
    } finally {
      setPrinting(null);
    }
  };

  /** `manual` — kassir «Hozir yuborish»ni bosdi: qayta urinish kechikishi kutilmaydi */
  const sync = useCallback(async (manual = false) => {
    setSyncing(true);
    try {
      const waitBefore = shiftWaitCount(getQueue());
      const { sent, failed: nFailed, deferred } = await flushQueue({ force: manual });
      // D36: yangi «smena ochilmagan» yozuv paydo bo'ldi (yoki kassir bosdi, smena hali yopiq) — bir marta aytiladi
      const waitAfter = shiftWaitCount(getQueue());
      if (manual && deferred && !sent.length) toast.error("Server hozir javob bermayapti — navbat keyinroq o'zi yuboriladi");
      // Oflayn paytda oshxona cheki chiqqan — oshxona printeri ularni qayta chiqarmasin (faqat yaratilgan buyurtmalar)
      sent.forEach(({ queued, order }) => !isPaymentItem(queued) && order && markKitchenPrinted(order as Order));
      const nPay = sent.filter((s) => isPaymentItem(s.queued)).length;
      const what = queueWhat({ payments: nPay, orders: sent.length - nPay });
      if (what) toast.success(`Oflayn ${what} serverga yuborildi`);
      if (nFailed) {
        toast.error(`${nFailed} ta oflayn yozuvni server qabul qilmadi — tekshiring`);
        setOpen(true); // to'lov jimgina qolib ketmasin: kassir darhol ko'radi
      }
      if (waitAfter > waitBefore || (manual && waitAfter)) toast.error(t('offline.shiftWaitToast', { n: waitAfter }));
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!online || pending === 0) return;
    const first = setTimeout(() => void sync(), 0);
    const t = setInterval(() => void sync(), RETRY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [online, pending, sync]);

  // Smena ochildi (shu yoki boshqa qurilmada — holat qatori har daqiqada so'raydi): kutayotganlar yuboriladi
  useEffect(() => {
    const onShift = (e: Event) => {
      const shift = (e as CustomEvent<Shift | null>).detail;
      if (shift && shift.status !== 'CLOSED') releaseShiftWait(shift.filial_uuid);
    };
    window.addEventListener(SHIFT_EVENT, onShift);
    return () => window.removeEventListener(SHIFT_EVENT, onShift);
  }, []);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OFFLINE_SHEET_EVENT, show);
    return () => window.removeEventListener(OFFLINE_SHEET_EVENT, show);
  }, []);

  if (online && queue.length === 0 && sentNotice === 0 && !open) return null;

  const remove = async (o: QueuedOrder) => {
    const pay = o.payment;
    const msg = pay?.collect
      ? `«${o.label}» to'lovi (${formatMoney(o.total)}) serverga yuborilmaydi. Pul kassada bo'lsa — buyurtmani ochib to'lovni qayta qabul qiling yoki menejerga ayting, aks holda smenada naqd mos kelmaydi.`
      : pay
        ? `«${o.label}» yakunlanishi serverga yuborilmaydi.`
        : `«${o.label}» buyurtmasi navbatdan o'chiriladi va serverga yuborilmaydi.`;
    const ok = await confirm(msg, {
      title: pay ? "To'lovni navbatdan o'chirish" : "Navbatdan o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (ok) removeQueued(o.id);
  };

  const what = queueWhat(sum);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-bold cursor-pointer ${
          !online ? 'bg-danger text-white' : failed.length || (shiftWait && !pending) ? 'bg-warning-soft text-warning-ink' : 'bg-info-soft text-info'
        }`}
      >
        {!online ? <CloudOff className="w-4 h-4" /> : failed.length ? <TriangleAlert className="w-4 h-4" /> : shiftWait && !pending ? <Clock className="w-4 h-4" /> : !pending ? (receipts ? <Printer className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />) : <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />}
        {!online
          ? what
            ? `Oflayn — ${what} kutmoqda`
            : `Internet yo'q — kassa oflayn ishlayapti${failed.length ? ` · ${failed.length} ta yozuv hal qilinmagan` : ''}`
          : failed.length
            ? `${failed.length} ta oflayn yozuvni server qabul qilmadi — hal qiling`
            : pending
              ? `Yuborilmoqda: ${sendingWhat}…`
              : shiftWait
                ? t('offline.shiftWaitBar', { n: shiftWait })
              : t(receipts ? 'offline.sentBar' : 'offline.sentBarSaved', { n: sentNotice })}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} size="sm" title="Oflayn navbat" subtitle={online ? 'Internet bor' : "Internet yo'q — to'lov va buyurtmalar shu kompyuterda saqlanmoqda"}>
        <div className="space-y-2">
          {queue.map((o) => (
            <div key={o.id} className={`rounded-2xl px-4 py-3 ${o.error ? 'bg-danger-soft' : isShiftWaiting(o) ? 'bg-warning-soft' : 'bg-field'}`}>
              <div className="flex items-center gap-2">
                {o.payment && <Banknote className="w-5 h-5 shrink-0 text-muted" aria-hidden />}
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold truncate">{o.label}</span>
                  <span className="block text-[12px] text-muted truncate">
                    {new Date(o.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} · {formatMoney(o.total)}
                    {o.payment ? ` · ${payText(o)}` : ''}
                  </span>
                </span>
                {(o.error || isShiftWaiting(o)) && (
                  <IconButton label="Qayta urinish" onClick={() => retryQueued(o.id)}>
                    <RefreshCw className="w-[18px] h-[18px]" />
                  </IconButton>
                )}
                <IconButton label="O'chirish" onClick={() => remove(o)}>
                  <Trash2 className="w-[18px] h-[18px] text-danger-ink" />
                </IconButton>
              </div>
              {o.error && <p className="mt-1 text-[13px] font-semibold text-danger-ink">{o.error}</p>}
              {!o.error && o.retry_at && <p className="mt-1 text-[13px] text-muted">Server vaqtincha javob bermadi — o'zi qayta yuboriladi</p>}
              {isShiftWaiting(o) && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="flex-1 min-w-0 text-[13px] font-semibold text-warning-ink">{t('offline.shiftWait')}</p>
                  <Button
                    variant="secondary"
                    icon={<Clock className="w-4 h-4" />}
                    onClick={() => {
                      setOpen(false);
                      goShift();
                    }}
                  >
                    {t('shiftGate.open')}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {queue.length === 0 && <p className="text-[14px] text-muted">Navbat bo'sh.</p>}
        </div>
        {sentPays.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[13px] font-bold text-ink">{t('offline.sentTitle')}</span>
              <button type="button" className="text-[12px] font-semibold text-muted hover:text-ink cursor-pointer" onClick={() => dismissSent()}>
                {t('offline.sentClear')}
              </button>
            </div>
            <p className="mt-0.5 mb-2 text-[12px] text-muted">{t(receipts ? 'offline.sentHint' : 'offline.sentHintSaved')}</p>
            <div className="space-y-2">
              {[...sentPays].reverse().map((s) => (
                <div key={s.id} className="rounded-2xl bg-brand-soft px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold truncate">{s.label}</span>
                    <span className="block text-[12px] text-muted truncate">
                      {new Date(s.sent_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} · {formatMoney(s.total)}
                    </span>
                  </span>
                  {receipts && (
                    <Button
                      variant={s.printed ? 'secondary' : 'primary'}
                      icon={<Printer className="w-4 h-4" />}
                      loading={printing === s.id}
                      disabled={!!printing && printing !== s.id}
                      onClick={() => void printSent(s)}
                    >
                      {t(s.printed ? 'offline.receiptAgain' : 'offline.receipt')}
                    </Button>
                  )}
                  <IconButton label={t('offline.sentHide')} onClick={() => dismissSent(s.id)}>
                    <X className="w-[18px] h-[18px]" />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>
        )}
        {failed.some((o) => o.payment?.collect) && (
          <p className="mt-3 text-[13px] text-muted">
            Rad etilgan to'lov o'zi qayta yuborilmaydi. Sababni hal qilib «Qayta urinish»ni bosing yoki menejerga ayting.
          </p>
        )}
        <Button className="mt-4" block icon={<Wifi className="w-4 h-4" />} disabled={!online || pending + shiftWait === 0} loading={syncing} onClick={() => void sync(true)}>
          Hozir yuborish
        </Button>
      </Sheet>
    </>
  );
};
