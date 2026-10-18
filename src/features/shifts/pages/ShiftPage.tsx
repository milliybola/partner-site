import React, { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  Building,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  LogOut,
  PlayCircle,
  RefreshCw,
  ShoppingBag,
  StopCircle,
  TrendingUp,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import { shiftApi } from '../services/shiftApi';
import type { Shift } from '../services/shiftApi';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataList,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingState,
  PageHeader,
  Segmented,
  Sheet,
  SkeletonList,
  StatCard,
  Tabs,
} from '../../../core/ui';
import type { Column } from '../../../core/ui';
import { formatDateTime, formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { clearSession, isManager as isManagerFn } from '../../../core/lib/session';
import { saveBlob } from '../../../core/platform';
import { MoneyInput, parseMoneyInput } from '../components/MoneyInput';

type Period = 'day' | 'week' | 'month' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Bugun' },
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Oy' },
  { value: 'all', label: 'Hammasi' },
];

const diffOf = (s: Shift) => (Number(s.closing_balance) || 0) - (Number(s.expected_closing_balance) || 0);

const DiffBadge: React.FC<{ shift: Shift }> = ({ shift }) => {
  if (!shift.closed_at) return <Badge tone="success" dot>Ochiq</Badge>;
  const d = diffOf(shift);
  if (d < 0) return <Badge tone="danger">Kamomad {formatMoney(Math.abs(d))}</Badge>;
  if (d > 0) return <Badge tone="warning">Ortiqcha {formatMoney(d)}</Badge>;
  return <Badge tone="success">Balans</Badge>;
};

const ShiftPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const manager = isManagerFn();

  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [period, setPeriod] = useState<Period>('day');

  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [errorCurrent, setErrorCurrent] = useState<string | null>(null);

  const [history, setHistory] = useState<Shift[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);

  const [openingBalance, setOpeningBalance] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closingBalance, setClosingBalance] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const [closedResult, setClosedResult] = useState<Shift | null>(null);
  const [requiresLogout, setRequiresLogout] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<Shift | null>(null);

  const fetchCurrent = useCallback(async () => {
    setLoadingCurrent(true);
    setErrorCurrent(null);
    try {
      setCurrentShift(await shiftApi.getCurrentShift());
    } catch (err) {
      setErrorCurrent(getErrorMessage(err, "Joriy smena ma'lumotlarini yuklab bo'lmadi."));
    } finally {
      setLoadingCurrent(false);
    }
  }, []);

  const fetchHistory = useCallback(async (p: Period) => {
    setLoadingHistory(true);
    setErrorHistory(null);
    try {
      setHistory(await shiftApi.getShifts(p));
    } catch (err) {
      setErrorHistory(getErrorMessage(err, 'Smenalar tarixini yuklab bo‘lmadi.'));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  useEffect(() => {
    if (tab === 'history' && !manager) fetchHistory(period);
  }, [tab, period, manager, fetchHistory]);

  // BUGFIX: forced logout after a manager closes a shift used to only clear
  // storage + navigate; we now also reload so the realtime socket and every
  // in-memory cache of the old session are dropped.
  const finalLogout = useCallback(() => {
    clearSession();
    window.location.hash = '#/login';
    window.location.reload();
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      finalLogout();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, finalLogout]);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpenError(null);
    const amount = parseMoneyInput(openingBalance);
    if (amount < 0) return setOpenError("Boshlang'ich summa manfiy bo'lishi mumkin emas.");
    setOpening(true);
    try {
      await shiftApi.openShift(amount);
      toast.success('Smena ochildi');
      setOpeningBalance('');
      fetchCurrent();
    } catch (err) {
      setOpenError(getErrorMessage(err, "Smenani ochib bo'lmadi."));
    } finally {
      setOpening(false);
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloseError(null);
    // An empty field must never silently become 0 — that is how false "Kamomad"
    // reports were created (shift closed with 0 while cash was in the drawer).
    if (!closingBalance.trim()) {
      return setCloseError("Kassadagi naqd pulni sanab, haqiqiy summani kiriting. Maydon bo'sh bo'lishi mumkin emas.");
    }
    const amount = parseMoneyInput(closingBalance);
    const expected = Number(currentShift?.expected_closing_balance) || 0;
    if (amount !== expected) {
      const diff = expected - amount;
      const ok = await confirm(
        `Kutilgan qoldiq ${formatMoney(expected)}, siz ${formatMoney(amount)} kiritdingiz. ${
          diff > 0 ? `Kamomad: ${formatMoney(diff)}` : `Ortiqcha: ${formatMoney(Math.abs(diff))}`
        }. Pulni qayta sanadingizmi?`,
        { title: 'Kassa summasi mos kelmadi', confirmText: "Ha, summa to'g'ri", cancelText: 'Qayta sanayman', danger: true },
      );
      if (!ok) return;
    }
    setClosing(true);
    try {
      const res = await shiftApi.closeShift(amount);
      // BUGFIX: a `success: false` response used to be ignored silently.
      if (!res?.success) {
        setCloseError(res?.message || "Smenani yopib bo'lmadi.");
        return;
      }
      setCloseOpen(false);
      setClosedResult(res.data);
      setRequiresLogout(!!res.requires_logout);
      if (res.requires_logout) setCountdown(8);
      else fetchCurrent();
    } catch (err) {
      setCloseError(getErrorMessage(err, "Smenani yopib bo'lmadi."));
    } finally {
      setClosing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await shiftApi.exportShiftsExcel(period);
      const ext = blob.type === 'text/csv' ? 'csv' : 'xlsx';
      saveBlob(blob, `Smenalar_${period}_${new Date().toISOString().slice(0, 10)}.${ext}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Excel hisobotini yuklab bo'lmadi."));
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => {
    fetchCurrent();
    if (tab === 'history') fetchHistory(period);
  };

  const columns: Column<Shift>[] = [
    {
      key: 'id',
      header: 'Smena',
      primary: true,
      render: (s) => (
        <div className="min-w-0">
          <div className="font-bold">#{s.id}</div>
          <div className="text-[12px] text-muted font-normal md:hidden">{formatDateTime(s.opened_at)}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Holat', mobileAside: true, render: (s) => <DiffBadge shift={s} /> },
    { key: 'opened', header: 'Ochilgan', mobileHidden: true, render: (s) => <span className="tabular-nums">{formatDateTime(s.opened_at)}</span> },
    { key: 'closed', header: 'Yopilgan', render: (s) => <span className="tabular-nums">{s.closed_at ? formatDateTime(s.closed_at) : '—'}</span> },
    { key: 'by', header: 'Kassir', render: (s) => s.opened_by_name || '—' },
    { key: 'orders', header: 'Buyurtmalar', align: 'right', render: (s) => `${s.total_orders_count ?? 0} ta` },
    {
      key: 'cash',
      header: 'Kassa (haqiqiy / kutilgan)',
      align: 'right',
      render: (s) => (
        <div className="tabular-nums">
          <div className="font-semibold">{s.closed_at ? formatMoney(s.closing_balance) : '—'}</div>
          <div className="text-[12px] text-muted">{formatMoney(s.expected_closing_balance)}</div>
        </div>
      ),
    },
    { key: 'rev', header: 'Tushum', align: 'right', render: (s) => <span className="font-bold tabular-nums">{formatMoney(s.total_revenue)}</span> },
  ];

  return (
    <div className="pb-6">
      <PageHeader
        title="Smena"
        subtitle="Kassa smenasi, tushum va hisobotlar"
        actions={<IconButton label="Yangilash" variant="outline" onClick={refresh}><RefreshCw className="w-4 h-4" /></IconButton>}
      >
        {!manager && (
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'active', label: 'Joriy smena' },
              { value: 'history', label: 'Tarix' },
            ]}
          />
        )}
      </PageHeader>

      {tab === 'active' && (
        <div className="space-y-4 mt-1">
          {loadingCurrent ? (
            <LoadingState label="Smena yuklanmoqda..." />
          ) : errorCurrent ? (
            <Card><ErrorState message={errorCurrent} onRetry={fetchCurrent} /></Card>
          ) : currentShift ? (
            <ActiveShift shift={currentShift} onClose={() => { setClosingBalance(''); setCloseError(null); setCloseOpen(true); }} />
          ) : (
            <Card className="max-w-lg">
              <CardHeader
                icon={<PlayCircle className="w-5 h-5" />}
                title="Smena ochilmagan"
                subtitle="Buyurtmalarni kassaga yozish uchun avval smenani oching"
              />
              <form onSubmit={handleOpen} className="space-y-4">
                {openError && <InlineAlert>{openError}</InlineAlert>}
                <MoneyInput
                  label="Boshlang'ich naqd pul"
                  hint="Kassadagi qaytim puli (odatda 0)"
                  value={openingBalance}
                  onChange={setOpeningBalance}
                  disabled={opening}
                  placeholder="0"
                />
                <Button type="submit" size="xl" block loading={opening} icon={<PlayCircle className="w-5 h-5" />}>
                  Smenani ochish
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && !manager && (
        <div className="space-y-4 mt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Segmented value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
            <Button variant="outline" icon={<Download className="w-4 h-4" />} loading={exporting} onClick={handleExport} className="w-full sm:w-auto">
              Excel yuklab olish
            </Button>
          </div>
          {loadingHistory ? (
            <SkeletonList rows={5} />
          ) : errorHistory ? (
            <Card><ErrorState message={errorHistory} onRetry={() => fetchHistory(period)} /></Card>
          ) : (
            <DataList
              rows={history}
              columns={columns}
              rowKey={(s) => s.uuid || String(s.id)}
              onRowClick={setDetail}
              empty={<Card><EmptyState icon={<Clock className="w-7 h-7" />} title="Smenalar topilmadi" description="Tanlangan davrda smena ochilmagan." /></Card>}
            />
          )}
        </div>
      )}

      {/* Close shift */}
      <Sheet
        open={closeOpen && !!currentShift}
        onClose={() => !closing && setCloseOpen(false)}
        persistent={closing}
        title="Smenani yopish"
        subtitle={manager ? "Yopilgandan so'ng tizimdan avtomatik chiqasiz" : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setCloseOpen(false)} disabled={closing} className="md:w-auto w-full">
              Bekor qilish
            </Button>
            <Button type="submit" form="close-shift-form" variant="danger" size="lg" loading={closing} icon={<StopCircle className="w-5 h-5" />} className="md:w-auto w-full">
              Smenani yopish
            </Button>
          </>
        }
      >
        <form id="close-shift-form" onSubmit={handleClose} className="space-y-4">
          <div className="rounded-2xl bg-field p-4">
            <div className="text-[13px] text-muted">Kutilgan kassa qoldig'i</div>
            <div className="text-[24px] font-black tracking-tightest tabular-nums">{formatMoney(currentShift?.expected_closing_balance)}</div>
          </div>
          {closeError && <InlineAlert>{closeError}</InlineAlert>}
          <MoneyInput
            label="Kassadagi haqiqiy naqd pul"
            hint="Pulni sanab, aniq summani kiriting"
            value={closingBalance}
            onChange={setClosingBalance}
            disabled={closing}
            autoFocus
            required
          />
        </form>
      </Sheet>

      {/* Close result */}
      <Sheet
        open={!!closedResult}
        onClose={() => (requiresLogout ? finalLogout() : setClosedResult(null))}
        persistent={requiresLogout}
        title="Smena yopildi"
        size="sm"
        footer={
          requiresLogout ? (
            <Button size="lg" block icon={<LogOut className="w-5 h-5" />} onClick={finalLogout}>
              Tizimdan chiqish {countdown !== null ? `(${countdown})` : ''}
            </Button>
          ) : (
            <Button size="lg" block variant="secondary" onClick={() => setClosedResult(null)}>
              Yopish
            </Button>
          )
        }
      >
        {closedResult && <ShiftSummary shift={closedResult} />}
        {!requiresLogout && <p className="text-[13px] text-muted mt-4">Egasi hisobi bilan tizimda qolasiz.</p>}
      </Sheet>

      {/* History detail */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? `Smena #${detail.id}` : ''} subtitle={detail ? formatDateTime(detail.opened_at) : ''} size="md">
        {detail && <ShiftSummary shift={detail} />}
      </Sheet>
    </div>
  );
};

/* ------------------------------------------------------------- pieces */

const Row: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-center justify-between gap-3 py-2.5 border-b border-edge last:border-0">
    <span className="text-[14px] text-muted">{label}</span>
    <span className={`text-[14px] tabular-nums text-right ${strong ? 'font-extrabold text-ink' : 'font-semibold text-ink'}`}>{value}</span>
  </div>
);

const ActiveShift: React.FC<{ shift: Shift; onClose: () => void }> = ({ shift, onClose }) => (
  <>
    <Card className="!p-0 overflow-hidden">
      <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-extrabold tracking-tightest">Smena #{shift.id}</h2>
              <Badge tone="success" dot>Ochiq</Badge>
            </div>
            <div className="text-[13px] text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>Ochilgan: {formatDateTime(shift.opened_at)}</span>
              {shift.opened_by_name && (
                <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {shift.opened_by_name}</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="danger" size="lg" icon={<StopCircle className="w-5 h-5" />} onClick={onClose} className="w-full md:w-auto">
          Smenani yopish
        </Button>
      </div>
    </Card>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Kutilgan kassa" value={formatMoney(shift.expected_closing_balance, false)} hint="so'm, naqd" icon={<Wallet className="w-4 h-4" />} />
      <StatCard label="Jami tushum" value={formatMoney(shift.total_revenue, false)} hint="so'm" icon={<TrendingUp className="w-4 h-4" />} tone="gold" />
      <StatCard label="Buyurtmalar" value={`${shift.total_orders_count ?? 0}`} hint="ta" icon={<ShoppingBag className="w-4 h-4" />} tone="info" />
      <StatCard label="Boshlang'ich" value={formatMoney(shift.opening_balance, false)} hint="so'm" icon={<Banknote className="w-4 h-4" />} tone="neutral" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card>
        <CardHeader title="To'lov turlari" icon={<CreditCard className="w-5 h-5" />} />
        <Row label="Naqd" value={formatMoney(shift.cash_revenue)} />
        <Row label="Karta" value={formatMoney(shift.card_revenue)} />
        <Row label="Boshlang'ich pul" value={formatMoney(shift.opening_balance)} />
        <Row label="Kutilgan kassa qoldig'i" value={formatMoney(shift.expected_closing_balance)} strong />
      </Card>
      <Card>
        <CardHeader title="Xizmat turlari" icon={<Truck className="w-5 h-5" />} />
        <Row label="Yetkazib berish" value={formatMoney(shift.delivery_revenue)} />
        <Row label="Olib ketish" value={formatMoney(shift.pickup_revenue)} />
        <Row label="Zalda" value={formatMoney(shift.dine_in_revenue)} />
      </Card>
    </div>
  </>
);

const ShiftSummary: React.FC<{ shift: Shift }> = ({ shift }) => {
  const d = diffOf(shift);
  return (
    <div className="space-y-4">
      {shift.closed_at && (
        <InlineAlert
          tone={d < 0 ? 'danger' : d > 0 ? 'warning' : 'success'}
          icon={d === 0 ? <CheckCircle2 className="w-4 h-4" /> : undefined}
        >
          {d < 0 ? `Kamomad: ${formatMoney(Math.abs(d))}` : d > 0 ? `Ortiqcha: ${formatMoney(d)}` : "Kassa balansi to'g'ri"}
        </InlineAlert>
      )}
      <div>
        <Row label="Ochilgan" value={formatDateTime(shift.opened_at)} />
        <Row label="Yopilgan" value={shift.closed_at ? formatDateTime(shift.closed_at) : '—'} />
        <Row label="Ochgan" value={shift.opened_by_name || '—'} />
        {shift.closed_by_name && <Row label="Yopgan" value={shift.closed_by_name} />}
        <Row label="Buyurtmalar" value={`${shift.total_orders_count ?? 0} ta`} />
        <Row label="Boshlang'ich pul" value={formatMoney(shift.opening_balance)} />
        <Row label="Kutilgan qoldiq" value={formatMoney(shift.expected_closing_balance)} />
        <Row label="Haqiqiy qoldiq" value={shift.closing_balance !== null ? formatMoney(shift.closing_balance) : '—'} strong />
      </div>
      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-1 flex items-center gap-1.5">
          <Building className="w-3.5 h-3.5" /> Tushum
        </div>
        <Row label="Naqd" value={formatMoney(shift.cash_revenue)} />
        <Row label="Karta" value={formatMoney(shift.card_revenue)} />
        <Row label="Yetkazib berish" value={formatMoney(shift.delivery_revenue)} />
        <Row label="Olib ketish" value={formatMoney(shift.pickup_revenue)} />
        <Row label="Zalda" value={formatMoney(shift.dine_in_revenue)} />
        <Row label="Jami" value={formatMoney(shift.total_revenue)} strong />
      </div>
    </div>
  );
};

export default ShiftPage;
