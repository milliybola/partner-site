import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ListOrdered, Plus, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { filialApi } from '../services/filialApi';
import type { PartnerFilial } from '../services/filialApi';
import { tablesApi } from '../../tables/services/tablesApi';
import type { TableModel } from '../../tables/services/tablesApi';
import { couriersApi } from '../../staff/services/couriersApi';
import type { CourierModel } from '../../staff/services/couriersApi';
import { printReceipt as printReceiptUtil, printPreCheck as printPreCheckUtil } from '../utils/printing';
import { EditOrderModal } from '../components/EditOrderModal';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useRealtime } from '../../../core/realtime/RealtimeProvider';
import type { RealtimeEvent } from '../../../core/realtime/RealtimeProvider';
import { getPartner, isManager, isShop, wording } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, parseDate } from '../../../core/lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Segmented,
  Select,
  SettingRow,
  Sheet,
  SkeletonList,
  Switch,
  Tabs,
} from '../../../core/ui';
import { QUEUE_GROUPS, statusGroup } from '../utils/status';
import type { QueueGroup } from '../utils/status';
import { OrderCard } from '../components/queue/OrderCard';
import { OrderDetailSheet } from '../components/queue/OrderDetailSheet';
import { PaymentSheet } from '../components/queue/PaymentSheet';
import type { PaymentMethod } from '../components/queue/PaymentSheet';
import { CourierPickerSheet } from '../components/queue/CourierPickerSheet';
import { HANDED_NOTE, isPendingLike, orderNo } from '../components/queue/actions';
import type { ActionContext, QueueAction } from '../components/queue/actions';

/* ------------------------------------------------------------ prefs */
// Legacy key (kept for compatibility): list of visible kanban statuses. Absence of
// PREPARING meant "skip the preparing stage" — we keep honoring that.
const LEGACY_VISIBILITY_KEY = 'milliygo_kanban_visible_statuses';
const PREFS_KEY = 'milliygo_queue_prefs';

interface QueuePrefs {
  skipPreparing: boolean;
  showDoneColumn: boolean;
}

const readPrefs = (): QueuePrefs => {
  const prefs: QueuePrefs = { skipPreparing: false, showDoneColumn: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...prefs, ...JSON.parse(raw) };
    const legacy = localStorage.getItem(LEGACY_VISIBILITY_KEY);
    if (legacy) {
      const list: string[] = JSON.parse(legacy);
      prefs.skipPreparing = Array.isArray(list) && !list.includes('PREPARING');
      prefs.showDoneColumn = !Array.isArray(list) || list.includes('COMPLETED');
    }
  } catch {
    /* ignore */
  }
  return prefs;
};

const writePrefs = (p: QueuePrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};

const DONE_LIMIT = 30;

type TypeFilter = 'ALL' | 'DELIVERY' | 'PICKUP' | 'DINE_IN';

