import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  Download,
  Percent,
  Phone,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';
import { ordersApi } from '../../orders/services/ordersApi';
import type { Order } from '../../orders/services/ordersApi';
import { financeApi } from '../services/financeApi';
import type { FinancePeriod } from '../services/financeApi';
import { useToast } from '../../../core/components/ToastProvider';
import { isManager as isManagerRole } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatDate, formatDateTime, formatMoney, formatPhone, parseDate } from '../../../core/lib/format';
import { saveBlob } from '../../../core/platform';
import {
  ApiGap,
  Badge,
  Button,
  Card,
  CardHeader,
  DataList,
  EmptyState,
  ErrorState,
  PageHeader,
  Segmented,
  SkeletonList,
  StatCard,
  Tabs,
} from '../../../core/ui';
import type { Column } from '../../../core/ui';
import { paymentLabel, statusGroup, statusLabel, statusTone } from '../../orders/utils/status';

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface PeriodStats {
  orders_count?: number;
  total_orders?: number;
  delivered?: number;
  cancelled?: number;
  revenue?: number;
  total_revenue?: number;
  delivery_fees?: number;
  total_delivery_fees?: number;
  cancelled_revenue?: number;
  net_revenue?: number;
  average_check?: number;
  top_products?: TopProduct[];
}

interface DashboardStats {
  partner?: {
    name?: string;
    phone?: string;
    is_open?: boolean;
    min_order_amount?: number;
    delivery_fee?: number;
    free_delivery_threshold?: number;
  };
  overall?: PeriodStats;
  today?: PeriodStats;
  this_week?: PeriodStats;
  this_month?: PeriodStats;
  commission?: {
    type?: string;
    rate?: number;
    total_commission?: number;
    month_commission?: number;
  };
  daily_chart?: Array<{ date: string; orders: number; revenue: number }>;
}

const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: 'today', label: 'Bugun' },
  { value: 'this_week', label: 'Hafta' },
  { value: 'this_month', label: 'Oy' },
  { value: 'overall', label: 'Barchasi' },
];

type TxFilter = 'all' | 'done' | 'cancelled' | 'active';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Start of the period in local time (week starts on Monday). */
const periodStart = (p: FinancePeriod): Date | null => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'today') return d;
  if (p === 'this_week') {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return d;
  }
  if (p === 'this_month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
};

