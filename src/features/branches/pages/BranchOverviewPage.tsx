import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Bike, Building2, ChevronRight, Clock, Receipt, RefreshCw, ShoppingBag, Timer, Wallet, XCircle,
} from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, IconButton, PageHeader, Segmented, Skeleton, StatCard,
} from '../../../core/ui';
import { isOwner } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, formatMoneyShort } from '../../../core/lib/format';
import { setWorkingFilial } from '../../../core/lib/workingFilial';
import { branchApi } from '../services/branchApi';
import type { BranchOverview, BranchRow, OverviewAlert, OverviewPeriod } from '../services/branchApi';

const PERIOD_LABEL: Record<OverviewPeriod, string> = { today: 'Bugun', week: 'Hafta', month: 'Oy' };
const COMPARE_LABEL: Record<OverviewPeriod, string> = { today: 'kechagiga', week: "o'tgan haftaga", month: "o'tgan oyga" };
const REFRESH_MS = 60_000;

type SortKey = 'revenue' | 'orders' | 'avg_check' | 'cancel_rate';
type SortDir = 'asc' | 'desc';

/* --------------------------------------------------------------- Helpers */
/** O'sish foizi: ▲ yashil / ▼ qizil; null (oldingi davrda ma'lumot yo'q) — «—». */
const Delta: React.FC<{ value: number | null | undefined; invert?: boolean; suffix?: string }> = ({ value, invert, suffix }) => {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  if (value === 0) return <span className="text-muted tabular-nums">0%{suffix}</span>;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${good ? 'text-brand' : 'text-danger-ink'}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}%{suffix}
    </span>
  );
};

