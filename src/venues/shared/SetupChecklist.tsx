import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Circle, Rocket, X } from 'lucide-react';
import apiClient from '../../core/api/client';
import { Card, IconButton } from '../../core/ui';
import { escposPrinter } from '../../core/lib/printerConfig';
import { getPartner, isShop } from '../../core/lib/session';
import { useTariff } from '../../core/lib/tariff';
import { usePlatformConfig } from '../../core/lib/platformStage';

interface Step {
  key: string;
  title: string;
  hint: string;
  to: string;
  done: boolean;
  optional?: boolean;
}

const dismissKey = () => `milliygo_setup_dismissed_${getPartner()?.uuid || ''}`;
const readDismissed = () => {
  try {
    return localStorage.getItem(dismissKey()) === '1';
  } catch {
    return false;
  }
};

/**
 * «Ishga tushirish» — yangi hamkor uchun bosh sahifadagi qadamlar ro'yxati (faqat rahbar ko'radi).
 * Bajarilgani mavjud ma'lumotdan aniqlanadi; hammasi bajarilsa yoki yopilsa — ko'rinmaydi.
 */
export const SetupChecklist: React.FC = () => {
  const shop = isShop();
  const { tariff, loading } = useTariff();
  // Stollar — 2-bosqich (Q50); 1-bosqichda printer — faqat oshxona cheki (Q51)
  const { pos: posStage } = usePlatformConfig();
  const [hours, setHours] = useState<boolean | null>(null);
  const [telegram, setTelegram] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (dismissed) return;
    let alive = true;
    apiClient
      .get('partner/me/')
      .then((r) => alive && setHours(!!(r.data?.data || r.data)?.opening_hours))
      .catch(() => alive && setHours(true));
    apiClient
      .get('partner/telegram-report/')
      .then((r) => alive && setTelegram(!!r.data?.data?.linked))
      .catch(() => alive && setTelegram(true)); // eski server — qadamni ko'rsatmaymiz
    return () => {
      alive = false;
    };
  }, [dismissed]);

  if (dismissed || loading || hours === null || telegram === null) return null;

  const steps: Step[] = [
    {
      key: 'menu',
      title: shop ? 'Mahsulotlarni kiriting' : 'Menyuni kiriting',
      hint: "Excel'dan bir martada yuklang — bittalab kiritish shart emas",
      to: '/catalog',
      done: tariff.usage.products > 0,
    },
    { key: 'hours', title: 'Ish vaqtini belgilang', hint: 'Mijozlar qachon buyurtma bera olishini biladi', to: '/profile', done: hours },
    ...(!shop && posStage && tariff.allow_dine_in
      ? [{ key: 'tables', title: "Stollarni qo'shing", hint: 'Zal buyurtmalari va QR menyu uchun', to: '/tables', done: tariff.usage.tables > 0 }]
      : []),
    {
      key: 'printer',
      title: posStage ? 'Chek printerini ulang' : 'Oshxona printerini ulang',
      hint: posStage ? 'Ixtiyoriy — brauzer orqali ham chop etiladi' : 'Ixtiyoriy — ilova buyurtmasi oshxonaga qog‘ozda chiqadi',
      to: '/settings',
      done: !!(escposPrinter('receipt') || escposPrinter('kitchen')),
      optional: true,
    },
    {
      key: 'telegram',
      title: "Kunlik hisobotni Telegram'ga ulang",
      hint: 'Har kuni yopilgandan keyin tushum va top taomlar',
      to: '/settings',
      done: telegram,
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  if (required.every((s) => s.done)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(), '1');
    } catch {
      /* storage blocked */
    }
    setDismissed(true);
  };

  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-extrabold text-ink">Ishga tushirish</div>
          <div className="text-[13px] text-muted">
            {doneCount} / {steps.length} bajarildi · 10 daqiqada tayyor
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-field overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        </div>
        <IconButton label="Yashirish" onClick={dismiss}>
          <X className="w-4 h-4" />
        </IconButton>
      </div>
      <ul className="divide-y divide-edge">
        {steps.map((s) => (
          <li key={s.key}>
            <Link to={s.to} className="flex items-center gap-3 py-2.5 group">
              {s.done ? <CheckCircle2 className="w-5 h-5 text-brand shrink-0" /> : <Circle className="w-5 h-5 text-muted shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className={`block text-[14px] font-bold ${s.done ? 'text-muted line-through' : 'text-ink'}`}>{s.title}</span>
                {!s.done && <span className="block text-[12px] text-muted">{s.hint}</span>}
              </span>
              {!s.done && <ChevronRight className="w-4 h-4 text-muted group-hover:text-ink" />}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
};