const FinancePage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const manager = isManagerRole();

  const [period, setPeriod] = useState<FinancePeriod>('today');
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!manager);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOrdersError(null);
    // Stats and orders are loaded independently: a failing orders list must not
    // hide the KPI cards (previously Promise.all failed the whole page).
    const [statsRes, ordersRes] = await Promise.allSettled([apiClient.get(ENDPOINTS.DASHBOARD.STATS), ordersApi.getOrders()]);
    if (statsRes.status === 'fulfilled') {
      const data = statsRes.value.data?.data ?? (statsRes.value.data?.success === undefined ? statsRes.value.data : null);
      if (data && typeof data === 'object') setStats(data);
      else setError("Statistika ma'lumotlari formati noto'g'ri.");
    } else {
      setError(getErrorMessage(statsRes.reason, "Moliya ma'lumotlarini yuklab bo'lmadi."));
    }
    if (ordersRes.status === 'fulfilled') setOrders(Array.isArray(ordersRes.value) ? ordersRes.value : []);
    else setOrdersError(getErrorMessage(ordersRes.reason, "Buyurtmalar ro'yxatini yuklab bo'lmadi."));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (manager) navigate('/orders', { replace: true });
    else load();
  }, [manager, navigate, load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await financeApi.exportFinanceExcel(period);
      const ext = blob.type.includes('csv') ? 'csv' : 'xlsx';
      saveBlob(blob, `Moliya_hisoboti_${period}_${new Date().toISOString().slice(0, 10)}.${ext}`);
      toast.success('Hisobot yuklab olindi');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Excel hisobotini yuklab olishda xatolik yuz berdi.'));
    } finally {
      setExporting(false);
    }
  };

  /* --------------------------------------------------- derived KPIs */
  const kpi = useMemo(() => {
    const p: PeriodStats | undefined = stats?.[period];
    const revenue = num(p?.revenue ?? p?.total_revenue);
    const ordersCount = num(p?.orders_count ?? p?.total_orders);
    const delivered = num(p?.delivered);
    const cancelled = num(p?.cancelled);
    const deliveryFees = num(p?.delivery_fees ?? p?.total_delivery_fees);
    const net = num(p?.net_revenue);
    let avg = num(p?.average_check);
    if (avg === null && revenue !== null && ordersCount) avg = Math.round(revenue / ordersCount);
    // Commission is only returned for month / overall. We no longer derive it
    // as revenue - net_revenue (that difference is not documented as commission).
    const commission =
      period === 'this_month' ? num(stats?.commission?.month_commission) : period === 'overall' ? num(stats?.commission?.total_commission) : null;
    const ownTop = p?.top_products;
    const top = ownTop && ownTop.length ? ownTop : null;
    return { revenue, ordersCount, delivered, cancelled, deliveryFees, net, avg, commission, top, cancelledRevenue: num(p?.cancelled_revenue) };
  }, [stats, period]);

  const periodOrders = useMemo(() => {
    const start = periodStart(period);
    if (!start) return orders;
    return orders.filter((o) => {
      const d = parseDate(o.created_at);
      return d ? d >= start : false;
    });
  }, [orders, period]);

  const txRows = useMemo(() => {
    return periodOrders.filter((o) => {
      const g = statusGroup(o.status);
      if (txFilter === 'all') return true;
      if (txFilter === 'cancelled') return o.status === 'CANCELLED' || o.status === 'REJECTED';
      if (txFilter === 'done') return g === 'DONE' && o.status !== 'CANCELLED' && o.status !== 'REJECTED';
      return g !== 'DONE';
    });
  }, [periodOrders, txFilter]);

  const txCounts = useMemo(() => {
    let done = 0;
    let cancelled = 0;
    let active = 0;
    periodOrders.forEach((o) => {
      if (o.status === 'CANCELLED' || o.status === 'REJECTED') cancelled++;
      else if (statusGroup(o.status) === 'DONE') done++;
      else active++;
    });
    return { all: periodOrders.length, done, cancelled, active };
  }, [periodOrders]);

  const columns: Column<Order>[] = [
    {
      key: 'order',
      header: 'Buyurtma',
      primary: true,
      render: (o) => (
        <div className="min-w-0">
          <div className="font-bold text-ink">#{o.order_number || o.id}</div>
          <div className="text-[12px] text-muted md:hidden">{formatDateTime(o.created_at)}</div>
        </div>
      ),
    },
    { key: 'date', header: 'Sana', mobileHidden: true, render: (o) => <span className="text-muted whitespace-nowrap">{formatDateTime(o.created_at)}</span> },
    {
      key: 'payment',
      header: "To'lov",
      render: (o) => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span>{o.payment_method_display || paymentLabel(o.payment_method || o.payment)}</span>
          {o.is_paid !== undefined && <Badge tone={o.is_paid ? 'success' : 'neutral'}>{o.is_paid ? "To'langan" : "To'lanmagan"}</Badge>}
        </span>
      ),
    },
    { key: 'source', header: 'Manba', render: (o) => <span className="text-muted">{o.order_source_display || o.order_source || '—'}</span> },
    { key: 'status', header: 'Holat', mobileAside: true, render: (o) => <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge> },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      mobileAside: true,
      render: (o) => <span className="font-extrabold text-ink tabular-nums whitespace-nowrap">{formatMoney(o.total_price)}</span>,
    },
  ];

  /* ----------------------------------------------------------- render */
  if (manager) return null;

  const header = (
    <PageHeader
      title="Moliya"
      subtitle="Tushum, komissiya va buyurtmalar bo'yicha hisobot"
      actions={
        <Button variant="outline" icon={<Download className="w-4 h-4" />} loading={exporting} onClick={handleExport} disabled={loading || !!error}>
          <span className="hidden sm:inline">Excel</span>
        </Button>
      }
    >
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => { setPeriod(v); setSelectedDay(null); }} />
    </PageHeader>
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-2xl bg-surface border border-edge animate-pulse" />
          ))}
        </div>
        <SkeletonList rows={4} className="mt-4" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div>
        {header}
        <Card className="mt-2">
          <ErrorState message={error || "Statistika yuklanmadi"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const dash = (v: number | null, fmt: (n: number) => string = (n) => formatMoney(n)) => (v === null ? '—' : fmt(v));
  const chart = stats.daily_chart || [];
  const chartMax = Math.max(1, ...chart.map((d) => Number(d.revenue) || 0));
  const selected = selectedDay !== null ? chart[selectedDay] : null;
  const deliveredPct = kpi.ordersCount && kpi.delivered !== null ? Math.round((kpi.delivered / kpi.ordersCount) * 100) : null;
  const topMax = Math.max(1, ...(kpi.top || []).map((p) => p.qty || 0));
  const partner = stats.partner;

  return (
    <div className="space-y-5">
      {header}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Umumiy tushum" value={dash(kpi.revenue)} icon={<DollarSign className="w-4 h-4" />} hint="Yetkazish va komissiya bilan" />
        <StatCard label="Sof tushum" value={dash(kpi.net)} icon={<TrendingUp className="w-4 h-4" />} hint="Server hisoblagan net_revenue" />
        <StatCard
          label={`Komissiya${stats.commission?.rate !== undefined ? ` (${stats.commission.rate}%)` : ''}`}
          tone="danger"
          icon={<Percent className="w-4 h-4" />}
          value={
            kpi.commission === null ? (
              <span className="inline-flex items-center gap-2">
                — <ApiGap title="partner/statistics/ faqat oy (month_commission) va umumiy (total_commission) komissiyani qaytaradi; kunlik/haftalik komissiya maydoni yo'q" />
              </span>
            ) : (
              formatMoney(kpi.commission)
            )
          }
          hint="MilliyGo xizmat haqi"
        />
        <StatCard label="Yetkazish haqlari" tone="info" value={dash(kpi.deliveryFees)} icon={<Truck className="w-4 h-4" />} hint="Kuryer xizmati uchun" />
        <StatCard
          label="Buyurtmalar"
          tone="neutral"
          icon={<ShoppingBag className="w-4 h-4" />}
          value={kpi.ordersCount === null ? '—' : `${kpi.ordersCount} ta`}
          hint={
            <span className="inline-flex items-center gap-2">
              <span className="text-brand font-semibold">{kpi.delivered ?? '—'} yakunlangan</span>
              <span className="text-danger-ink font-semibold">
                {kpi.cancelled ?? '—'} bekor
              </span>
              {kpi.cancelled === null && <ApiGap title="partner/statistics/ this_week / this_month uchun 'cancelled' maydonini qaytarmaydi" />}
            </span>
          }
        />
        <StatCard label="O'rtacha chek" tone="gold" value={dash(kpi.avg)} icon={<Receipt className="w-4 h-4" />} hint="Bitta buyurtmaga" />
        <StatCard
          label="Yakunlanish ulushi"
          tone="brand"
          icon={<CheckCircle2 className="w-4 h-4" />}
          value={deliveredPct === null ? '—' : `${deliveredPct}%`}
          hint={kpi.cancelledRevenue ? `Bekor qilingan summa: ${formatMoney(kpi.cancelledRevenue)}` : 'Yakunlangan / jami'}
        />
        <Card className="flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-muted">To'lovlar (payout)</span>
            <span className="w-8 h-8 rounded-xl bg-field text-muted flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <ApiGap
            block
            title="Hamkorga o'tkazilgan / kutilayotgan to'lovlar (payout, settlement) uchun endpoint yo'q. Taklif: GET partner/finance/payouts/?period="
          >
            Kutilayotgan va o'tkazilgan to'lovlar
          </ApiGap>
        </Card>
      </div>

      {/* Partner terms */}
      {partner && (
        <Card>
          <CardHeader title={partner.name || 'Hamkor'} subtitle="Shartnoma shartlari" icon={<BarChart3 className="w-4 h-4" />} />
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3 text-[14px]">
            {partner.phone && (
              <div className="min-w-0">
                <dt className="text-[12px] text-muted">Telefon</dt>
                <dd className="font-semibold">
                  <a href={`tel:${partner.phone}`} className="inline-flex items-center gap-1 hover:text-brand">
                    <Phone className="w-3.5 h-3.5" />
                    <span className="truncate">{formatPhone(partner.phone)}</span>
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-[12px] text-muted">Minimal buyurtma</dt>
              <dd className="font-semibold">{partner.min_order_amount !== undefined ? formatMoney(partner.min_order_amount) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Yetkazish narxi</dt>
              <dd className="font-semibold">{partner.delivery_fee !== undefined ? formatMoney(partner.delivery_fee) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Bepul yetkazish</dt>
              <dd className="font-semibold">
                {partner.free_delivery_threshold ? `${formatMoney(partner.free_delivery_threshold)} dan` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Komissiya</dt>
              <dd className="font-semibold">
                {stats.commission?.rate !== undefined ? `${stats.commission.rate}%` : '—'}
                {stats.commission?.type && stats.commission.type !== 'percentage' ? ` (${stats.commission.type})` : ''}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Daily chart */}
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader title="Kunlik tushum" subtitle="Ustunni bosing — kun bo'yicha batafsil" />
          {chart.length === 0 ? (
            <EmptyState title="Grafik uchun ma'lumot yo'q" description="Server daily_chart ma'lumotini qaytarmadi." className="py-8" />
          ) : (
            <>
              <div className="flex items-end gap-1 sm:gap-2 h-44 border-b border-edge" role="list">
                {chart.map((d, i) => {
                  const h = Math.max(2, Math.round(((Number(d.revenue) || 0) / chartMax) * 100));
                  const active = selectedDay === i;
                  return (
                    <button
                      key={`${d.date}-${i}`}
                      type="button"
                      role="listitem"
                      title={`${formatDate(d.date)}: ${formatMoney(d.revenue)}, ${d.orders} ta`}
                      onClick={() => setSelectedDay(active ? null : i)}
                      className="flex-1 min-w-0 h-full flex items-end cursor-pointer group"
                    >
                      <span
                        className={`w-full rounded-t-lg transition-colors ${active ? 'bg-brand' : 'bg-brand-bright/40 group-hover:bg-brand-bright/70'}`}
                        style={{ height: `${h}%` }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] text-muted mt-1.5">
                <span>{formatDate(chart[0]?.date)}</span>
                <span>{formatDate(chart[chart.length - 1]?.date)}</span>
              </div>
              <div className="mt-3 rounded-xl bg-field px-3.5 py-2.5 text-[14px] flex flex-wrap items-center justify-between gap-2">
                {selected ? (
                  <>
                    <span className="font-semibold">{formatDate(selected.date)}</span>
                    <span className="text-muted">{selected.orders} ta buyurtma</span>
                    <span className="font-extrabold">{formatMoney(selected.revenue)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-muted">Davr jami</span>
                    <span className="font-extrabold">{formatMoney(chart.reduce((s, d) => s + (Number(d.revenue) || 0), 0))}</span>
                  </>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Top products */}
        <Card className="min-w-0">
          <CardHeader title="Eng ko'p sotilganlar" subtitle={PERIOD_OPTIONS.find((p) => p.value === period)?.label} />
          {kpi.top ? (
            <ol className="space-y-3">
              {kpi.top.slice(0, 8).map((p, i) => (
                <li key={`${p.name}-${i}`} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[14px]">
                    <span className="font-semibold truncate">
                      {i + 1}. {p.name}
                    </span>
                    <span className="text-muted shrink-0 tabular-nums">{p.qty} ta</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-field overflow-hidden">
                    <div className="h-full bg-brand-bright rounded-full" style={{ width: `${Math.round(((p.qty || 0) / topMax) * 100)}%` }} />
                  </div>
                  <div className="text-[12px] text-muted mt-0.5">{formatMoney(p.revenue)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="space-y-3">
              <EmptyState title="Ma'lumot yo'q" description="Bu davr uchun top mahsulotlar qaytarilmadi." className="py-6" />
              {(period === 'this_week' || period === 'overall') && (
                <ApiGap block title="partner/statistics/ top_products faqat 'today' va 'this_month' uchun qaytaradi">
                  Hafta / umumiy davr uchun top mahsulotlar yo'q
                </ApiGap>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Orders ledger built only from real orders */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[17px] font-extrabold tracking-tightest">Buyurtmalar bo'yicha tushum</h2>
        </div>
        <Tabs<TxFilter>
          size="sm"
          className="mb-3"
          value={txFilter}
          onChange={setTxFilter}
          options={[
            { value: 'all', label: 'Barchasi', count: txCounts.all },
            { value: 'done', label: 'Yakunlangan', count: txCounts.done },
            { value: 'active', label: 'Jarayonda', count: txCounts.active },
            { value: 'cancelled', label: 'Bekor qilingan', count: txCounts.cancelled },
          ]}
        />
        {ordersError ? (
          <Card>
            <ErrorState message={ordersError} onRetry={load} />
          </Card>
        ) : (
          <DataList
            rows={txRows.slice(0, 200)}
            columns={columns}
            rowKey={(o) => o.uuid || String(o.id)}
            empty={
              <Card>
                <EmptyState title="Buyurtmalar yo'q" description="Tanlangan davr va filtr bo'yicha buyurtma topilmadi." />
              </Card>
            }
          />
        )}
        {txRows.length > 200 && <p className="text-[12px] text-muted mt-2">Faqat oxirgi 200 ta ko'rsatildi. To'liq ro'yxat uchun Excel hisobotini yuklang.</p>}
      </section>
    </div>
  );
};

export default FinancePage;
