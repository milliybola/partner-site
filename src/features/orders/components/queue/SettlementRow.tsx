import React, { useState } from 'react';
import { HandCoins } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { ordersApi } from '../../services/ordersApi';
import { useConfirm } from '../../../../core/components/ConfirmProvider';
import { useToast } from '../../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../../core/lib/errors';
import { formatMoney } from '../../../../core/lib/format';
import { t } from '../../../../core/i18n';

/**
 * MilliyGo (umumiy) kuryeri bilan qo'lma-qo'l hisob-kitob (A yo'li, 2026-11-27):
 *  - naqd buyurtma: kuryer olib ketishda restoranga «jami − kuryer haqi» to'laydi;
 *  - onlayn / to'langan: restoran kuryerga kuryer haqini beradi.
 * Restoran tasdiqlamaydi: kuryer «To'ladim» bosadi; pul kelmagan bo'lsa — «Pul olinmadi» (operatorga xabar).
 * Hamkorning o'z kuryerida `settlement` yo'q — hech narsa ko'rinmaydi.
 */
export const SettlementRow: React.FC<{ order: Order; onPatched: (patch: Partial<Order>) => void }> = ({ order, onPatched }) => {
  const s = order.settlement;
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!s) return null;

  const done = !!s.settled_at;
  const pay = s.pay_to_restaurant > 0;
  const amount = pay ? s.pay_to_restaurant : s.take_from_restaurant;
  const text = pay
    ? t(done ? 'settle.courierPaid' : 'settle.courierPays', { sum: formatMoney(amount) })
    : amount > 0
      ? t(done ? 'settle.gaveCourier' : 'settle.giveCourier', { sum: formatMoney(amount) })
      : t('settle.none');

  const dispute = async () => {
    const ok = await confirm(t('settle.disputeAsk', { sum: formatMoney(amount) }), {
      title: t('settle.disputeTitle'),
      danger: true,
      confirmText: t('settle.disputeBtn'),
      cancelText: t('common.close'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await ordersApi.settlementDispute(order.uuid);
      if (r?.settlement) onPatched({ settlement: r.settlement });
      toast.success(r?.message || t('settle.disputeSent'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('settle.disputeFail')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${pay ? 'bg-brand-soft text-brand' : 'bg-gold/20 text-ink'}`}>
        <HandCoins className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-muted">{t('settle.label', { fee: formatMoney(s.courier_fee) })}</div>
        <div className="text-[14px] font-semibold text-ink">{text}</div>
        {s.disputed_at ? (
          <div className="mt-1 text-[12px] font-semibold text-danger">{t('settle.disputed')}</div>
        ) : done && pay ? (
          <button
            type="button"
            disabled={busy}
            onClick={dispute}
            className="mt-1 text-[12px] font-semibold text-danger hover:underline underline-offset-2 disabled:opacity-60 cursor-pointer"
          >
            {busy ? '…' : t('settle.disputeBtn')}
          </button>
        ) : null}
      </div>
    </div>
  );
};
