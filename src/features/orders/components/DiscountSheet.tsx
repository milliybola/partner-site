import React, { useEffect, useState } from 'react';
import { BadgePercent, Check } from 'lucide-react';
import { Button, InlineAlert, Input, Segmented, Sheet } from '../../../core/ui';
import { formatMoney } from '../../../core/lib/format';
import { errorCode, getErrorMessage } from '../../../core/lib/errors';
import { STAGE, usePlatformConfig } from '../../../core/lib/platformStage';
import { getPartner, isOwner } from '../../../core/lib/session';
import { t } from '../../../core/i18n';
import { useToast } from '../../../core/components/ToastProvider';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { manualDiscountPreview } from '../utils/posCart';
import type { ManualDiscountInput } from '../utils/posCart';

/**
 * Qo'lda chegirma (A10) — faqat menejer va rahbar, 2-bosqichda (backend ham tekshiradi: 403/STAGE_LOCKED).
 * Kassir va ofitsiant tugmani ko'rmaydi. Server — haqiqat manbai: bu yerda faqat oldindan ko'rinish.
 */
export const useCanDiscount = (): boolean => {
  const { stage } = usePlatformConfig();
  const p = getPartner();
  return stage >= STAGE.POS && (isOwner(p) || p?.role === 'manager');
};

