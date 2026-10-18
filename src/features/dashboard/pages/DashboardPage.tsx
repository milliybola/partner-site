import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Percent, Receipt, RefreshCw, ShoppingBag, Truck, Wallet } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Segmented,
  Skeleton,
  StatCard,
} from '../../../core/ui';
import { getPartner, isManager as isManagerFn, wording } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, formatMoneyShort, parseDate } from '../../../core/lib/format';

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface PeriodBlock {
  orders_count?: number;
  total_orders?: number;
  delivered?: number;
  cancelled?: number;
  revenue?: number;
  total_revenue?: number;
  delivery_fees?: number;
  total_delivery_fees?: number;
  net_revenue?: number;
  average_check?: number;
  cancelled_revenue?: number;
  top_products?: TopProduct[];
}

interface DashboardStats {
  partner?: {
    name: string;
    is_open: boolean;
    min_order_amount: number;
    delivery_fee: number;
    free_delivery_threshold: number;
  };
  overall?: PeriodBlock;
  today?: PeriodBlock;
  this_week?: PeriodBlock;
  this_month?: PeriodBlock;
  commission?: {
    type: string;
    rate: number;
    total_commission: number;
    month_commission: number;
  };
  daily_chart?: Array<{ date: string; orders: number; revenue: number }>;
}

type Period = 'today' | 'this_week' | 'this_month' | 'overall';

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Bugun',
  this_week: 'Hafta',
  this_month: 'Oy',
  overall: 'Umumiy',
};

/** Normalizes the slightly different shapes of today / week / month / overall. */
const normalize = (b?: PeriodBlock) => ({
  orders: b?.orders_count ?? b?.total_orders ?? 0,
  delivered: b?.delivered ?? 0,
  cancelled: b?.cancelled, // not present for week/month
  revenue: b?.revenue ?? b?.total_revenue ?? 0,
  net: b?.net_revenue ?? 0,
  deliveryFees: b?.delivery_fees ?? b?.total_delivery_fees ?? 0,
  avgCheck: b?.average_check,
  cancelledRevenue: b?.cancelled_revenue,
  top: b?.top_products,
});