const minutes = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)} daq`);

const ALERT_TONE: Record<OverviewAlert['level'], { box: string; icon: string }> = {
  danger: { box: 'bg-danger-soft text-danger-ink', icon: 'text-danger-ink' },
  warning: { box: 'bg-warning-soft text-warning-ink', icon: 'text-warning-ink' },
  info: { box: 'bg-info-soft text-info', icon: 'text-info' },
};

const statusBadge = (b: BranchRow) => {
  if (b.status === 'CLOSED') return <Badge tone="danger">Yopiq</Badge>;
  if (b.status === 'INACTIVE') return <Badge tone="neutral">Faol emas</Badge>;
  if (!b.is_working_now) return <Badge tone="neutral">Hozir ishlamaydi</Badge>;
  return null;
};

const ShareBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="h-1.5 w-full rounded-full bg-field overflow-hidden" title={`Umumiy tushumning ${Math.round(value)}%`}>
    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

const LiveCell: React.FC<{ b: BranchRow }> = ({ b }) => (
  <span className="inline-flex items-center gap-1.5 tabular-nums">
    <span className="font-bold text-ink">{b.live.active_orders}</span>
    {b.live.late_orders > 0 && <Badge tone="danger">{b.live.late_orders} kechikkan</Badge>}
  </span>
);

/* ------------------------------------------------------------------ Page */
const BranchOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const owner = isOwner();

  const [period, setPeriod] = useState<OverviewPeriod>('today');
  const [data, setData] = useState<BranchOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'revenue', dir: 'desc' });
  const reqId = useRef(0);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const id = ++reqId.current;
      if (opts?.silent) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await branchApi.getOverview(period);
        if (id !== reqId.current) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (id !== reqId.current) return;
        // Avto-yangilanish xatosi ko'rinib turgan ma'lumotni o'chirmasin
        if (!opts?.silent || !data) setError(getErrorMessage(err, "Boshqaruv ma'lumotlarini yuklashda xatolik yuz berdi."));
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period],
  );

  useEffect(() => {
    if (!owner) return;
  }, [owner, load]);

  // Har ~60 soniyada jim yangilash (yashirin tabda to'xtaydi)
  useEffect(() => {
    if (!owner) return;
    const t = setInterval(() => {
      if (!document.hidden) load({ silent: true });
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [owner, load]);

  const rows = useMemo(() => {
    const list = [...(data?.branches ?? [])];
    const dir = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => (a[sort.key] - b[sort.key]) * dir || a.name.localeCompare(b.name));
    return list;
  }, [data, sort]);

  if (!owner) return <Navigate to="/orders" replace />;

  const openBranch = (b: BranchRow) => {
    setWorkingFilial(b.uuid);
    navigate('/orders');
  };
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'cancel_rate' ? 'asc' : 'desc' }));

  const refresh = () => load({ silent: !!data });
  const spin = loading || refreshing;

  const header = (
    <PageHeader
      title="Boshqaruv"
      subtitle="Filiallar bo'yicha ko'rsatkichlar"
      actions={
        <>
          <IconButton label="Yangilash" variant="outline" onClick={refresh} disabled={spin} className="md:hidden">
            <RefreshCw className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} />
          </IconButton>
          <Button variant="outline" icon={<RefreshCw className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} />} onClick={refresh} disabled={spin} className="hidden md:inline-flex">
            Yangilash
          </Button>
        </>
      }
    >
      <Segmented<OverviewPeriod>
        value={period}
        onChange={setPeriod}
        options={(Object.keys(PERIOD_LABEL) as OverviewPeriod[]).map((k) => ({ value: k, label: PERIOD_LABEL[k] }))}
      />
    </PageHeader>
  );

  const stale = !data || data.period !== period; // davr almashgan, yangi ma'lumot hali kelmagan
  if (error && stale) {
    return (
      <div>
        {header}
        <ErrorState message={error} onRetry={() => load()} />
      </div>
    );
  }

  if (loading && (!data || data.period !== period)) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 md:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-surface border border-edge rounded-2xl p-4 space-y-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || stale) return null;

  const t = data.totals;
  const everyone = [...rows, ...(data.unassigned ? [data.unassigned] : [])];

  if (data.branches.length === 0 && !data.unassigned) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<Building2 className="w-6 h-6" />}
          title="Filiallar yo'q"
          description="Filial qo'shing — shunda ko'rsatkichlar shu yerda chiqadi."
          action={
            <Link to="/branches">
              <Button>Filiallarga o'tish</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const sortHead = (k: SortKey, children: React.ReactNode, align?: 'right') => {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === 'desc' ? ArrowDown : ArrowUp;
    return (
      <th key={k} className={`px-4 py-3 text-[12px] font-bold uppercase tracking-wide whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-ink' : 'text-muted'}`} aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase cursor-pointer hover:text-ink">
          {children}
          <Icon className="w-3 h-3" />
        </button>
      </th>
    );
  };

  const marker = (b: BranchRow) =>
    b.uuid && b.uuid === data.best_branch ? <Badge tone="success">Eng yaxshi</Badge> : b.uuid && b.uuid === data.weakest_branch ? <Badge tone="warning">Eng past</Badge> : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {header}

      {error && (
        <div className="rounded-xl bg-warning-soft text-warning-ink px-3.5 py-2.5 text-[13px] font-semibold">
          Yangilab bo'lmadi, oxirgi ma'lumot ko'rsatilmoqda.{' '}
          <button type="button" className="underline cursor-pointer" onClick={() => load()}>
            Qayta urinish
          </button>
        </div>
      )}

      {/* Umumiy ko'rsatkichlar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 md:gap-4">
        <StatCard
          label="Tushum"
          value={formatMoneyShort(t.revenue)}
          hint={
            <span className="inline-flex items-center gap-1.5">
              <Delta value={t.revenue_delta} />
              <span>{COMPARE_LABEL[period]} nisbatan</span>
            </span>
          }
          icon={<Wallet className="w-4 h-4" />}
        />
        <StatCard
          label="Buyurtmalar"
          value={t.orders}
          hint={
            <span className="inline-flex items-center gap-1.5">
              <Delta value={t.orders_delta} />
              <span>{t.delivered} yetkazildi</span>
            </span>
          }
          icon={<ShoppingBag className="w-4 h-4" />}
          tone="info"
        />
        <StatCard
          label="O'rtacha chek"
          value={formatMoneyShort(t.avg_check)}
          hint={
            <span className="inline-flex items-center gap-1.5">
              <Delta value={t.avg_check_delta} />
              <span>{formatMoney(t.avg_check)}</span>
            </span>
          }
          icon={<Receipt className="w-4 h-4" />}
          tone="gold"
        />
        <StatCard
          label="Bekor qilingan"
          value={`${t.cancel_rate.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}%`}
          hint={`${t.cancelled} ta buyurtma`}
          icon={<XCircle className="w-4 h-4" />}
          tone={t.cancel_rate >= 20 ? 'danger' : 'neutral'}
        />
        <StatCard
          label="Yetkazish vaqti"
          value={minutes(t.avg_delivery_minutes)}
          hint={t.late_orders > 0 ? `Hozir ${t.late_orders} ta kechikkan` : `Hozir ${t.active_orders} ta faol`}
          icon={<Timer className="w-4 h-4" />}
          tone={t.late_orders > 0 ? 'danger' : 'neutral'}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Ogohlantirishlar */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader title="Diqqat talab qiladi" subtitle={`${data.alerts.length} ta ogohlantirish`} icon={<AlertTriangle className="w-4 h-4" />} />
          <ul className="space-y-2">
            {data.alerts.map((a, i) => {
              const tone = ALERT_TONE[a.level];
              const clickable = a.filial_uuid !== null;
              const body = (
                <>
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${tone.icon}`} />
                  <span className="flex-1 min-w-0 text-left text-[14px] font-semibold">{a.text}</span>
                  {clickable && <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />}
                </>
              );
              return (
                <li key={`${a.code}-${a.filial_uuid}-${i}`}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWorkingFilial(a.filial_uuid);
                        navigate('/orders');
                      }}
                      className={`w-full flex items-start gap-2.5 rounded-xl px-3.5 py-3 cursor-pointer transition hover:opacity-90 ${tone.box}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${tone.box}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Filiallar solishtirmasi */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[16px] font-black text-ink">Filiallar solishtirmasi</h2>
          <span className="text-[12px] text-muted">
            {PERIOD_LABEL[period]} · {COMPARE_LABEL[period]} solishtirilgan
          </span>
        </div>

        {/* Desktop: jadval */}
        <div className="hidden md:block bg-surface border border-edge rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-edge bg-surface2">
                  <th className="px-4 py-3 text-[12px] font-bold text-muted uppercase tracking-wide text-left">Filial</th>
                  {sortHead('revenue', 'Tushum', 'right')}
                  {sortHead('orders', 'Buyurtma', 'right')}
                  {sortHead('avg_check', "O'rtacha chek", 'right')}
                  {sortHead('cancel_rate', 'Bekor', 'right')}
                  <th className="px-4 py-3 text-[12px] font-bold text-muted uppercase tracking-wide text-right whitespace-nowrap">Yetkazish</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted uppercase tracking-wide text-left whitespace-nowrap">Hozir</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted uppercase tracking-wide text-right whitespace-nowrap">Kuryerlar</th>
                </tr>
              </thead>
              <tbody>
                {[...rows, ...(data.unassigned ? [data.unassigned] : [])].map((b) => (
                  <tr
                    key={b.uuid ?? 'unassigned'}
                    onClick={() => openBranch(b)}
                    className="border-b border-edge last:border-0 hover:bg-field/60 cursor-pointer"
                  >
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-ink">{b.name}</span>
                        {b.is_main && <Badge tone="info">Asosiy</Badge>}
                        {marker(b)}
                        {statusBadge(b)}
                      </div>
                      {b.address && <div className="text-[12px] text-muted truncate max-w-[260px]">{b.address}</div>}
                      {!b.uuid && <div className="text-[12px] text-muted">Filiali belgilanmagan buyurtmalar</div>}
                    </td>
                    <td className="px-4 py-3 text-right min-w-[170px]">
                      <div className="font-extrabold text-ink tabular-nums">{formatMoney(b.revenue)}</div>
                      <div className="flex items-center justify-end gap-2 mt-1">
                        <div className="w-20"><ShareBar value={b.revenue_share} /></div>
                        <span className="text-[11px] text-muted tabular-nums w-9 text-right">{Math.round(b.revenue_share)}%</span>
                      </div>
                      <div className="text-[12px] mt-0.5"><Delta value={b.revenue_delta} /></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-ink tabular-nums">{b.orders}</div>
                      <div className="text-[12px]"><Delta value={b.orders_delta} /></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-ink tabular-nums">{formatMoney(b.avg_check)}</div>
                      <div className="text-[12px]"><Delta value={b.avg_check_delta} /></div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={`font-bold ${b.orders >= 5 && b.cancel_rate >= 20 ? 'text-danger-ink' : 'text-ink'}`}>
                        {b.cancel_rate.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}%
                      </span>
                      <div className="text-[12px] text-muted">{b.cancelled} ta</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink whitespace-nowrap">{minutes(b.avg_delivery_minutes)}</td>
                    <td className="px-4 py-3"><LiveCell b={b} /></td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      <span className="font-bold text-ink">{b.couriers.online}</span>
                      <span className="text-muted"> / {b.couriers.total}</span>
                      {b.couriers.free > 0 && <div className="text-[12px] text-brand">{b.couriers.free} bo'sh</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Telefon: kartalar */}
        <div className="md:hidden space-y-2.5">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {([['revenue', 'Tushum'], ['orders', 'Buyurtma'], ['avg_check', "O'rtacha chek"], ['cancel_rate', 'Bekor']] as Array<[SortKey, string]>).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleSort(k)}
                className={`h-8 px-3 rounded-full text-[12px] font-bold whitespace-nowrap inline-flex items-center gap-1 cursor-pointer ${sort.key === k ? 'bg-ink text-white' : 'bg-field text-muted'}`}
              >
                {label}
                {sort.key === k && (sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
              </button>
            ))}
          </div>
          {everyone.map((b) => (
            <button
              key={b.uuid ?? 'unassigned'}
              type="button"
              onClick={() => openBranch(b)}
              className="w-full text-left bg-surface border border-edge rounded-2xl p-4 cursor-pointer active:bg-field/60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[16px] font-black text-ink">{b.name}</span>
                    {b.is_main && <Badge tone="info">Asosiy</Badge>}
                    {marker(b)}
                    {statusBadge(b)}
                  </div>
                  {b.address && <div className="text-[12px] text-muted truncate">{b.address}</div>}
                </div>
                <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-1" />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[22px] font-black text-ink tracking-tightest leading-none tabular-nums">{formatMoneyShort(b.revenue)}</div>
                  <div className="text-[12px] mt-1"><Delta value={b.revenue_delta} /></div>
                </div>
                <div className="w-28 shrink-0">
                  <div className="text-[11px] text-muted text-right mb-1 tabular-nums">{Math.round(b.revenue_share)}% jami tushum</div>
                  <ShareBar value={b.revenue_share} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                <div className="rounded-xl bg-field px-2.5 py-2">
                  <div className="text-muted">Buyurtma</div>
                  <div className="font-extrabold text-ink tabular-nums">{b.orders} <Delta value={b.orders_delta} /></div>
                </div>
                <div className="rounded-xl bg-field px-2.5 py-2">
                  <div className="text-muted">O'rt. chek</div>
                  <div className="font-extrabold text-ink tabular-nums">{formatMoneyShort(b.avg_check)}</div>
                </div>
                <div className="rounded-xl bg-field px-2.5 py-2">
                  <div className="text-muted">Bekor</div>
                  <div className={`font-extrabold tabular-nums ${b.orders >= 5 && b.cancel_rate >= 20 ? 'text-danger-ink' : 'text-ink'}`}>
                    {b.cancel_rate.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}%
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-3 text-[12px] text-muted flex-wrap">
                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{minutes(b.avg_delivery_minutes)}</span>
                <span className="inline-flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /><LiveCell b={b} /> faol</span>
                <span className="inline-flex items-center gap-1"><Bike className="w-3.5 h-3.5" />{b.couriers.online}/{b.couriers.total} kuryer</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-muted">
        Filialni bosing — u ishlayotgan filial sifatida tanlanadi va buyurtmalar sahifasi ochiladi. «Hozir» ustuni tanlangan davrga bog'liq emas.
      </p>
    </div>
  );
};

export default BranchOverviewPage;