/* ============================================================ page */
const OrdersPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const partner = getPartner();
  const manager = isManager(partner);
  const shop = isShop(partner);
  const w = wording(partner);
  const partnerUuid = partner?.uuid;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeGroup, setActiveGroup] = useState<QueueGroup>('NEW');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [prefs, setPrefs] = useState<QueuePrefs>(readPrefs);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [printingUuid, setPrintingUuid] = useState<string | null>(null);

  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [courierOrder, setCourierOrder] = useState<Order | null>(null);
  const [couriers, setCouriers] = useState<CourierModel[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [assigningCourierUuid, setAssigningCourierUuid] = useState<string | null>(null);

  const [filials, setFilials] = useState<PartnerFilial[]>([]);
  const [filialUuid, setFilialUuid] = useState('');
  const [tables, setTables] = useState<TableModel[]>([]);

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

  const ctx: ActionContext = { skipPreparing: prefs.skipPreparing, hasOwnCouriers: couriers.length > 0, shop };

  /* ------------------------------------------------------- loading */
  // BUGFIX: fetchOrders used to be memoized with [] deps while reading the
  // selected filial from state, so every silent/realtime refresh dropped the
  // filial filter. The filter now lives in a ref.
  const filialRef = useRef('');
  filialRef.current = filialUuid;

  const fetchOrders = useCallback(async (mode: 'initial' | 'silent' | 'manual' = 'silent') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'manual') setRefreshing(true);
    try {
      const data = await ordersApi.getOrders({ filialUuid: filialRef.current || undefined });
      setOrders(Array.isArray(data) ? data : []);
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

  useEffect(() => {
    couriersApi
      .getCouriers()
      .then(setCouriers)
      .catch(() => setCouriers([]));
    if (!shop) {
      tablesApi
        .getTables()
        .then(setTables)
        .catch(() => setTables([]));
    }
    if (!manager) {
      filialApi
        .getFilials()
        .then(setFilials)
        .catch(() => setFilials([]));
    }
  }, [manager, shop]);

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

  const typeOptions = useMemo(() => {
    const opts: { value: TypeFilter; label: string }[] = [{ value: 'ALL', label: 'Barchasi' }, { value: 'DELIVERY', label: 'Yetkazish' }];
    if (!shop || orders.some((o) => o.delivery_type === 'PICKUP')) opts.push({ value: 'PICKUP', label: 'Olib ketish' });
    if (!shop || orders.some((o) => o.delivery_type === 'DINE_IN')) opts.push({ value: 'DINE_IN', label: 'Zalda' });
    return opts;
  }, [orders, shop]);

  const selectedOrder = selectedUuid ? orders.find((o) => o.uuid === selectedUuid) || null : null;

  const groupLabel = (key: QueueGroup, fallback: string) => (key === 'PREPARING' ? w.preparing : fallback);

  /* ------------------------------------------------------- actions */
  const freeTableForOrder = useCallback(
    (order: Order | undefined | null) => {
      if (!order || order.delivery_type !== 'DINE_IN' || !order.table_number) return;
      const table = tables.find((t) => t.table_number === order.table_number);
      if (!table) return;
      tablesApi.updateTableStatus(table.uuid, 'AVAILABLE').catch((err) => console.error('Failed to free table:', err));
    },
    [tables],
  );

  const handlePrintReceipt = useCallback(
    async (orderUuid: string, withQr: boolean) => {
      setPrintingUuid(orderUuid);
      try {
        await printReceiptUtil(orderUuid, withQr);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Chekni chop etishda xatolik yuz berdi.'));
      } finally {
        setPrintingUuid(null);
      }
    },
    [toast],
  );

  const handlePrintPreCheck = useCallback(
    async (order: Order) => {
      try {
        await printPreCheckUtil(order);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Pre-chekni chop etishda xatolik yuz berdi.'));
      }
    },
    [toast],
  );

  const autoPrintEnabled = () => {
    try {
      return localStorage.getItem('milliygo_auto_print') === 'true';
    } catch {
      return false;
    }
  };

  // 409 HANDED_TO_COURIER: kuryer buyurtmani olgan — xabar ko'rsatib, ro'yxatni yangilaymiz.
  const reportActionError = (err: any, fallback: string) => {
    if (err?.response?.status === 409 && err?.response?.data?.code === 'HANDED_TO_COURIER') {
      toast.error(err.response.data.message || HANDED_NOTE);
      setCourierOrder(null);
      fetchOrders('silent');
      return;
    }
    toast.error(getErrorMessage(err, fallback));
  };

  const updateStatus = async (order: Order, nextStatus: Order['status'], successMsg?: string) => {
    const previous = orders;
    setBusyUuid(order.uuid);
    unmarkFresh(order.uuid);
    // Optimistic: the card moves columns immediately.
    setOrders((prev) => prev.map((o) => (o.uuid === order.uuid ? { ...o, status: nextStatus } : o)));
    try {
      await ordersApi.updateOrderStatus(order.uuid, nextStatus);
      if (successMsg) toast.success(successMsg);
      if (nextStatus === 'READY_FOR_PICKUP' && order.delivery_type === 'DELIVERY' && autoPrintEnabled()) {
        handlePrintReceipt(order.uuid, true);
      }
      fetchOrders('silent');
    } catch (err) {
      setOrders(previous);
      reportActionError(err, 'Buyurtma holatini yangilashda xatolik yuz berdi.');
    } finally {
      setBusyUuid(null);
    }
  };

  const acceptOrder = (order: Order) => {
    if (order.partner_uuid && partnerUuid && order.partner_uuid !== partnerUuid) {
      toast.error('Bu buyurtma sizning muassasangizga tegishli emas.');
      return;
    }
    updateStatus(order, 'ACCEPTED', `${orderNo(order)} qabul qilindi`);
  };

  const openCourierPicker = (order: Order) => {
    setCourierOrder(order);
    setLoadingCouriers(true);
    couriersApi
      .getCouriers()
      .then(setCouriers)
      .catch((err) => toast.error(getErrorMessage(err, "Kuryerlar ro'yxatini yuklashda xatolik yuz berdi.")))
      .finally(() => setLoadingCouriers(false));
  };

  const assignCourier = async (courierUuid: string) => {
    if (!courierOrder) return;
    setAssigningCourierUuid(courierUuid);
    try {
      await ordersApi.assignOwnCourier(courierOrder.uuid, courierUuid);
      unmarkFresh(courierOrder.uuid);
      setOrders((prev) => prev.map((o) => (o.uuid === courierOrder.uuid ? { ...o, status: 'ACCEPTED' } : o)));
      toast.success('Kuryer biriktirildi, buyurtma qabul qilindi.');
      setCourierOrder(null);
      fetchOrders('silent');
    } catch (err) {
      reportActionError(err, 'Kuryerni biriktirishda xatolik yuz berdi.');
    } finally {
      setAssigningCourierUuid(null);
    }
  };

  const dispatchGlobally = async (order: Order) => {
    setBusyUuid(order.uuid);
    try {
      await ordersApi.dispatchGlobally(order.uuid);
      toast.success('Buyurtma MilliyGo kuryerlariga yuborildi.');
      fetchOrders('silent');
    } catch (err) {
      reportActionError(err, 'Global kuryerlarga yuborishda xatolik yuz berdi.');
    } finally {
      setBusyUuid(null);
    }
  };

  const completeOrder = async (order: Order) => {
    setBusyUuid(order.uuid);
    try {
      await ordersApi.completeOrder(order.uuid);
      freeTableForOrder(order);
      setSelectedUuid(null);
      toast.success(`${orderNo(order)} yakunlandi`);
      handlePrintReceipt(order.uuid, true);
      fetchOrders('silent');
    } catch (err) {
      reportActionError(err, 'Buyurtmani yakunlashda xatolik yuz berdi.');
    } finally {
      setBusyUuid(null);
    }
  };

  const submitPayment = async (method: PaymentMethod, splitCount: number) => {
    if (!paymentOrder) return;
    setPaymentSaving(true);
    try {
      // To'lov va yakunlash — bitta so'rovda (eski serverda mark-paid bilan to'ldiriladi)
      await ordersApi.completeWithPayment(paymentOrder.uuid, method, splitCount);
      freeTableForOrder(paymentOrder);
      toast.success(`${orderNo(paymentOrder)} to'landi va yakunlandi`);
      handlePrintReceipt(paymentOrder.uuid, true);
      if (selectedUuid === paymentOrder.uuid) setSelectedUuid(null);
      setPaymentOrder(null);
      fetchOrders('silent');
    } catch (err) {
      reportActionError(err, "To'lov ma'lumotlarini saqlashda xatolik yuz berdi.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const runAction = async (order: Order, a: QueueAction, fromCard = false) => {
    switch (a.kind) {
      case 'accept':
        // Delivery orders with own couriers need a choice (own vs MilliyGo courier) — show details.
        if (fromCard && order.delivery_type === 'DELIVERY' && ctx.hasOwnCouriers) {
          setSelectedUuid(order.uuid);
          unmarkFresh(order.uuid);
          return;
        }
        acceptOrder(order);
        return;
      case 'reject': {
        const ok = await confirm(`${orderNo(order)} buyurtmasini rad etasizmi? Mijozga xabar boradi.`, {
          title: 'Buyurtmani rad etish',
          danger: true,
          confirmText: 'Rad etish',
        });
        if (ok) updateStatus(order, 'REJECTED', `${orderNo(order)} rad etildi`);
        return;
      }
      case 'cancel': {
        const ok = await confirm(`${orderNo(order)} buyurtmasini bekor qilasizmi?`, {
          title: 'Buyurtmani bekor qilish',
          danger: true,
          confirmText: 'Bekor qilish',
          cancelText: 'Orqaga',
        });
        if (ok) updateStatus(order, 'CANCELLED', `${orderNo(order)} bekor qilindi`);
        return;
      }
      case 'assign_courier':
        openCourierPicker(order);
        return;
      case 'dispatch_global':
        dispatchGlobally(order);
        return;
      case 'start_preparing':
        updateStatus(order, 'PREPARING');
        return;
      case 'mark_ready':
        updateStatus(order, 'READY_FOR_PICKUP', `${orderNo(order)} tayyor`);
        return;
      case 'back_to_accepted':
        updateStatus(order, 'ACCEPTED');
        return;
      case 'back_to_preparing':
        updateStatus(order, 'PREPARING');
        return;
      case 'back_to_ready':
        updateStatus(order, 'READY_FOR_PICKUP');
        return;
      case 'pay_and_complete':
        setPaymentOrder(order);
        return;
      case 'complete':
        completeOrder(order);
        return;
    }
  };

  const openOrder = (o: Order) => {
    setSelectedUuid(o.uuid);
    unmarkFresh(o.uuid);
  };

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
            onAction={(a) => runAction(o, a, true)}
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
            <Button className="md:hidden" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-order')} aria-label="Yangi buyurtma">
              Yangi
            </Button>
          </>
        }
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Phone/tablet: status tabs */}
          <Tabs
            className="lg:hidden"
            value={activeGroup}
            onChange={setActiveGroup}
            options={QUEUE_GROUPS.map((g) => ({ value: g.key, label: groupLabel(g.key, g.label), count: grouped[g.key].length }))}
          />
          <div className="flex items-center gap-2 min-w-0">
            {typeOptions.length > 2 && <Segmented value={typeFilter} onChange={setTypeFilter} options={typeOptions} />}
            {!manager && filials.length > 1 && (
              <Select
                aria-label="Filial"
                value={filialUuid}
                onChange={(e) => {
                  setFilialUuid(e.target.value);
                  filialRef.current = e.target.value;
                  fetchOrders('initial');
                }}
                containerClassName="min-w-[150px] max-w-[220px]"
                className="!min-h-[40px] h-10 text-[13px] font-semibold"
              >
                <option value="">Barcha filiallar</option>
                {filials.map((f) => (
                  <option key={f.uuid} value={f.uuid}>
                    {f.filial_name}
                  </option>
                ))}
              </Select>
            )}
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

      {/* Detail */}
      <OrderDetailSheet
        order={selectedOrder}
        now={now}
        ctx={ctx}
        busy={!!selectedOrder && busyUuid === selectedOrder.uuid}
        printing={!!selectedOrder && printingUuid === selectedOrder.uuid}
        onClose={() => setSelectedUuid(null)}
        onAction={(o, a) => {
          // Status changes keep the sheet open so the user sees the new status;
          // flows that open another sheet close this one.
          if (a.kind === 'pay_and_complete' || a.kind === 'assign_courier') setSelectedUuid(null);
          runAction(o, a);
        }}
        onEdit={(o) => setEditingOrder(o)}
        onPrintReceipt={(o, qr) => handlePrintReceipt(o.uuid, qr)}
        onPrintPreCheck={handlePrintPreCheck}
        onOrderPatched={(uuid, patch) => setOrders((prev) => prev.map((o) => (o.uuid === uuid ? { ...o, ...patch } : o)))}
      />

      <PaymentSheet order={paymentOrder} saving={paymentSaving} onClose={() => !paymentSaving && setPaymentOrder(null)} onSubmit={submitPayment} />

      <CourierPickerSheet
        order={courierOrder}
        couriers={couriers}
        filials={filials}
        loading={loadingCouriers}
        assigningUuid={assigningCourierUuid}
        onClose={() => !assigningCourierUuid && setCourierOrder(null)}
        onAssign={assignCourier}
      />

      {editingOrder && (
        <EditOrderModal
          orderUuid={editingOrder.uuid}
          orderNumber={orderNo(editingOrder)}
          onClose={(refresh) => {
            setEditingOrder(null);
            // BUGFIX: previously refetched without the filial filter, replacing the
            // filtered queue with all orders.
            if (refresh) fetchOrders('silent');
          }}
        />
      )}

      {/* Queue preferences */}
      <Sheet open={prefsOpen} onClose={() => setPrefsOpen(false)} title="Navbat sozlamalari" size="sm">
        <div className="divide-y divide-edge">
          <SettingRow
            title={`"${w.preparing}" bosqichini o'tkazib yuborish`}
            description={`Qabul qilingan buyurtma to'g'ridan-to'g'ri "Tayyor" bo'ladi. Tez xizmat ko'rsatadigan ${shop ? "do'konlar" : 'joylar'} uchun.`}
            control={<Switch checked={prefs.skipPreparing} onChange={(v) => updatePrefs({ skipPreparing: v })} label="Bosqichni o'tkazib yuborish" />}
          />
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