const chartLabel = (raw: string) => {
  const d = parseDate(raw);
  if (!d) return raw;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ---------------------------------------------------------------- Chart */
const DailyChart: React.FC<{ data: NonNullable<DashboardStats['daily_chart']> }> = ({ data }) => {
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue');
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => Number(metric === 'revenue' ? d.revenue : d.orders) || 0);
  const max = Math.max(1, ...values);
  const shown = hover ?? data.length - 1;
  const current = data[shown];

  return (
    <Card>
      <CardHeader
        title="Kunlik dinamika"
        subtitle={
          current
            ? `${chartLabel(current.date)}: ${metric === 'revenue' ? formatMoney(current.revenue) : `${current.orders} ta buyurtma`}`
            : undefined
        }
        action={
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'revenue', label: 'Tushum' },
              { value: 'orders', label: 'Buyurtma' },
            ]}
          />
        }
      />
      <div className="flex items-end gap-1 h-44" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const v = values[i];
          const h = Math.max(2, Math.round((v / max) * 100));
          const active = i === shown;
          return (
            <button
              key={`${d.date}-${i}`}
              type="button"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
              aria-label={`${chartLabel(d.date)}: ${metric === 'revenue' ? formatMoney(d.revenue) : `${d.orders} ta`}`}
              className="flex-1 min-w-0 h-full flex items-end cursor-pointer"
            >
              <span
                className={`w-full rounded-t-md transition-colors ${active ? 'bg-brand' : 'bg-brand/25 hover:bg-brand/40'}`}
                style={{ height: `${h}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-muted tabular-nums">
        <span>{data[0] ? chartLabel(data[0].date) : ''}</span>
        <span>
          maks: {metric === 'revenue' ? formatMoneyShort(max) : max}
        </span>
        <span>{data.length ? chartLabel(data[data.length - 1].date) : ''}</span>
      </div>
    </Card>
  );
};

/* ----------------------------------------------------------------- Page */
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const partner = getPartner();
  const isManager = isManagerFn(partner);
  const w = wording(partner);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(!isManager);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('today');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(ENDPOINTS.DASHBOARD.STATS);
      const data = response.data?.data ?? (response.data?.success === undefined ? response.data : null);
      if (!data || typeof data !== 'object') throw new Error("Statistika ma'lumotlari formati noto'g'ri");
      setStats(data);
    } catch (err) {
      setError(getErrorMessage(err, "Statistika ma'lumotlarini yuklashda xatolik yuz berdi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isManager) navigate('/orders', { replace: true });
    else fetchStats();
  }, [isManager, navigate, fetchStats]);

  const p = useMemo(() => normalize(stats?.[period]), [stats, period]);
  // Top products only exist for today / this_month in the payload.
  const topProducts = p.top && p.top.length ? p.top : null;
  const topAvailable = period === 'today' || period === 'this_month';
  const maxTopQty = Math.max(1, ...(topProducts || []).map((t) => t.qty || 0));

  if (isManager) return null;

  const header = (
    <PageHeader
      title="Statistika"
      subtitle={`${w.venue} ko'rsatkichlari`}
      actions={
        <>
          <IconButton label="Yangilash" variant="outline" onClick={fetchStats} disabled={loading} className="md:hidden">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          <Button variant="outline" icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />} onClick={fetchStats} disabled={loading} className="hidden md:inline-flex">
            Yangilash
          </Button>
        </>
      }
    >
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={(Object.keys(PERIOD_LABEL) as Period[]).map((k) => ({ value: k, label: PERIOD_LABEL[k] }))}
      />
    </PageHeader>
  );

  if (error) {
    return (
      <div>
        {header}
        <ErrorState message={error} onRetry={fetchStats} />
      </div>
    );
  }

  if (loading && !stats) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-surface border border-edge rounded-2xl p-4 space-y-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const successRate = p.orders > 0 ? Math.round((p.delivered / p.orders) * 100) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {header}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
        <StatCard label="Tushum" value={formatMoneyShort(p.revenue)} hint={formatMoney(p.revenue)} icon={<Wallet className="w-4 h-4" />} />
        <StatCard label="Buyurtmalar" value={p.orders} hint={`${PERIOD_LABEL[period]}`} icon={<ShoppingBag className="w-4 h-4" />} tone="info" />
        <StatCard
          label="Yakunlangan"
          value={p.delivered}
          hint={successRate !== null ? `${successRate}% muvaffaqiyatli` : undefined}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <StatCard
          label="Bekor qilingan"
          value={p.cancelled ?? '—'}
          hint={p.cancelled === undefined ? 'Bu davr uchun berilmaydi' : p.cancelledRevenue ? formatMoney(p.cancelledRevenue) : undefined}
          icon={<Ban className="w-4 h-4" />}
          tone="danger"
        />
        <StatCard label="Sof tushum" value={formatMoneyShort(p.net)} hint={formatMoney(p.net)} icon={<Receipt className="w-4 h-4" />} tone="neutral" />
        <StatCard
          label="O'rtacha chek"
          value={p.avgCheck !== undefined ? formatMoneyShort(p.avgCheck) : '—'}
          hint={p.avgCheck !== undefined ? formatMoney(p.avgCheck) : 'Bu davr uchun berilmaydi'}
          icon={<Receipt className="w-4 h-4" />}
          tone="neutral"
        />
        <StatCard label="Yetkazish to'lovlari" value={formatMoneyShort(p.deliveryFees)} hint={formatMoney(p.deliveryFees)} icon={<Truck className="w-4 h-4" />} tone="neutral" />
        <StatCard
          label="Komissiya (oy)"
          value={stats?.commission ? formatMoneyShort(stats.commission.month_commission) : '—'}
          hint={stats?.commission ? `Stavka: ${stats.commission.rate}${stats.commission.type === 'PERCENT' || stats.commission.type === 'percentage' ? '%' : ''}` : undefined}
          icon={<Percent className="w-4 h-4" />}
          tone="gold"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 items-start">
        <div className="lg:col-span-2">
          {stats?.daily_chart && stats.daily_chart.length > 0 ? (
            <DailyChart data={stats.daily_chart} />
          ) : (
            <Card>
              <CardHeader title="Kunlik dinamika" />
              <EmptyState title="Grafik uchun ma'lumot yo'q" className="py-6" />
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title={`Ko'p sotilgan ${w.products.toLowerCase()}`} subtitle={topAvailable ? PERIOD_LABEL[period] : 'Bugun yoki Oy davrini tanlang'} />
          {topProducts ? (
            <ol className="space-y-3">
              {topProducts.slice(0, 8).map((t, i) => (
                <li key={`${t.name}-${i}`} className="min-w-0">
                  <div className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-field text-[12px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="font-semibold truncate">{t.name}</span>
                    </span>
                    <span className="font-bold tabular-nums shrink-0">{t.qty} ta</span>
                  </div>
                  <div className="mt-1.5 ml-8 flex items-center gap-2">
                    <span className="h-1.5 rounded-full bg-brand/70" style={{ width: `${Math.max(4, (t.qty / maxTopQty) * 100)}%` }} />
                  </div>
                  <div className="ml-8 mt-0.5 text-[12px] text-muted tabular-nums">{formatMoney(t.revenue)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={<ShoppingBag className="w-7 h-7" />}
              title={topAvailable ? 'Hali sotuv yo‘q' : 'Bu davr uchun berilmaydi'}
              className="py-6"
            />
          )}
        </Card>
      </div>

      {(stats?.commission || stats?.partner) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {stats?.commission && (
            <Card>
              <CardHeader title="Komissiya" icon={<Percent className="w-4 h-4" />} />
              <dl className="divide-y divide-edge text-[14px]">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Turi</dt>
                  <dd className="font-semibold">{stats.commission.type}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Stavka</dt>
                  <dd className="font-semibold">{stats.commission.rate}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Shu oy</dt>
                  <dd className="font-bold">{formatMoney(stats.commission.month_commission)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Jami</dt>
                  <dd className="font-bold">{formatMoney(stats.commission.total_commission)}</dd>
                </div>
              </dl>
            </Card>
          )}
          {stats?.partner && (
            <Card>
              <CardHeader title="Yetkazish shartlari" icon={<Truck className="w-4 h-4" />} />
              <dl className="divide-y divide-edge text-[14px]">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Minimal buyurtma</dt>
                  <dd className="font-semibold">{formatMoney(stats.partner.min_order_amount)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Yetkazish narxi</dt>
                  <dd className="font-semibold">{formatMoney(stats.partner.delivery_fee)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Bepul yetkazish (dan)</dt>
                  <dd className="font-semibold">{stats.partner.free_delivery_threshold ? formatMoney(stats.partner.free_delivery_threshold) : '—'}</dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
