import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCircle2, ListOrdered, Plus, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { useToast } from '../../../core/components/ToastProvider';
import { useRealtime } from '../../../core/realtime/RealtimeProvider';
import type { RealtimeEvent } from '../../../core/realtime/RealtimeProvider';
import { getPartner, isCashier, isShop, wording } from '../../../core/lib/session';
import { useWorkSettings } from '../../../core/lib/workSettings';
import { getErrorMessage } from '../../../core/lib/errors';
import { applyQueuedPayments } from '../../../core/lib/offline';
import { formatMoney, parseDate } from '../../../core/lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Segmented,
  SettingRow,
  Sheet,
  SkeletonList,
  Switch,
  Tabs,
} from '../../../core/ui';
import { QUEUE_GROUPS, statusGroup } from '../utils/status';
import type { QueueGroup } from '../utils/status';
import { OrderCard } from '../components/queue/OrderCard';
import { isPendingLike } from '../components/queue/actions';
import { readPrefs, writePrefs, type QueuePrefs } from '../components/queue/prefs';
import { useOrderActions } from '../components/queue/useOrderActions';
import { t } from '../../../core/i18n';

const DONE_LIMIT = 30;

type TypeFilter = 'ALL' | 'DELIVERY' | 'PICKUP' | 'DINE_IN';

