import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Card, CardHeader, InlineAlert, SettingRow, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { ALL_PAY_METHODS, paymentMethodsApi, setPaymentMethodsCache, usePaymentMethods } from '../../../core/lib/payments';
import type { PayMethod } from '../../../core/lib/payments';

const HINTS: Record<PayMethod, string> = {
  CASH: 'Kassada naqd pul qabul qilish',
  CARD: 'Terminal orqali plastik karta (Uzcard / Humo)',
  TRANSFER: "Hisob raqamga pul o'tkazma",
  CLICK: "Click ilovasi orqali to'lov",
  PAYME: "Payme ilovasi orqali to'lov",
};

/**
 * Hamkor qaysi to'lov usullarini qabul qilishi (faqat egasi). Kassa, topshirish va stol hisob-kitobida
 * faqat yoqilgan usullar ko'rinadi; server ham yoqilmagan usulni rad etadi. Kamida bitta usul yoqiq turishi shart.
 */
export const PaymentMethodsCard: React.FC = () => {
  const toast = useToast();
  const { enabled, loading } = usePaymentMethods();
  const [saving, setSaving] = useState<PayMethod | null>(null);

  const toggle = async (code: PayMethod, on: boolean) => {
    const next = on ? [...new Set([...enabled, code])] : enabled.filter((c) => c !== code);
    if (next.length === 0) {
      toast.error("Kamida bitta to'lov usuli yoqiq bo'lishi kerak.");
      return;
    }
    setSaving(code);
    try {
      const saved = await paymentMethodsApi.save(next);
      setPaymentMethodsCache(saved);
      toast.success("To'lov usullari saqlandi");
    } catch (err) {
      toast.error(getErrorMessage(err, "To'lov usullarini saqlab bo'lmadi."));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader title="To'lov usullari" subtitle="Qaysi usullarda to'lov qabul qilasiz" icon={<Wallet className="w-[18px] h-[18px]" />} />
      <div className="divide-y divide-edge">
        {ALL_PAY_METHODS.map((m) => (
          <SettingRow
            key={m.value}
            title={m.label}
            description={HINTS[m.value]}
            control={<Switch checked={enabled.includes(m.value)} disabled={loading || saving !== null} onChange={(v) => void toggle(m.value, v)} label={m.label} />}
          />
        ))}
      </div>
      <InlineAlert tone="info" className="mt-3">
        Yoqilmagan usul kassada va topshirishda ko'rinmaydi. Mijoz ilovasidagi onlayn to'lov (Payme/Click) bu sozlamaga bog'liq emas.
      </InlineAlert>
    </Card>
  );
};
