import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  Building,
  Building2,
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
import { getQueue, othersQueuedCount, queueWhat, summarizeQueue } from '../../../core/lib/offline';
import { clearSession, isManager as isManagerFn, isOwner } from '../../../core/lib/session';
import { useOwnerFilials, useWorkingFilial } from '../../../core/lib/useWorkingFilial';
import { FilialSwitch } from '../../../core/components/FilialSwitch';
import { saveBlob } from '../../../core/platform';
import { MoneyInput, parseMoneyInput } from '../components/MoneyInput';
import { adjustmentView, signedMoney } from '../lib/adjustments';
import { t } from '../../../core/i18n';

type Period = 'day' | 'week' | 'month' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Bugun' },
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Oy' },
  { value: 'all', label: 'Hammasi' },
];

const diffOf = (s: Shift) => (Number(s.closing_balance) || 0) - (Number(s.expected_closing_balance) || 0);

const DiffBadge: React.FC<{ shift: Shift }> = ({ shift }) => {
  if (!shift.closed_at) return <Badge tone="success" dot>{t('shift.openBadge')}</Badge>;
  const d = diffOf(shift);
  if (d < 0) return <Badge tone="danger">Kamomad {formatMoney(Math.abs(d))}</Badge>;
  if (d > 0) return <Badge tone="warning">Ortiqcha {formatMoney(d)}</Badge>;
  return <Badge tone="success">Balans</Badge>;
};

/** D16: smenadagi to'lanmagan buyurtmalar (savdoga kirmagan, Q42) */
const unpaidOf = (s: Shift | null | undefined) => ({ count: Number(s?.unpaid_orders_count) || 0, total: Number(s?.unpaid_total) || 0 });

/** Buyurtmalar navbati — faqat shu smenadagi to'lanmaganlar filtri bilan */
const unpaidQueueUrl = (s: Shift) => `/orders?unpaid=${encodeURIComponent(s.opened_at)}`;

const UnpaidAlert: React.FC<{ shift: Shift; onShow: () => void }> = ({ shift, onShow }) => {
  const { count, total } = unpaidOf(shift);
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onShow}
      className="w-full min-h-[56px] flex items-center gap-3 rounded-2xl bg-warning-soft text-warning-ink px-4 py-3 text-left cursor-pointer hover:brightness-[0.97] active:brightness-95"
    >
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold tabular-nums">{t('shift.unpaid', { n: count, sum: formatMoney(total) })}</span>
        <span className="block text-[12px] font-medium opacity-90">{t('shift.unpaidHint')}</span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-0.5 text-[14px] font-bold">
        {t('shift.unpaidShow')} <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  );
};

const PERIODS: Period[] = ['day', 'week', 'month', 'all'];

const ShiftPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const manager = isManagerFn();

  // Tab va davr URL'da: rahbar filialni almashtirsa sahifa qayta yuklanadi (Layout), tanlov saqlanib qoladi
  const [params, setParams] = useSearchParams();
  const tab: 'active' | 'history' = !manager && params.get('tab') === 'history' ? 'history' : 'active';
  const period: Period = PERIODS.find((p) => p === params.get('period')) ?? 'day';
  const setParam = (key: string, value: string, fallback: string) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (value === fallback) n.delete(key);
        else n.set(key, value);
        return n;
      },
      { replace: true },
    );
  const setTab = (v: 'active' | 'history') => setParam('tab', v, 'active');
  const setPeriod = (v: Period) => setParam('period', v, 'day');

  // A3: smena filial bo'yicha. Rahbar (bir nechta filial) — sahifadagi tanlagich umumiy filial filtrini
  // o'zgartiradi (hamma ro'yxatga qo'llanadi). Tanlanmagan bo'lsa — joriy smena asosiy filialniki (server ham shunday).
  const owner = isOwner();
  const { filials: ownerFilials } = useOwnerFilials();
  const [workingFilial, setWorkingFilial] = useWorkingFilial();
  const ownerMulti = owner && ownerFilials.length > 1;
  const mainFilial = ownerFilials.find((f) => f.is_main) ?? ownerFilials[0];
  const activeFilialUuid = workingFilial || mainFilial?.uuid || '';
  const filialNameOf = (uuid?: string | null) => ownerFilials.find((f) => f.uuid === uuid)?.filial_name;
  const filialOptions = ownerFilials.map((f) => ({ value: f.uuid, label: f.filial_name, hint: f.is_main ? t('lay.mainFilial') : undefined }));
  /** Rahbar boshqa filial ro'yxatiga o'tadi (masalan, to'lanmaganlar) — umumiy filtr shu smena filialiga */
  const focusFilial = (uuid?: string | null) => {
    if (ownerMulti && uuid && uuid !== workingFilial) setWorkingFilial(uuid);
  };
  // Filial nomi: bir nechta filialli rahbarda va xodimda (qaysi filial smenasini yopayotgani aniq bo'lsin)
  const showFilial = ownerMulti || manager;
  const shiftFilialName = (s: Shift) => s.filial_name || filialNameOf(s.filial_uuid) || undefined;

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
    if (amount < 0) return setOpenError(t('shift.negativeOpening'));
    setOpening(true);
    try {
      await shiftApi.openShift(amount);
      toast.success(t('shift.opened'));
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
      return setCloseError(t('shift.emptyClosing'));
    }
    // D5: oflayn olingan to'lov serverga yetmaguncha kutilgan naqd kam ko'rinadi — smena noto'g'ri yopilmasin
    const queue = getQueue();
    const live = summarizeQueue(queue);
    if (live.pending > 0) {
      return setCloseError(
        `Oflayn navbatda ${queueWhat(live)} hali serverga yetmagan — kutilgan qoldiq noto'g'ri chiqadi. Internet qaytib navbat yuborilgach smenani yoping.`,
      );
    }
    const rejectedPays = queue.filter((o) => o.error && o.payment?.collect).length;
    const others = othersQueuedCount();
    if (rejectedPays || others) {
      const ok = await confirm(
        [
          rejectedPays ? `${rejectedPays} ta oflayn to'lovni server qabul qilmagan (kassadagi naqd hisobga kirmagan).` : '',
          others ? `Bu kompyuterda boshqa xodimning ${others} ta yuborilmagan yozuvi bor (u tizimga kirganda yuboriladi).` : '',
          'Smenani baribir yopasizmi?',
        ]
          .filter(Boolean)
          .join(' '),
        { title: 'Oflayn navbat hal qilinmagan', danger: true, confirmText: 'Baribir yopish', cancelText: 'Orqaga' },
      );
      if (!ok) return;
    }
    // D16: to'lanmagan buyurtmalar yopishni bloklamaydi — faqat ogohlantirish + tasdiq
    const unpaid = unpaidOf(currentShift);
    if (unpaid.count > 0 && currentShift) {
      const ok = await confirm(t('shift.unpaidConfirm', { n: unpaid.count, sum: formatMoney(unpaid.total) }), {
        title: t('shift.unpaidConfirmTitle'),
        confirmText: t('shift.closeAnyway'),
        cancelText: t('shift.unpaidReview'),
        danger: true,
      });
      // Bekor/yopish — oynaga qaytadi: tepada «Ko'rish» ogohlantirishi turadi
      if (!ok) return;
    }
    const amount = parseMoneyInput(closingBalance);
    const expected = Number(currentShift?.expected_closing_balance) || 0;
    if (amount !== expected) {
      const diff = expected - amount;
      const ok = await confirm(
        `Kutilgan qoldiq ${formatMoney(expected)}, siz ${formatMoney(amount)} kiritdingiz. ${
          diff > 0 ? `Kamomad: ${formatMoney(diff)}` : `Ortiqcha: ${formatMoney(Math.abs(diff))}`
        }. Pulni qayta sanadingizmi?`,
        { title: t('shift.mismatchTitle'), confirmText: t('shift.mismatchYes'), cancelText: t('shift.mismatchRecount'), danger: true },
      );
      if (!ok) return;
    }
    setClosing(true);
    try {
      // Rahbar: aynan ko'rsatilgan smena filiali yopiladi (xodimda server o'z filialini oladi)
      const res = await shiftApi.closeShift(amount, owner ? currentShift?.filial_uuid : undefined);
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
    ...(ownerMulti
      ? [{ key: 'filial', header: t('shift.filial'), render: (s: Shift) => s.filial_name || filialNameOf(s.filial_uuid) || '—' }]
      : []),
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
        title={t('shift.title')}
        subtitle={t('shift.subtitle')}
        actions={<IconButton label={t('common.refresh')} variant="outline" onClick={refresh}><RefreshCw className="w-4 h-4" /></IconButton>}
      >
        {!manager && (
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'active', label: t('shift.tabCurrent') },
              { value: 'history', label: t('shift.tabHistory') },
            ]}
          />
        )}
      </PageHeader>

      {tab === 'active' && (
        <div className="space-y-4 mt-1">
          {ownerMulti && (
            // Joriy smena — doim aniq bitta filialniki: «Barcha filiallar» bu yerda yo'q
            <FilialSwitch
              value={activeFilialUuid}
              options={filialOptions}
              onChange={(v) => setWorkingFilial(v || null)}
              subtitle={t('shift.filialPick')}
            />
          )}
          {loadingCurrent ? (
            <LoadingState label={t('shift.loading')} />
          ) : errorCurrent ? (
            <Card><ErrorState message={errorCurrent} onRetry={fetchCurrent} /></Card>
          ) : currentShift ? (
            <ActiveShift
              shift={currentShift}
              filialName={showFilial ? shiftFilialName(currentShift) : undefined}
              onShowUnpaid={() => {
                focusFilial(currentShift.filial_uuid);
                navigate(unpaidQueueUrl(currentShift));
              }}
              onClose={() => {
                setClosingBalance('');
                setCloseError(null);
                setCloseOpen(true);
                // Yopish oynasidagi raqamlar (kutilgan qoldiq, to'lanmaganlar) eng so'nggi holatda bo'lsin
                shiftApi.getCurrentShift().then((s) => s && setCurrentShift(s)).catch(() => {});
              }}
            />
          ) : (
            <Card className="max-w-lg">
              <CardHeader
                icon={<PlayCircle className="w-5 h-5" />}
                title={ownerMulti ? t('shift.notOpenHere') : t('shift.notOpen')}
                subtitle={t('shift.notOpenHint')}
              />
              <form onSubmit={handleOpen} className="space-y-4">
                {openError && <InlineAlert>{openError}</InlineAlert>}
                <MoneyInput
                  label={t('shift.openingCash')}
                  hint={t('shift.openingCashHint')}
                  value={openingBalance}
                  onChange={setOpeningBalance}
                  disabled={opening}
                  placeholder="0"
                />
                <Button type="submit" size="xl" block loading={opening} icon={<PlayCircle className="w-5 h-5" />}>
                  {t('shift.open')}
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && !manager && (
        <div className="space-y-4 mt-1">
          {ownerMulti && (
            <FilialSwitch
              value={workingFilial || ''}
              options={[{ value: '', label: t('lay.allFilials'), hint: t('shift.historyAll') }, ...filialOptions]}
              onChange={(v) => setWorkingFilial(v || null)}
              subtitle={t('shift.filial')}
            />
          )}
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
        title={t('shift.close')}
        subtitle={manager ? t('shift.autoLogout') : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setCloseOpen(false)} disabled={closing} className="md:w-auto w-full">
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="close-shift-form" variant="danger" size="lg" loading={closing} icon={<StopCircle className="w-5 h-5" />} className="md:w-auto w-full">
              {t('shift.close')}
            </Button>
          </>
        }
      >
        <form id="close-shift-form" onSubmit={handleClose} className="space-y-4">
          {showFilial && currentShift && shiftFilialName(currentShift) && (
            <FilialLine name={shiftFilialName(currentShift)!} />
          )}
          {currentShift && (
            <UnpaidAlert
              shift={currentShift}
              onShow={() => {
                if (closing) return;
                setCloseOpen(false);
                focusFilial(currentShift.filial_uuid);
                navigate(unpaidQueueUrl(currentShift));
              }}
            />
          )}
          <div className="rounded-2xl bg-field p-4">
            <div className="text-[13px] text-muted">{t('shift.expectedCash')}</div>
            <div className="text-[24px] font-black tracking-tightest tabular-nums">{formatMoney(currentShift?.expected_closing_balance)}</div>
            {(() => {
              // Kutilgan qoldiq — backend qiymati; tuzatishning naqd qismi unga kiritilgan, bu yerda faqat izoh
              const a = adjustmentView(currentShift);
              if (!a || !a.cash) return null;
              return (
                <div className="mt-2 text-[12px] text-muted leading-snug">
                  <span className="font-semibold text-ink">
                    {t('shift.adjustments')}, {t('shift.adjustmentsCash')}: {signedMoney(a.cash)}
                  </span>
                  {a.cashNegative && <span className="block mt-1 font-semibold text-warning-ink">{t('shift.cashNegativeHint')}</span>}
                </div>
              );
            })()}
          </div>
          {closeError && <InlineAlert>{closeError}</InlineAlert>}
          <MoneyInput
            label={t('shift.actualCash')}
            hint={t('shift.actualCashHint')}
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
        title={t('shift.closed')}
        size="sm"
        footer={
          requiresLogout ? (
            <Button size="lg" block icon={<LogOut className="w-5 h-5" />} onClick={finalLogout}>
              {t('shift.logout')} {countdown !== null ? `(${countdown})` : ''}
            </Button>
          ) : (
            <Button size="lg" block variant="secondary" onClick={() => setClosedResult(null)}>
              {t('common.close')}
            </Button>
          )
        }
      >
        {closedResult && <ShiftSummary shift={closedResult} filialName={showFilial ? shiftFilialName(closedResult) : undefined} />}
        {!requiresLogout && <p className="text-[13px] text-muted mt-4">{t('shift.stayOwner')}</p>}
      </Sheet>

      {/* History detail */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? `Smena #${detail.id}` : ''} subtitle={detail ? formatDateTime(detail.opened_at) : ''} size="md">
        {detail && <ShiftSummary shift={detail} filialName={showFilial ? shiftFilialName(detail) : undefined} />}
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

/** Qaysi filial smenasi — yopish oynasida ko'zga tashlanadigan qator */
const FilialLine: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex items-center gap-2 rounded-2xl bg-brand-soft text-brand px-4 py-3">
    <Building2 className="w-5 h-5 shrink-0" />
    <span className="min-w-0 text-[15px] font-extrabold truncate">
      {t('shift.filial')}: {name}
    </span>
  </div>
);

/** A31/D36: oldingi (yopilgan) smenalardan tushgan qaytarish / tuzatish — alohida qator va izoh */
const AdjustmentRows: React.FC<{ shift: Shift }> = ({ shift }) => {
  const a = adjustmentView(shift);
  if (!a) return null;
  return (
    <>
      <Row label={t('shift.adjustments')} value={signedMoney(a.total)} />
      {a.showCash && <Row label={t('shift.adjustmentsCash')} value={signedMoney(a.cash)} />}
      <AdjustmentHint shift={shift} />
    </>
  );
};

const AdjustmentHint: React.FC<{ shift: Shift }> = ({ shift }) => {
  const a = adjustmentView(shift);
  if (!a) return null;
  return (
    <p className="py-2 text-[12px] text-muted leading-snug">
      {t('shift.adjustmentsHint', { n: a.count })}
      {a.cashNegative && <span className="block mt-1 font-semibold text-warning-ink">{t('shift.cashNegativeHint')}</span>}
    </p>
  );
};

const ActiveShift: React.FC<{ shift: Shift; filialName?: string; onClose: () => void; onShowUnpaid: () => void }> = ({ shift, filialName, onClose, onShowUnpaid }) => (
  <>
    <UnpaidAlert shift={shift} onShow={onShowUnpaid} />
    <Card className="!p-0 overflow-hidden">
      <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-extrabold tracking-tightest">{t('shift.n', { n: shift.id })}</h2>
              <Badge tone="success" dot>{t('shift.openBadge')}</Badge>
            </div>
            <div className="text-[13px] text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{t('shift.openedAt', { n: formatDateTime(shift.opened_at) })}</span>
              {shift.opened_by_name && (
                <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {shift.opened_by_name}</span>
              )}
              {filialName && (
                <span className="inline-flex items-center gap-1 font-semibold text-ink"><Building2 className="w-3.5 h-3.5" /> {filialName}</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="danger" size="lg" icon={<StopCircle className="w-5 h-5" />} onClick={onClose} className="w-full md:w-auto">
          {t('shift.close')}
        </Button>
      </div>
    </Card>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label={t('shift.statExpected')} value={formatMoney(shift.expected_closing_balance, false)} hint={t('shift.sumCash')} icon={<Wallet className="w-4 h-4" />} />
      <StatCard label={t('shift.statRevenue')} value={formatMoney(shift.total_revenue, false)} hint={t('shift.sum')} icon={<TrendingUp className="w-4 h-4" />} tone="gold" />
      <StatCard label={t('shift.statOrders')} value={`${shift.total_orders_count ?? 0}`} hint={t('shift.pcsUnit')} icon={<ShoppingBag className="w-4 h-4" />} tone="info" />
      <StatCard label={t('shift.statOpening')} value={formatMoney(shift.opening_balance, false)} hint={t('shift.sum')} icon={<Banknote className="w-4 h-4" />} tone="neutral" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card>
        <CardHeader title={t('shift.payTypes')} icon={<CreditCard className="w-5 h-5" />} />
        <Row label={t('pay.cash')} value={formatMoney(shift.cash_revenue)} />
        <Row label={t('pay.card')} value={formatMoney(shift.card_revenue)} />
        <AdjustmentRows shift={shift} />
        <Row label={t('shift.openingMoney')} value={formatMoney(shift.opening_balance)} />
        <Row label={t('shift.expectedCash')} value={formatMoney(shift.expected_closing_balance)} strong />
      </Card>
      <Card>
        <CardHeader title={t('shift.serviceTypes')} icon={<Truck className="w-5 h-5" />} />
        <Row label={t('type.delivery')} value={formatMoney(shift.delivery_revenue)} />
        <Row label={t('type.pickup')} value={formatMoney(shift.pickup_revenue)} />
        <Row label={t('type.dineIn')} value={formatMoney(shift.dine_in_revenue)} />
      </Card>
    </div>
  </>
);

const ShiftSummary: React.FC<{ shift: Shift; filialName?: string }> = ({ shift, filialName }) => {
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
        {filialName && <Row label={t('shift.filial')} value={filialName} strong />}
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
        <AdjustmentRows shift={shift} />
        <Row label="Jami" value={formatMoney(shift.total_revenue)} strong />
      </div>
    </div>
  );
};

export default ShiftPage;
