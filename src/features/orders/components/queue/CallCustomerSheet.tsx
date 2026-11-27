import React, { useState } from 'react';
import { CheckCircle, Phone, PhoneOff, ShieldAlert } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { Button, Sheet } from '../../../../core/ui';
import { formatMoney, formatPhone } from '../../../../core/lib/format';
import { t } from '../../../../core/i18n';
import { orderNo } from './actions';

/**
 * Ilovadan kelgan buyurtmani qabul qilish oldidan: mijozga qo'ng'iroq qilib, buyurtma haqiqiyligini,
 * tarkibi/summasini va (yetkazishda) manzilni tasdiqlash. Mijozlar hali bunga o'rganmagan — soxta yoki
 * adashib berilgan buyurtma tayyorlanib, pul yo'qolmasin. Har gal ko'rsatiladi (xodimni o'rgatish uchun).
 */
export const CallCustomerSheet: React.FC<{
  /** null — yopiq */
  order: Order | null;
  onClose: () => void;
  onAccept: (order: Order) => void;
  onReject: (order: Order) => void;
}> = ({ order, onClose, onAccept, onReject }) => {
  /** Qaysi buyurtma uchun «Qo'ng'iroq qilish» bosilgan (boshqa buyurtma ochilsa — qaytadan) */
  const [calledUuid, setCalledUuid] = useState<string | null>(null);
  if (!order) return null;
  const called = calledUuid === order.uuid;

  const phone = order.contact_phone?.trim();
  const telHref = phone ? `tel:${phone.startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}` : undefined;
  const delivery = order.delivery_type === 'DELIVERY';
  const checks = [t('callCheck.real'), t('callCheck.items', { sum: formatMoney(order.total_price) }), ...(delivery ? [t('callCheck.address')] : [])];

  return (
    <Sheet open onClose={onClose} size="sm" title={t('callCheck.title')} subtitle={orderNo(order)}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-gold/15 px-4 py-3">
          <ShieldAlert className="w-5 h-5 shrink-0 text-ink mt-0.5" />
          <p className="text-[13px] leading-relaxed text-ink">{t('callCheck.why')}</p>
        </div>

        <div className="rounded-2xl border border-edge px-4 py-3 text-center">
          {order.contact_name && <div className="text-[13px] font-semibold text-muted">{order.contact_name}</div>}
          <div className="text-[24px] font-black tracking-tightest tabular-nums text-ink">{formatPhone(phone)}</div>
          {telHref && (
            <a
              href={telHref}
              onClick={() => setCalledUuid(order.uuid)}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-white font-bold text-[15px] hover:bg-brand-dark transition"
            >
              <Phone className="w-5 h-5" />
              {t('callCheck.call')}
            </a>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-bold text-ink">{t('callCheck.ask')}</div>
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c} className="flex items-start gap-2 text-[13px] text-muted">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-brand" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 pt-1">
          <Button block size="lg" variant={called ? 'primary' : 'outline'} icon={<CheckCircle className="w-5 h-5" />} onClick={() => onAccept(order)}>
            {t('callCheck.accept')}
          </Button>
          <Button block size="lg" variant="danger-soft" icon={<PhoneOff className="w-5 h-5" />} onClick={() => onReject(order)}>
            {t('callCheck.reject')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
