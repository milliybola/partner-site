import React, { useEffect, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, ShoppingBag, XCircle } from 'lucide-react';
import { Badge, ErrorState, LoadingState, Segmented, Sheet, StatCard } from '../../../core/ui';
import { formatMoney, formatPhone } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { staffApi } from '../services/staffApi';
import type { StaffDetailsResponse, StaffMember, StaffPeriodStats } from '../services/staffApi';
import { ROLE_LABEL } from './StaffFormSheet';

type Period = 'today' | 'week' | 'month' | 'all';

export const StaffStatsSheet: React.FC<{ staff: StaffMember | null; onClose: () => void }> = ({ staff, onClose }) => {
  const [period, setPeriod] = useState<Period>('today');
  const [data, setData] = useState<StaffDetailsResponse['statistics'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!staff) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    staffApi
      .getStaffDetails(staff.uuid)
      .then((res) => {
        if (cancelled) return;
        if (res?.statistics) setData(res.statistics);
        else setError("Statistika ma'lumoti topilmadi");
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Statistikani yuklab bo'lmadi.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [staff, reloadKey]);

  const s: StaffPeriodStats | undefined = data?.[period];

  return (
    <Sheet
      open={!!staff}
      onClose={onClose}
      title={staff?.name}
      subtitle={staff ? `${ROLE_LABEL[staff.role] || staff.role} · ${formatPhone(staff.phone)}` : undefined}
      size="lg"
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : data ? (
        <div className="space-y-4">
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'today', label: 'Bugun' },
              { value: 'week', label: 'Hafta' },
              { value: 'month', label: 'Oy' },
              { value: 'all', label: 'Hammasi' },
            ]}
          />
          {s ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Tushum" value={formatMoney(s.total_revenue, false)} hint="so'm" icon={<Banknote className="w-4 h-4" />} tone="gold" />
                <StatCard label="Jami buyurtma" value={s.total_orders} hint="ta" icon={<ShoppingBag className="w-4 h-4" />} tone="info" />
                <StatCard label="Yakunlangan" value={s.completed_orders} hint="ta" icon={<CheckCircle2 className="w-4 h-4" />} />
                <StatCard label="Bekor qilingan" value={s.cancelled_orders} hint={s.pending_orders ? `${s.pending_orders} ta jarayonda` : 'ta'} icon={<XCircle className="w-4 h-4" />} tone="danger" />
              </div>
              <div className="rounded-2xl border border-edge divide-y divide-edge">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-[14px] text-muted"><Banknote className="w-4 h-4" /> Naqd</span>
                  <span className="font-bold tabular-nums">{formatMoney(s.cash_revenue)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-[14px] text-muted"><CreditCard className="w-4 h-4" /> Karta</span>
                  <span className="font-bold tabular-nums">{formatMoney(s.card_revenue)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[14px] text-muted">Bu davr uchun ma'lumot yo'q.</p>
          )}
          {staff && (
            <div className="flex flex-wrap gap-2 text-[13px]">
              <Badge>Asosiy: {staff.home_filial?.filial_name || '—'}</Badge>
              <Badge tone="info">Hozirgi: {staff.current_filial?.filial_name || '—'}</Badge>
            </div>
          )}
        </div>
      ) : null}
    </Sheet>
  );
};
