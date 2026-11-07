import React, { useEffect, useState } from 'react';
import { CheckCircle, UserRound } from 'lucide-react';
import { ordersApi } from '../../services/ordersApi';
import type { QrWaiter } from '../../services/ordersApi';
import { useToast } from '../../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../../core/lib/errors';
import { Button, EmptyState, ErrorState, Sheet, Skeleton } from '../../../../core/ui';

/**
 * Stol buyurtmasiga ofitsiant tanlash (kassada). Xizmat haqi va ofitsiant hisoboti tanlangan ofitsiantga yoziladi —
 * kassir ofitsiant bo'lib qolmaydi.
 * - `qr`     — mehmonning QR buyurtmasini tasdiqlash (filialda ofitsiant bo'lsa tanlash shart);
 * - `ready`  — «Tayyor»: ovqatni kim olib boradi (ofitsiantga push boradi);
 * - `assign` — tayyor / ochiq stolga ofitsiant biriktirish yoki almashtirish.
 */
export type WaiterPickMode = 'qr' | 'ready' | 'assign';

const TEXT: Record<WaiterPickMode, { title: string; ask: string; action: string; none: string; noneAction: string }> = {
  qr: {
    title: 'QR buyurtmani tasdiqlash',
    ask: 'buyurtmani qaysi ofitsiant olib boradi?',
    action: 'Tasdiqlash',
    none: 'Buyurtma ofitsiant biriktirilmasdan tasdiqlanadi.',
    noneAction: 'Tasdiqlash',
  },
  ready: {
    title: 'Buyurtma tayyor',
    ask: 'ovqatni qaysi ofitsiant olib boradi?',
    action: 'Olib borsin',
    none: 'Buyurtma ofitsiantsiz «Tayyor» qilinadi — o‘zingiz olib borasiz.',
    noneAction: 'Tayyor',
  },
  assign: {
    title: 'Ofitsiant biriktirish',
    ask: 'stolga qaysi ofitsiant xizmat qiladi?',
    action: 'Biriktirish',
    none: 'Ofitsiant qo‘shish uchun «Xodimlar» bo‘limiga o‘ting.',
    noneAction: '',
  },
};

export const WaiterPickSheet: React.FC<{
  /** null — yopiq */
  target: { uuid: string; label: string; mode: WaiterPickMode; currentWaiterUuid?: string | null } | null;
  onClose: () => void;
  onDone: () => void;
}> = ({ target, onClose, onDone }) => {
  const toast = useToast();
  const [waiters, setWaiters] = useState<QrWaiter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const orderUuid = target?.uuid;

  useEffect(() => {
    if (!orderUuid) return;
    let alive = true;
    ordersApi
      .getOrderWaiters(orderUuid)
      .then((w) => alive && (setWaiters(w), setError(null)))
      .catch((err) => alive && setError(getErrorMessage(err, "Ofitsiantlar ro'yxatini yuklab bo'lmadi.")));
    return () => {
      alive = false;
      setWaiters(null);
    };
  }, [orderUuid, reload]);

  if (!target) return null;
  const t = TEXT[target.mode];

  const pick = async (waiterUuid: string | null) => {
    setSaving(waiterUuid || 'none');
    try {
      let msg: string | undefined;
      if (target.mode === 'qr') msg = (await ordersApi.confirmQrOrder(target.uuid, waiterUuid))?.message;
      else if (target.mode === 'ready') {
        await ordersApi.markReady(target.uuid, waiterUuid);
        const w = waiters?.find((x) => x.uuid === waiterUuid);
        msg = w ? `${target.label}: tayyor — ${w.name} olib boradi` : `${target.label}: tayyor`;
      } else if (waiterUuid) msg = (await ordersApi.assignWaiter(target.uuid, waiterUuid))?.message;
      toast.success(msg || 'Saqlandi');
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi."));
      setReload((n) => n + 1);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet open onClose={() => !saving && onClose()} size="sm" title={t.title} subtitle={`${target.label} · ${t.ask}`}>
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} className="py-6" />
      ) : waiters === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : waiters.length === 0 ? (
        <div className="space-y-3">
          <EmptyState className="py-6" icon={<UserRound className="w-7 h-7" />} title="Bu filialda faol ofitsiant yo'q" description={t.none} />
          {t.noneAction && (
            <Button block size="lg" icon={<CheckCircle className="w-5 h-5" />} loading={saving === 'none'} onClick={() => pick(null)}>
              {t.noneAction}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {waiters.map((w) => {
            const current = w.uuid === target.currentWaiterUuid;
            return (
              <button
                key={w.uuid}
                type="button"
                disabled={!!saving}
                onClick={() => pick(w.uuid)}
                className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 cursor-pointer ${
                  current ? 'border-brand bg-brand-soft' : 'border-edge bg-surface hover:border-brand/50 hover:bg-brand-soft'
                }`}
              >
                <span className="w-10 h-10 rounded-xl bg-field text-muted flex items-center justify-center shrink-0">
                  <UserRound className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-extrabold text-ink truncate">{w.name}</span>
                  <span className="block text-[12px] text-muted">{current ? 'Hozir biriktirilgan' : w.phone}</span>
                </span>
                <span className="text-[13px] font-bold text-brand shrink-0">{saving === w.uuid ? '…' : t.action}</span>
              </button>
            );
          })}
          {target.mode === 'ready' && (
            <button
              type="button"
              disabled={!!saving}
              onClick={() => pick(null)}
              className="w-full pt-1 text-[13px] font-semibold text-muted hover:text-ink underline-offset-2 hover:underline cursor-pointer disabled:opacity-60"
            >
              {saving === 'none' ? '…' : 'Ofitsiantsiz tayyor qilish (keyin biriktiraman)'}
            </button>
          )}
          <p className="pt-1 text-[12px] text-muted">Tanlangan ofitsiant buyurtmaga biriktiriladi: xizmat haqi va hisoboti unga yoziladi.</p>
        </div>
      )}
    </Sheet>
  );
};