/** Buyurtmaga chegirma berish mumkinmi (to'lanmagan, yopilmagan, onlayn to'lovsiz) — server qoidasi bilan bir xil */
export const discountableOrder = (o: { status?: string; is_paid?: boolean; payment_method?: string } | null | undefined): boolean =>
  !!o &&
  !o.is_paid &&
  !['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status || '') &&
  !['PAYME', 'CLICK'].includes(String(o.payment_method || '').toUpperCase());

const PERCENTS = [5, 10, 15, 20];
const REASONS = ['disc.reasonRegular', 'disc.reasonComplaint', 'disc.reasonStaff', 'disc.reasonGuest'] as const;
const OTHER = '__other__';
const MIN_REASON = 3;

export interface DiscountSheetProps {
  open: boolean;
  onClose: () => void;
  orderUuid: string;
  /** Sarlavhada: «3-stol · #1024» */
  label: string;
  /** Taomlar summasi — qo'lda chegirmadan OLDIN (aksiya ayirilgan) */
  subtotal: number;
  serviceChargePercent?: number;
  deliveryFee?: number;
  /** Amaldagi chegirma (bo'lsa — «Olib tashlash» chiqadi) */
  current?: { amount: number; percent: number; reason?: string } | null;
  /** Server javobi (yangilangan buyurtma) — chaqiruvchi summani yangilaydi */
  onDone: (order: Order | null) => void;
}

export const DiscountSheet: React.FC<DiscountSheetProps> = ({ open, onClose, orderUuid, label, subtotal, serviceChargePercent = 0, deliveryFee = 0, current, onDone }) => {
  const toast = useToast();
  const hasCurrent = !!current && current.amount > 0;
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [percent, setPercent] = useState<number | null>(null);
  const [percentText, setPercentText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState<string>('');
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState<'apply' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Har ochilishda amaldagi chegirmadan boshlanadi (o'zgartirish — bir-ikki bosish)
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(null);
    if (hasCurrent && current!.percent > 0) {
      setMode('percent');
      const preset = PERCENTS.includes(current!.percent);
      setPercent(preset ? current!.percent : null);
      setPercentText(preset ? '' : String(current!.percent));
      setAmountText('');
    } else if (hasCurrent) {
      setMode('amount');
      setPercent(null);
      setPercentText('');
      setAmountText(String(Math.round(current!.amount)));
    } else {
      setMode('percent');
      setPercent(null);
      setPercentText('');
      setAmountText('');
    }
    const r = current?.reason || '';
    const presetReason = REASONS.find((k) => t(k) === r);
    setReason(presetReason ? t(presetReason) : r ? OTHER : '');
    setOther(presetReason ? '' : r);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat ochilganda
  }, [open]);

  const typedPercent = Number(percentText.replace(',', '.'));
  const typedAmount = Number(amountText.replace(/\s/g, ''));
  const input: ManualDiscountInput | null =
    mode === 'percent'
      ? percent !== null
        ? { percent }
        : percentText.trim() && Number.isFinite(typedPercent) && typedPercent > 0 && typedPercent <= 100
          ? { percent: Number(typedPercent.toFixed(2)) }
          : null
      : amountText.trim() && Number.isFinite(typedAmount) && typedAmount > 0
        ? { amount: Math.round(typedAmount) }
        : null;
  const tooBig = !!input && 'amount' in input && input.amount > subtotal;
  const finalReason = reason === OTHER ? other.trim() : reason;
  const reasonOk = finalReason.length >= MIN_REASON;
  const preview = input && !tooBig ? manualDiscountPreview(subtotal, input, serviceChargePercent, deliveryFee) : null;
  const canApply = !!preview && preview.discount > 0 && reasonOk && !saving;

  const submit = async (kind: 'apply' | 'remove') => {
    if (saving) return;
    if (kind === 'apply' && (!input || !canApply)) return;
    setSaving(kind);
    setError(null);
    try {
      const res =
        kind === 'remove'
          ? await ordersApi.applyDiscount(orderUuid, { percent: 0 })
          : await ordersApi.applyDiscount(orderUuid, { ...input!, reason: finalReason });
      const d = Math.round(Number(res?.manual_discount_amount) || 0);
      toast.success(kind === 'apply' && d > 0 ? t('disc.applied', { sum: formatMoney(d) }) : t('disc.removed'));
      onDone(res ?? null);
      onClose();
    } catch (err) {
      // To'langan: umumiy «tarkibini o'zgartirib bo'lmaydi» o'rniga chegirmaga mos matn
      setError(errorCode(err) === 'ORDER_PAID' ? t('err.discountPaid') : getErrorMessage(err, t('disc.fail')));
      setSaving(null);
    }
  };

  const chip = (on: boolean) =>
    `min-h-[48px] px-3 rounded-2xl border text-[15px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer tabular-nums ${
      on ? 'border-brand bg-brand-soft text-brand' : 'border-edge bg-surface text-ink hover:bg-field'
    }`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      persistent={!!saving}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <BadgePercent className="w-5 h-5 text-brand" />
          {t('disc.title', { n: label })}
        </span>
      }
      subtitle={t('disc.products', { sum: formatMoney(subtotal) })}
      footer={
        <div className="w-full space-y-2">
          {preview && preview.discount > 0 && (
            <div className="flex items-center justify-between text-[14px] font-semibold">
              <span className="text-brand">
                {t('disc.line')} −{formatMoney(preview.discount)}
              </span>
              <span className="text-ink">
                {t('disc.newTotal')}: <span className="font-black tabular-nums">{formatMoney(preview.total)}</span>
              </span>
            </div>
          )}
          <div className="flex gap-2">
            {hasCurrent && (
              <Button variant="danger-soft" size="lg" className="shrink-0" loading={saving === 'remove'} disabled={!!saving} onClick={() => submit('remove')}>
                {t('disc.remove')}
              </Button>
            )}
            <Button size="lg" className="flex-1" loading={saving === 'apply'} disabled={!canApply} onClick={() => submit('apply')}>
              {t('disc.apply')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          options={[
            { value: 'percent', label: t('disc.percent') },
            { value: 'amount', label: t('disc.amount') },
          ]}
        />

        {mode === 'percent' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              {PERCENTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={percent === n}
                  onClick={() => {
                    setPercent(n);
                    setPercentText('');
                  }}
                  className={chip(percent === n)}
                >
                  {n}%
                </button>
              ))}
            </div>
            <Input
              inputMode="decimal"
              placeholder={t('disc.otherPercent')}
              value={percentText}
              onChange={(e) => {
                setPercentText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5));
                setPercent(null);
              }}
              rightSlot={<span className="px-3 text-muted font-bold">%</span>}
            />
          </div>
        ) : (
          <Input
            inputMode="numeric"
            autoFocus
            placeholder={t('disc.amountPlaceholder')}
            value={amountText ? Number(amountText).toLocaleString('uz-UZ') : ''}
            onChange={(e) => setAmountText(e.target.value.replace(/\D/g, '').slice(0, 10))}
            error={tooBig ? t('err.discountTooBig') : null}
          />
        )}

        <div className="space-y-2">
          <div className="text-[12px] font-bold uppercase tracking-wider text-subtle">{t('disc.reason')}</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('disc.reason')}>
            {[...REASONS.map((k) => t(k)), OTHER].map((r) => {
              const on = reason === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setReason(r)}
                  className={`${chip(on)} !text-[14px] !font-semibold text-left`}
                >
                  {on && <Check className="w-4 h-4 shrink-0" />}
                  <span>{r === OTHER ? t('disc.reasonOther') : r}</span>
                </button>
              );
            })}
          </div>
          {reason === OTHER && (
            <textarea
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder={t('disc.reasonPlaceholder')}
              className="w-full rounded-2xl bg-field border border-transparent px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:outline-none focus:bg-surface focus:border-brand/40 focus:ring-4 focus:ring-brand/10 resize-none"
            />
          )}
        </div>

        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      </div>
    </Sheet>
  );
};