/* ============================================================ page */
const OrdersPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const partner = getPartner();
  const shop = isShop(partner);
  const w = wording(partner);
  const { settings: work, save: saveWork } = useWorkSettings();
  const [savingWork, setSavingWork] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeGroup, setActiveGroup] = useState<QueueGroup>('NEW');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [prefs, setPrefs] = useState<QueuePrefs>(readPrefs);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // `/orders?open=<uuid>` — kassadagi Saboy/Dostavka kartasidan: buyurtma tafsiloti ochiladi
  const [openParams, setOpenParams] = useSearchParams();
  const openUuid = openParams.get('open');
  // D16: `/orders?unpaid=<smena opened_at>` — smena sahifasidan: shu smenadagi to'lanmagan buyurtmalar
  const unpaidParam = openParams.get('unpaid');
  const unpaidSince = unpaidParam === null ? null : (parseDate(unpaidParam)?.getTime() ?? 0);
  const clearUnpaid = () =>
    setOpenParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('unpaid');
        return n;
      },
      { replace: true },
    );

  // Orders that arrived via realtime and haven't been opened/actioned yet.
  const [freshUuids, setFreshUuids] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<{ uuid?: string; message: string; price?: string | number } | null>(null);

  // Ticking clock for elapsed-time chips.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const updatePrefs = (patch: Partial<QueuePrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });
  };

  const toggleFastMode = async (on: boolean) => {
    setSavingWork(true);
    try {
      await saveWork({ fast_mode: on });
      toast.success(on ? 'Tez rejim yoqildi — yangi buyurtmalar o‘zi qabul qilinadi' : "Tez rejim o'chirildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Sozlamani saqlab bo'lmadi."));
    } finally {
      setSavingWork(false);
    }
  };

  /* ------------------------------------------------------- loading */
  // Filial filtri — headerdagi «ishlayotgan filial» (API klient filial_uuid ni o'zi qo'shadi; almashsa sahifa qayta yuklanadi).
  const fetchOrders = useCallback(async (mode: 'initial' | 'silent' | 'manual' = 'silent') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'manual') setRefreshing(true);
    try {
      const data = await ordersApi.getOrders();
      setOrders(Array.isArray(data) ? applyQueuedPayments(data) : []);
      setError(null);
    } catch (err) {
      // Keep showing the last good list on silent refresh failures.
      if (mode !== 'silent') setError(getErrorMessage(err, 'Buyurtmalarni yuklashda xatolik yuz berdi.'));
    } finally {
      if (mode === 'initial') setLoading(false);
      if (mode === 'manual') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders('initial');
  }, [fetchOrders]);

  /* ------------------------------------------------------ realtime */
  const handleRealtime = useCallback(
    (event: RealtimeEvent) => {
      const orderData = event.order_data;
      if (event.type === 'new_order_alert') {
        if (orderData?.uuid) setFreshUuids((s) => new Set(s).add(orderData.uuid));
        setBanner({ uuid: orderData?.uuid, message: event.message || 'Yangi buyurtma keldi', price: orderData?.total_price });
        fetchOrders('silent');
        return;
      }
      if (event.type === 'order_status_update') {
        if (orderData) toast.info(event.message || `Buyurtma holati: ${orderData.status_display || orderData.status}`);
        fetchOrders('silent');
        return;
      }
      // Other order-related notifications (global dispatch timeout, courier accepted, ...)
      if (!orderData && event.message && !/^(table|staff|category|product)_/.test(event.type)) {
        toast.info(event.message);
        fetchOrders('silent');
      }
    },
    [fetchOrders, toast],
  );

  const { isConnected } = useRealtime(handleRealtime);

  // Safety net: poll every 30 s while the socket is down so the queue never goes stale.
  useEffect(() => {
    if (isConnected) return;
    const t = setInterval(() => fetchOrders('silent'), 30000);
    return () => clearInterval(t);
  }, [isConnected, fetchOrders]);

  // "Yangi buyurtma" modali 3 soniyada o'zi yopiladi.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  const unmarkFresh = (uuid: string) =>
    setFreshUuids((s) => {
      if (!s.has(uuid)) return s;
      const n = new Set(s);
      n.delete(uuid);
      return n;
    });

  const { ctx, busyUuid, runAction, openOrder: openByUuid, sheets } = useOrderActions({
    orders,
    setOrders,
    refresh: () => fetchOrders('silent'),
    now,
    skipPreparing: prefs.skipPreparing,
    fastMode: work.fast_mode,
    onTouched: unmarkFresh,
  });
  const openOrder = (o: Order) => openByUuid(o.uuid);

  /* ------------------------------------------------------- derived */
  const typeFiltered = useMemo(
    () => (typeFilter === 'ALL' ? orders : orders.filter((o) => o.delivery_type === typeFilter)),
    [orders, typeFilter],
  );

  const grouped = useMemo(() => {
    const g: Record<QueueGroup, Order[]> = { NEW: [], PREPARING: [], READY: [], ON_THE_WAY: [], DONE: [] };
    typeFiltered.forEach((o) => g[statusGroup(o.status)].push(o));
    // Oldest first for active work (FIFO), newest first for history.
    // created_at may be ISO or 'dd-MM-yyyy HH:mm' — compare parsed timestamps, not strings.
    const ts = (o: Order) => parseDate(o.created_at)?.getTime() ?? 0;
    const byTime = (a: Order, b: Order) => ts(a) - ts(b);
    (Object.keys(g) as QueueGroup[]).forEach((k) => {
      g[k].sort(byTime);
      if (k === 'DONE') g[k].reverse();
    });
    return g;
  }, [typeFiltered]);

  // Smena hisobi bilan bir xil: bekor/rad etilganlarsiz, smena ochilgandan keyin yaratilgan, to'lanmagan
  const unpaidList = useMemo(() => {
    if (unpaidSince === null) return [];
    const ts = (o: Order) => parseDate(o.created_at)?.getTime() ?? 0;
    return typeFiltered
      .filter((o) => !o.is_paid && o.status !== 'CANCELLED' && o.status !== 'REJECTED' && ts(o) >= unpaidSince)
      .sort((a, b) => ts(a) - ts(b));
  }, [typeFiltered, unpaidSince]);
  const unpaidSum = useMemo(() => unpaidList.reduce((s, o) => s + (Number(o.total_price) || 0), 0), [unpaidList]);

  const typeOptions = useMemo(() => {
    const opts: { value: TypeFilter; label: string }[] = [{ value: 'ALL', label: 'Barchasi' }, { value: 'DELIVERY', label: 'Yetkazish' }];
    if (!shop || orders.some((o) => o.delivery_type === 'PICKUP')) opts.push({ value: 'PICKUP', label: 'Olib ketish' });
    if (!shop || orders.some((o) => o.delivery_type === 'DINE_IN')) opts.push({ value: 'DINE_IN', label: 'Zalda' });
    return opts;
  }, [orders, shop]);

  useEffect(() => {
    if (!openUuid || !orders.some((o) => o.uuid === openUuid)) return;
    openByUuid(openUuid);
    // Faqat `open` olib tashlanadi — `unpaid` filtri saqlansin
    setOpenParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('open');
        return n;
      },
      { replace: true },
    );
  }, [openUuid, orders, setOpenParams, openByUuid]);

  const groupLabel = (key: QueueGroup, fallback: string) => (key === 'PREPARING' ? w.preparing : fallback);

  /* -------------------------------------------------------- render */
  const renderList = (list: Order[], opts: { dense?: boolean; group: QueueGroup }) => {
    if (list.length === 0) {
      return (
        <EmptyState
          className="py-10"
          icon={<ListOrdered className="w-7 h-7" />}
          title={opts.group === 'NEW' ? "Yangi buyurtmalar yo'q" : "Bu bo'limda buyurtma yo'q"}
          description={opts.group === 'NEW' ? 'Yangi buyurtma kelganda shu yerda paydo bo‘ladi va ovozli signal chalinadi.' : undefined}
        />
      );
    }
    const shown = opts.group === 'DONE' ? list.slice(0, DONE_LIMIT) : list;
    return (
      <>
        {shown.map((o) => (
          <OrderCard
            key={o.uuid}
            order={o}
            now={now}
            ctx={ctx}
            dense={opts.dense}
            showStatus={opts.group === 'PREPARING' || opts.group === 'DONE'}
            highlighted={freshUuids.has(o.uuid) && isPendingLike(o.status)}
            busy={busyUuid === o.uuid}
            onOpen={() => openOrder(o)}
            onAction={(a) => runAction(o, a)}
          />
        ))}
        {opts.group === 'DONE' && list.length > DONE_LIMIT && (
          <Button variant="ghost" block onClick={() => navigate('/all-orders')}>
            Barcha tarixni ko'rish ({list.length})
          </Button>
        )}
      </>
    );
  };

  const desktopGroups = QUEUE_GROUPS.filter((g) => prefs.showDoneColumn || g.key !== 'DONE');

  return (
    <div>
      <PageHeader
        title="Buyurtmalar"
        subtitle={
          loading ? 'Yuklanmoqda...' : `${grouped.NEW.length} ta yangi · ${grouped.PREPARING.length + grouped.READY.length + grouped.ON_THE_WAY.length} ta faol`
        }
        actions={
          <>
            <IconButton label="Yangilash" variant="outline" onClick={() => fetchOrders('manual')} disabled={refreshing}>
              <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`} />
            </IconButton>
            <IconButton label="Navbat sozlamalari" variant="outline" onClick={() => setPrefsOpen(true)}>
              <SlidersHorizontal className="w-[18px] h-[18px]" />
            </IconButton>
            {/* Kassadan yangi buyurtma — 2-bosqich (ctx.pos) */}
            {ctx.pos !== false && (
              <Button className="md:hidden" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-order')} aria-label="Yangi buyurtma">
                Yangi
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Phone/tablet: status tabs */}
          {unpaidSince === null && (
            <Tabs
              className="lg:hidden"
              value={activeGroup}
              onChange={setActiveGroup}
              options={QUEUE_GROUPS.map((g) => ({ value: g.key, label: groupLabel(g.key, g.label), count: grouped[g.key].length }))}
            />
          )}
          <div className="flex items-center gap-2 min-w-0">
            {typeOptions.length > 2 && <Segmented value={typeFilter} onChange={setTypeFilter} options={typeOptions} />}
          </div>
          {!isConnected && (
            <span className="lg:ml-auto text-[12px] font-semibold text-warning-ink">Real-vaqt aloqa uzilgan — har 30 soniyada yangilanadi</span>
          )}
        </div>
      </PageHeader>

      {/* Yangi buyurtma — katta markaziy modal; 3 soniyada o'zi yopiladi */}
      {banner && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setBanner(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface shadow-pop animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Yopish"
              onClick={() => setBanner(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="bg-brand px-6 pb-7 pt-8 text-center text-white">
              <span className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 animate-bounce">
                <Bell className="h-10 w-10" />
              </span>
              <div className="text-[13px] font-bold uppercase tracking-[0.18em] opacity-90">Yangi buyurtma!</div>
              <div className="mt-1.5 text-[19px] font-black leading-snug break-words">{banner.message}</div>
              {banner.price !== undefined && (
                <div className="mt-3 text-[34px] font-black leading-none tabular-nums">{formatMoney(banner.price)}</div>
              )}
            </div>
            <div className="flex gap-2.5 p-4">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setBanner(null)}>
                Yopish
              </Button>
              {banner.uuid && (
                <Button
                  variant="gold"
                  size="lg"
                  className="flex-[2]"
                  onClick={() => {
                    setActiveGroup('NEW');
                    if (orders.some((o) => o.uuid === banner.uuid)) openOrder(orders.find((o) => o.uuid === banner.uuid)!);
                    setBanner(null);
                  }}
                >
                  Ko'rish
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} className="mt-2" />
      ) : error && orders.length === 0 ? (
        <ErrorState message={error} onRetry={() => fetchOrders('initial')} />
      ) : unpaidSince !== null ? (
        <div className="mt-1 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-warning-soft text-warning-ink px-4 py-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold">{t('queue.unpaidTitle')}</div>
                <div className="text-[13px] font-semibold tabular-nums">{t('queue.unpaidSummary', { n: unpaidList.length, sum: formatMoney(unpaidSum) })}</div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" onClick={clearUnpaid} className="flex-1 sm:flex-none">{t('queue.clearFilter')}</Button>
              <Button onClick={() => navigate('/shift')} className="flex-1 sm:flex-none">{t('queue.backToShift')}</Button>
            </div>
          </div>
          {unpaidList.length === 0 ? (
            <EmptyState className="py-10" icon={<CheckCircle2 className="w-7 h-7" />} title={t('queue.unpaidEmpty')} description={t('queue.unpaidEmptyHint')} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {unpaidList.map((o) => (
                <OrderCard
                  key={o.uuid}
                  order={o}
                  now={now}
                  ctx={ctx}
                  showStatus
                  busy={busyUuid === o.uuid}
                  onOpen={() => openOrder(o)}
                  onAction={(a) => runAction(o, a)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Phone / tablet: one group at a time */}
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
            {renderList(grouped[activeGroup], { group: activeGroup })}
          </div>

          {/* Desktop: status columns */}
          <div className="hidden lg:grid gap-3 mt-1" style={{ gridTemplateColumns: `repeat(${desktopGroups.length}, minmax(0, 1fr))` }}>
            {desktopGroups.map((g) => {
              const list = grouped[g.key];
              return (
                <section key={g.key} className="flex flex-col min-w-0 rounded-2xl bg-surface2 border border-edge h-[calc(100vh-220px)] min-h-[420px]">
                  <header className="flex items-center justify-between px-3.5 h-12 border-b border-edge shrink-0">
                    <h2 className="text-[14px] font-extrabold text-ink tracking-tightest truncate">{groupLabel(g.key, g.label)}</h2>
                    <span
                      className={`min-w-[26px] h-6 px-2 rounded-lg text-[12px] font-extrabold flex items-center justify-center tabular-nums ${
                        g.key === 'NEW' && list.length > 0 ? 'bg-gold text-ink' : 'bg-field text-muted'
                      }`}
                    >
                      {list.length}
                    </span>
                  </header>
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">{renderList(list, { dense: desktopGroups.length >= 5, group: g.key })}</div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {sheets}

      {/* Queue preferences */}
      <Sheet open={prefsOpen} onClose={() => setPrefsOpen(false)} title="Navbat sozlamalari" size="sm">
        <div className="divide-y divide-edge">
          <SettingRow
            title="Tez rejim"
            description={
              shop
                ? "Buyurtmani har doim o'zingiz qabul qilasiz; keyingi qadamlar qisqaradi. Barcha qurilmalarda amal qiladi."
                : "Kichik kafe uchun: buyurtmani o'zingiz qabul qilasiz, keyin olib ketish va zal buyurtmasi bitta tugma bilan beriladi. Barcha qurilmalarda amal qiladi."
            }
            control={
              <Switch
                checked={work.fast_mode}
                disabled={savingWork || isCashier(partner)}
                onChange={toggleFastMode}
                label="Tez rejim"
              />
            }
          />
          {!work.fast_mode && (
          <SettingRow
            title={`"${w.preparing}" bosqichini o'tkazib yuborish`}
            description={`Qabul qilingan buyurtma to'g'ridan-to'g'ri "Tayyor" bo'ladi. Tez xizmat ko'rsatadigan ${shop ? "do'konlar" : 'joylar'} uchun.`}
            control={<Switch checked={prefs.skipPreparing} onChange={(v) => updatePrefs({ skipPreparing: v })} label="Bosqichni o'tkazib yuborish" />}
          />
          )}
          <SettingRow
            title='"Yakunlangan" ustunini ko‘rsatish'
            description="Faqat kompyuter ekranida. Telefonda bu bo‘lim tabda qoladi."
            control={<Switch checked={prefs.showDoneColumn} onChange={(v) => updatePrefs({ showDoneColumn: v })} label="Yakunlangan ustuni" />}
          />
        </div>
        <p className="mt-3 text-[12px] text-muted">Avtomatik chek chop etish va nusxalar soni — Sozlamalar bo'limida.</p>
      </Sheet>
    </div>
  );
};

export default OrdersPage;
