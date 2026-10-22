import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Lock } from 'lucide-react';
import { Badge, Card, CardHeader, InlineAlert, PageHeader, Skeleton } from '../../../core/ui';
import { limitText, useTariff } from '../../../core/lib/tariff';
import type { PartnerTariff } from '../../../core/lib/tariff';

const FEATURE_TEXT: Record<string, string> = {
  pickup: 'Olib ketish buyurtmalari',
  dine_in: 'Zal va stollar',
  tables: 'Stollar limiti',
  filials: 'Filiallar limiti',
};

const Feature: React.FC<{ on: boolean; title: string; hint?: string }> = ({ on, title, hint }) => (
  <li className="flex items-start gap-3 py-3">
    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${on ? 'bg-brand-soft text-brand' : 'bg-field text-subtle'}`}>
      {on ? <Check className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
    </span>
    <div className="min-w-0">
      <div className={`text-[15px] font-bold ${on ? 'text-ink' : 'text-muted'}`}>{title}</div>
      {hint && <div className="text-[13px] text-muted">{hint}</div>}
    </div>
  </li>
);

const Usage: React.FC<{ label: string; used: number; max: number | null }> = ({ label, used, max }) => {
  const pct = max === null ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-[14px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-muted">{used} / {limitText(max)}</span>
      </div>
      {max !== null && (
        <div className="mt-1.5 h-2 rounded-full bg-field overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-danger' : 'bg-brand-bright'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

const summary = (t: PartnerTariff) =>
  t.restricted ? `«${t.name}» tarifi` : 'Tarif belgilanmagan — barcha imkoniyatlar ochiq';

/** Hamkor tarifi: ochiq imkoniyatlar, limitlar va hozirgi foydalanish. */
const PlanPage: React.FC = () => {
  const { tariff, loading } = useTariff();
  const [params] = useSearchParams();
  const need = params.get('need');

  return (
    <div className="pb-8">
      <PageHeader title="Tarif" subtitle={loading ? 'Yuklanmoqda…' : summary(tariff)} badge={tariff.restricted ? <Badge tone="brand">{tariff.name}</Badge> : undefined} />

      <div className="mt-2 space-y-4 max-w-2xl">
        {need && FEATURE_TEXT[need] && (
          <InlineAlert tone="warning">
            «{FEATURE_TEXT[need]}» sizning tarifingizda mavjud emas. Tarifni oshirish uchun MilliyGo qo'llab-quvvatlash xizmatiga murojaat qiling.
          </InlineAlert>
        )}

        {loading ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <Card>
              <CardHeader title="Imkoniyatlar" subtitle="Tarifingizga kiritilgan xizmatlar" />
              <ul className="divide-y divide-edge">
                <Feature on title="Yetkazib berish" hint="Kuryer orqali mijoz manziliga" />
                <Feature on={tariff.allow_pickup} title="Olib ketish" hint={tariff.allow_pickup ? "Mijoz o'zi kelib oladi" : "Tarifni oshirsangiz ochiladi"} />
                <Feature on={tariff.allow_dine_in} title="Zal va stollar" hint={tariff.allow_dine_in ? 'Stol buyurtmalari, ofitsiantlar' : 'Tarifni oshirsangiz ochiladi'} />
              </ul>
            </Card>

            <Card>
              <CardHeader title="Limitlar" subtitle="Hozirgi foydalanish" />
              <div className="space-y-4">
                <Usage label="Filiallar" used={tariff.usage.filials} max={tariff.max_filials} />
                {tariff.allow_dine_in && <Usage label="Stollar" used={tariff.usage.tables} max={tariff.max_tables} />}
              </div>
              {!tariff.can_add_filial && (
                <p className="mt-4 text-[13px] text-muted">Filial limiti to'lgan. Yangi filial qo'shish uchun tarifni oshiring.</p>
              )}
            </Card>

            <p className="text-[13px] text-muted">
              Tarifni o'zgartirish yoki yangi imkoniyat ulash uchun MilliyGo qo'llab-quvvatlash xizmatiga yozing.{' '}
              <Link to="/" className="text-brand font-semibold">Bosh sahifa</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default PlanPage;
