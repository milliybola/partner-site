import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, FileSpreadsheet, Layers, MoreVertical, Plus, QrCode, RefreshCw, ScanLine, ShoppingBag, Store, Table2, Truck, Users } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import type { Hall, TableModel } from '../services/tablesApi';
import { HallsSheet, TransferSheet } from '../components/HallSheets';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { TableBillSheet } from '../components/TableBillSheet';
import { TableOrderModal } from '../components/TableOrderModal';
import { getDrafts, type TableDraft } from '../lib/tableDrafts';
import { TableQrSheet } from '../components/TableQrPosters';
import { BulkImportSheet, QrSheet, TableActionsSheet, TableFormSheet } from '../components/TableSheets';
import { useToast } from '../../../core/components/ToastProvider';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ordersApi } from '../../orders/services/ordersApi';
import type { Order } from '../../orders/services/ordersApi';
import { statusGroup } from '../../orders/utils/status';
import { ServiceBoard } from '../components/ServiceBoard';
import { DispatchBoard } from '../components/DispatchBoard';
import { CourierPickerSheet } from '../../orders/components/queue/CourierPickerSheet';
import { couriersApi } from '../../staff/services/couriersApi';
import type { CourierModel } from '../../staff/services/couriersApi';
import { limitText, useTariff } from '../../../core/lib/tariff';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useRealtime } from '../../../core/realtime/RealtimeProvider';
import type { RealtimeEvent } from '../../../core/realtime/RealtimeProvider';
import { useWorkMode } from '../../../core/lib/workMode';
import { getPartner, isCashier, isManager as isManagerRole } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, minutesSince } from '../../../core/lib/format';
import { Button, EmptyState, ErrorState, IconButton, PageHeader, Skeleton, Tabs } from '../../../core/ui';

/** Stol nomi "Guruh | raqam" shaklida bo'lsa — guruh bo'lim sarlavhasi, raqam esa kartada ko'rinadi */
const splitName = (name: string): { group: string; num: string } => {
  const m = /^(.*?)\s*\|\s*(.+)$/.exec(String(name));
  return m && m[1].trim() ? { group: m[1].trim(), num: m[2].trim() } : { group: '', num: String(name) };
};

// display_order first, then natural sort ("ZAL 2" before "ZAL 10")
const sortTables = (list: TableModel[]): TableModel[] =>
  [...list].sort((a, b) => {
    const oa = a.display_order ?? 0;
    const ob = b.display_order ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: 'base' });
  });

/**
 * Stol kartasi (kassa uslubida): bo'sh — oq, «+» bilan; band — yashil (raqam va summa tepada, ofitsiant va vaqt pastda);
 * tasdiq kutayotgan (QR) — sariq; bron — ko'k. Pastda holat chizig'i. 60 daqiqadan oshgan band stolda vaqt qalin va chizilgan.
 */
/** Buyurtmani kim ochgan: mehmon (QR), ofitsiant yoki kassa — kartada belgi bilan ajratiladi. */
const orderOrigin = (o: NonNullable<TableModel['current_order']>) => {
  if (o.order_source === 'QR') return { icon: QrCode, text: o.waiter_name ? `QR · ${o.waiter_name}` : 'QR-menyu' };
  if (o.waiter_role === 'waiter') return { icon: Users, text: o.waiter_name || 'Ofitsiant' };
  return { icon: Store, text: o.waiter_name ? `Kassa · ${o.waiter_name}` : 'Kassa' };
};

type Tone = { tile: string; text: string; sub: string; strip: string };
const TONE: Record<'free' | 'open' | 'wait' | 'reserved' | 'draft', Tone> = {
  draft: { tile: 'bg-warning-soft border-warning border-dashed', text: 'text-ink', sub: 'text-warning-ink', strip: '' },
  free: { tile: 'bg-surface border-edge hover:border-brand/50', text: 'text-ink', sub: 'text-muted', strip: '' },
  open: { tile: 'bg-brand-bright border-brand-bright', text: 'text-white', sub: 'text-white/85', strip: 'bg-black/15 text-white' },
  wait: { tile: 'bg-warning border-warning', text: 'text-ink', sub: 'text-ink/75', strip: 'bg-black/10 text-ink' },
  reserved: { tile: 'bg-info border-info', text: 'text-white', sub: 'text-white/85', strip: 'bg-black/15 text-white' },
};

const TableTile: React.FC<{
  table: TableModel;
  now: number;
  canManage: boolean;
  draft?: TableDraft;
  /** Kartada katta yoziladigan nom (bo'lim sarlavhasida guruh bo'lsa — faqat raqam) */
  label?: string;
  onOpen: () => void;
  onMenu: () => void;
}> = ({ table, now, canManage, draft, label, onOpen, onMenu }) => {
  const inactive = table.is_active === false;
  const order = table.current_order;
  const mins = order?.created_at ? minutesSince(order.created_at, now) : null;
  const busy = !!order || table.status === 'OCCUPIED';
  const waiting = !!order && (order.status === 'PENDING' || order.status === 'NEW');
  const hasDraft = !!draft && !order && !inactive;
  const kind = inactive ? 'free' : hasDraft ? 'draft' : waiting ? 'wait' : busy ? 'open' : table.status === 'RESERVED' ? 'reserved' : 'free';
  const tone = TONE[kind];
  const strip = waiting ? 'Tasdiq kutilmoqda' : order ? (order.is_paid ? "To'langan" : 'Ochiq hisob') : table.status === 'RESERVED' ? 'Bron' : '';
  return (
    <div
      className={`relative rounded-xl border-2 min-h-[140px] flex flex-col overflow-hidden transition hover:shadow-card ${
        inactive ? 'border-dashed border-edge-strong bg-surface opacity-60' : tone.tile
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 text-left p-2.5 flex flex-col gap-1 cursor-pointer active:scale-[0.98] transition"
        aria-label={`Stol ${table.table_number}${busy ? ', band' : ", bo'sh"}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className={`text-[22px] font-black tracking-tightest leading-none break-words ${inactive ? 'text-muted' : tone.text}`}>
            {label ?? table.table_number}
          </span>
          {(order || hasDraft) && (
            <span className={`text-[15px] font-black tabular-nums leading-none ${tone.text}`}>{formatMoney(order ? order.total_price : draft!.subtotal)}</span>
          )}
        </span>

        {inactive ? (
          <span className="mt-auto text-[12px] font-bold text-muted">Nofaol</span>
        ) : order ? (
          <span className={`mt-auto flex flex-col gap-0.5 text-[12px] font-semibold ${tone.sub}`}>
            {(() => {
              const origin = orderOrigin(order);
              const Icon = origin.icon;
              return (
                <span className="inline-flex items-center gap-1 truncate">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{origin.text}</span>
                </span>
              );
            })()}
            {mins !== null && (
              <span className={`inline-flex items-center gap-1 tabular-nums ${mins >= 60 ? 'font-black underline decoration-2' : ''}`}>
                <Clock className="w-3.5 h-3.5" />
                {mins >= 60 ? `${Math.floor(mins / 60)} s ${mins % 60} daq` : `${mins} daq`}
              </span>
            )}
          </span>
        ) : hasDraft ? (
          <span className={`mt-auto inline-flex items-center gap-1 text-[12px] font-extrabold ${tone.sub}`}>
            <ShoppingBag className="w-3.5 h-3.5" /> Savat saqlangan · {draft!.count} ta
          </span>
        ) : (
          <span className="mt-auto flex items-end justify-between gap-2">
            <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${tone.sub}`}>
              <Users className="w-3.5 h-3.5" /> {table.capacity}
            </span>
            {table.status !== 'RESERVED' && (
              <span className="w-8 h-8 rounded-lg border-2 border-dashed border-edge-strong text-subtle flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
            )}
          </span>
        )}
      </button>
      {!inactive && strip && <div className={`px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${tone.strip}`}>{strip}</div>}
      {canManage && (
        <IconButton label="Amallar" onClick={onMenu} className={`absolute ${strip && !inactive ? "bottom-0 right-0" : "top-0.5 right-0.5"} !min-h-0 !h-6 !w-6 ${strip && !inactive ? tone.text : ""}`}>
          <MoreVertical className="w-4 h-4" />
        </IconButton>
      )}
    </div>
  );
};

/** Katta ekranda chap ustun: zallar ro'yxati (band / jami) — kassadagi kabi */
const HallRail: React.FC<{
  halls: Hall[];
  tables: TableModel[];
  value: string;
  onChange: (v: string) => void;
  hasUnassigned: boolean;
  onManage?: () => void;
  /** O'z-o'ziga xizmat zali uuid → faol buyurtmalar soni */
  selfCounts?: Record<string, number>;
}> = ({ halls, tables, value, onChange, hasUnassigned, onManage, selfCounts = {} }) => {
  const active = tables.filter((t) => t.is_active !== false);
  const stat = (key: string | null) => {
    const list = key === null ? active : active.filter((t) => (t.hall || '') === key);
    const selfBusy = key === null ? Object.values(selfCounts).reduce((a, b) => a + b, 0) : selfCounts[key] || 0;
    return { busy: list.filter((t) => t.current_order || t.status === 'OCCUPIED').length + selfBusy, all: list.length };
  };
  const items = [
    { key: 'ALL', label: 'Barcha zallar', s: stat(null) },
    ...halls.map((h) => ({ key: h.uuid, label: h.self_service ? `${h.name} · o'zi` : h.name, s: stat(h.uuid) })),
    ...(hasUnassigned ? [{ key: '', label: 'Zalsiz', s: stat('') }] : []),
  ];
  return (
    <aside className="hidden lg:flex flex-col gap-1 w-48 shrink-0 self-start sticky top-[calc(var(--appbar-h,56px)+12px)]">
      {items.map((it) => {
        const on = value === it.key;
        return (
          <button
            key={it.key || 'none'}
            type="button"
            onClick={() => onChange(it.key)}
            className={`w-full min-h-[48px] px-3 rounded-xl flex items-center justify-between gap-2 text-left text-[14px] font-extrabold transition cursor-pointer ${
              on ? 'bg-brand text-white' : 'bg-surface border border-edge text-ink hover:border-brand/40'
            }`}
          >
            <span className="truncate">{it.label}</span>
            {it.s.busy > 0 && (
              <span className={`shrink-0 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[12px] font-black tabular-nums ${on ? "bg-white text-brand" : "bg-danger text-white"}`}>
                {it.s.busy}
              </span>
            )}
          </button>
        );
      })}
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="mt-1 w-full min-h-[40px] px-3 rounded-xl flex items-center gap-2 text-[13px] font-bold text-muted hover:text-ink cursor-pointer"
        >
          <Layers className="w-4 h-4" /> Zallarni sozlash
        </button>
      )}
    </aside>
  );
};

/** `openQr` — sidebar'dagi «Stol QR-kodlari» (/tables/qr): sahifa QR oynasi ochiq holda boshlanadi */
const TablesPage: React.FC<{ openQr?: boolean }> = ({ openQr = false }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const { tariff, refresh: refreshTariffUsage } = useTariff();
  const limitReached = () => {
    toast.error(`Stol limiti to'lgan (${tariff.usage.tables} / ${limitText(tariff.max_tables)}). Tarifni oshiring.`);
    navigate('/plan?need=tables');
  };
  const confirm = useConfirm();
  const partner = useMemo(() => getPartner(), []);
  const manager = isManagerRole(partner);
  // Ofitsiantlar bu panelga kira olmaydi; kassir stollarni tahrirlamaydi (faqat buyurtma, hisob, ko'chirish)
  const canManage = !isCashier(partner);

  const [tables, setTables] = useState<TableModel[]>([]);
  // Stol qo'shilganda/o'chirilganda tarif foydalanishi (limit) yangilanadi
  useEffect(() => {
    void refreshTariffUsage();
  }, [tables.length, refreshTariffUsage]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Ko'rinish: Zal (stollar) / Saboy (olib ketish) / Dostavka (yetkazish) — ?view=PICKUP|DELIVERY
  const [sp, setSp] = useSearchParams();
  const isPos = useWorkMode() === 'pos'; // katta rejim kartalari va Saboy/Dostavka — faqat kassa rejimida
  type ViewKey = 'TABLES' | 'PICKUP' | 'DELIVERY';
  const viewParam = sp.get('view');
  const view: ViewKey = !isPos ? 'TABLES' : viewParam === 'PICKUP' || viewParam === 'DELIVERY' ? viewParam : 'TABLES';
  const setView = (v: ViewKey) => setSp(v === 'TABLES' ? {} : { view: v }, { replace: true });
  const [svcOrders, setSvcOrders] = useState<Order[]>([]);
  const [svcLoading, setSvcLoading] = useState(true);
  const fetchSvcOrders = useCallback(async () => {
    try {
      const all = await ordersApi.getOrders();
      // Saboy, Dostavka va o'z-o'ziga xizmat zali (stolsiz zal buyurtmasi) — faol buyurtmalar
      setSvcOrders(
        all.filter(
          (o) => (o.delivery_type === 'PICKUP' || o.delivery_type === 'DELIVERY' || (o.delivery_type === 'DINE_IN' && !!o.hall_uuid)) && statusGroup(o.status) !== 'DONE',
        ),
      );
    } catch {
      /* keyingi urinishda */
    } finally {
      setSvcLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchSvcOrders();
    const t = setInterval(() => void fetchSvcOrders(), 30000);
    return () => clearInterval(t);
  }, [fetchSvcOrders]);
  const [assignOrder, setAssignOrder] = useState<Order | null>(null);
  const [assigningUuid, setAssigningUuid] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<CourierModel[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(true);
  useEffect(() => {
    if (!isPos) return;
    let alive = true;
    const load = async () => {
      try {
        const list = await couriersApi.getCouriers();
        if (alive) setCouriers(list);
      } catch {
        /* keyingi urinishda */
      } finally {
        if (alive) setCouriersLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isPos]);
  const svcCount = (k: 'PICKUP' | 'DELIVERY') => svcOrders.filter((o) => o.delivery_type === k).length;
  const [drafts, setDrafts] = useState(getDrafts);

  const [filials, setFilials] = useState<PartnerFilial[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TableModel | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [tableQrOpen, setTableQrOpen] = useState(openQr);
  const [menuTable, setMenuTable] = useState<TableModel | null>(null);
  const [orderingTable, setOrderingTable] = useState<TableModel | null>(null);
  const [billTable, setBillTable] = useState<TableModel | null>(null);
  const [transferFrom, setTransferFrom] = useState<TableModel | null>(null);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [hallsOpen, setHallsOpen] = useState(false);
  /** 'ALL' — hammasi (zallar bo'yicha guruhlab), '' — zalsiz, aks holda zal uuid */
  const [hallFilter, setHallFilter] = useState<string>('ALL');

  const fetchHalls = useCallback(() => {
    tablesApi
      .getHalls()
      .then(setHalls)
      .catch(() => setHalls([]));
  }, []);

  // BUGFIX: every refresh used to flip the whole grid to a spinner. Only the
  // first load shows skeletons now; later refreshes are silent.
  const fetchTables = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await tablesApi.getTables();
      setTables(sortTables(Array.isArray(data) ? data : []));
    } catch (err) {
      if (!silent) setError(getErrorMessage(err, "Stollar ma'lumotlarini yuklashda xatolik yuz berdi."));
      else toast.error(getErrorMessage(err, 'Stollarni yangilab bo‘lmadi.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTables();
    fetchHalls();
    if (!manager) {
      filialApi
        .getFilials()
        .then(setFilials)
        .catch(() => setFilials([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed-time ticker for occupied tables
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Realtime: the Layout owns the socket; we just listen.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      fetchTables(true);
      void fetchSvcOrders();
    }, 600);
  }, [fetchTables, fetchSvcOrders]);
  useEffect(() => () => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
  }, []);

  useRealtime((event: RealtimeEvent) => {
    if (event.type === 'table_status_update') {
      const td = event.table_data;
      if (!td?.uuid) return;
      let known = false;
      setTables((prev) => {
        known = prev.some((t) => t.uuid === td.uuid);
        if (!known) return prev;
        return prev.map((t) =>
          t.uuid === td.uuid
            ? {
                ...t,
                status: td.status ?? t.status,
                status_display: td.status_display ?? t.status_display,
                capacity: td.capacity ?? t.capacity,
                notes: td.notes ?? t.notes,
                is_active: td.is_active ?? t.is_active,
                display_order: td.display_order ?? t.display_order,
              }
            : t,
        );
      });
      // Status payload has no current_order; refresh to pick up totals / new tables.
      scheduleRefetch();
      return;
    }
    if (event.type === 'new_order_alert' || event.type === 'order_status_update') {
      scheduleRefetch();
    }
  });

  const counts = useMemo(() => {
    const active = tables.filter((t) => t.is_active !== false);
    return {
      ALL: tables.length,
      AVAILABLE: active.filter((t) => t.status === 'AVAILABLE').length,
      OCCUPIED: active.filter((t) => t.status === 'OCCUPIED').length,
      RESERVED: active.filter((t) => t.status === 'RESERVED').length,
      INACTIVE: tables.length - active.length,
    };
  }, [tables]);

  const visible = useMemo(() => {
    return tables.filter((t) => {
      return hallFilter === 'ALL' || (t.hall || '') === hallFilter;
    });
  }, [tables, hallFilter]);

  // Bo'limlar: zal bo'yicha; zalga biriktirilmagan stollar nomidagi guruh ("Ko'cha | 1" → «Ko'cha») bo'yicha
  const sections = useMemo(() => {
    type Sec = { key: string; title: string; items: TableModel[]; byName: boolean };
    const byPrefix = (items: TableModel[], emptyTitle: string): Sec[] => {
      const map = new Map<string, TableModel[]>();
      for (const t of items) {
        const g = splitName(t.table_number).group;
        map.set(g, [...(map.get(g) || []), t]);
      }
      if (map.size === 1 && map.has('') && !emptyTitle) return [{ key: 'all', title: '', items, byName: false }];
      return [...map.entries()].map(([g, list]) => ({ key: `n:${g}`, title: g || emptyTitle, items: list, byName: !!g }));
    };
    if (hallFilter === '') return byPrefix(visible, 'Zalsiz');
    if (hallFilter !== 'ALL') return [{ key: 'all', title: '', items: visible, byName: false }];
    if (halls.length === 0) return byPrefix(visible, '');
    const hallSecs: Sec[] = halls
      .map((h) => ({ key: h.uuid, title: h.name, items: visible.filter((t) => t.hall === h.uuid), byName: false }))
      .filter((h) => h.items.length > 0);
    return [...hallSecs, ...byPrefix(visible.filter((t) => !t.hall), 'Zalsiz')];
  }, [visible, halls, hallFilter]);
  const hasUnassigned = halls.length > 0 && tables.some((t) => !t.hall);
  // O'z-o'ziga xizmat zallari: stol o'rniga buyurtma kartalari (kassada stolsiz olinadi)
  const selfHalls = useMemo(() => halls.filter((h) => h.self_service), [halls]);
  const selfOrders = useCallback(
    (hallUuid: string) => svcOrders.filter((o) => o.delivery_type === 'DINE_IN' && o.hall_uuid === hallUuid),
    [svcOrders],
  );
  const selfCounts = useMemo(() => Object.fromEntries(selfHalls.map((h) => [h.uuid, selfOrders(h.uuid).length])), [selfHalls, selfOrders]);
  const selectedSelfHall = selfHalls.find((h) => h.uuid === hallFilter) || null;
  const newSelfOrder = (h: Hall) => navigate(`/new-order?type=DINE_IN&hall=${h.uuid}&hall_name=${encodeURIComponent(h.name)}`);
  const selfBoard = (h: Hall, compact: boolean) => (
    <ServiceBoard
      kind="DINE_IN"
      title={h.name}
      compact={compact}
      orders={selfOrders(h.uuid)}
      now={now}
      loading={svcLoading}
      onNew={() => newSelfOrder(h)}
      onOpen={(uuid) => navigate(`/orders?open=${uuid}`)}
    />
  );

  const openBulk = () => (tariff.can_add_table ? setBulkOpen(true) : limitReached());

  const openForm = (t: TableModel | null) => {
    if (t === null && !tariff.can_add_table) return limitReached();
    setMenuTable(null);
    setEditing(t);
    setFormOpen(true);
  };

  // BUGFIX: the quick toggle used PUT with only {is_active}; PUT requires the
  // full object so the request failed validation. Send the full record.
  const toggleActive = async (t: TableModel) => {
    setMenuTable(null);
    const next = !(t.is_active ?? true);
    setTables((prev) => prev.map((x) => (x.uuid === t.uuid ? { ...x, is_active: next } : x)));
    try {
      await tablesApi.updateTable(t.uuid, {
        table_number: t.table_number,
        capacity: t.capacity,
        status: t.status,
        notes: t.notes || '',
        display_order: t.display_order ?? 0,
        filial_uuid: manager ? undefined : t.filial_uuid || undefined,
        is_active: next,
      });
      toast.success(next ? 'Stol faollashtirildi' : 'Stol nofaol qilindi');
      fetchTables(true);
    } catch (err) {
      setTables((prev) => prev.map((x) => (x.uuid === t.uuid ? { ...x, is_active: !next } : x)));
      toast.error(getErrorMessage(err, "Stol faolligini o'zgartirishda xatolik."));
    }
  };

  const deleteTable = async (t: TableModel) => {
    setMenuTable(null);
    if (t.current_order) {
      toast.error("Bu stolda faol buyurtma bor. Avval buyurtmani yakunlang.");
      return;
    }
    const ok = await confirm(`${t.table_number}-stolni o'chirmoqchimisiz?`, { title: "Stolni o'chirish", danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await tablesApi.deleteTable(t.uuid);
      toast.success("Stol o'chirildi");
      fetchTables(true);
    } catch (err) {
      toast.error(getErrorMessage(err, "Stolni o'chirishda xatolik yuz berdi."));
    }
  };

  const qrUrl = partner?.uuid ? `https://qr-code.milliyapp.uz/${partner.uuid}` : null;

  return (
    <div className="pb-4">
      <PageHeader
        title={isPos ? undefined : 'Stollar'}
        subtitle={isPos ? undefined : loading ? 'Yuklanmoqda...' : `${counts.ALL} ta stol · ${counts.OCCUPIED} ta band · ${counts.AVAILABLE} ta bo'sh`}
        lead={!isPos ? undefined : (
          <div className="grid grid-cols-3 gap-2.5 max-w-3xl" role="tablist" aria-label="Buyurtma turi">
            {(
              [
                { value: 'TABLES', label: 'Zal', count: counts.OCCUPIED, icon: <Table2 className="w-6 h-6" /> },
                { value: 'PICKUP', label: 'Olib ketish', count: svcCount('PICKUP'), icon: <ShoppingBag className="w-6 h-6" /> },
                { value: 'DELIVERY', label: 'Yetkazib berish', count: svcCount('DELIVERY'), icon: <Truck className="w-6 h-6" /> },
              ] as const
            ).map((m) => {
              const on = view === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setView(m.value)}
                  className={`h-[68px] px-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-left transition cursor-pointer active:scale-[0.98] ${
                    on ? 'bg-brand border-brand text-white shadow-card' : 'bg-surface border-edge text-ink hover:border-brand/50'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={on ? 'text-white' : 'text-muted'}>{m.icon}</span>
                    <span className="text-[17px] md:text-[19px] font-black tracking-tightest truncate">{m.label}</span>
                  </span>
                  <span
                    className={`shrink-0 min-w-[34px] h-[34px] px-2 rounded-full flex items-center justify-center text-[17px] font-black tabular-nums ${
                      on ? 'bg-white text-brand' : m.count > 0 ? 'bg-brand text-white' : 'bg-field text-muted'
                    }`}
                  >
                    {m.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        actions={
          <>
            <IconButton label="Yangilash" variant="outline" onClick={() => fetchTables(true)} disabled={refreshing}>
              <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`} />
            </IconButton>
            {canManage && (
              <IconButton label="Zallar" variant="outline" onClick={() => setHallsOpen(true)}>
                <Layers className="w-[18px] h-[18px]" />
              </IconButton>
            )}
            {canManage && (
              <IconButton label="Stol QR-kodlari" variant="outline" onClick={() => setTableQrOpen(true)}>
                <ScanLine className="w-[18px] h-[18px]" />
              </IconButton>
            )}
            {canManage && !isPos && qrUrl && (
              <IconButton label="QR-kod" variant="outline" onClick={() => setQrOpen(true)}>
                <QrCode className="w-[18px] h-[18px]" />
              </IconButton>
            )}
            {canManage && (
              <>
                <Button variant="outline" className="hidden sm:inline-flex" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={openBulk}>
                  Ko'plab qo'shish
                </Button>
                <IconButton label="Ko'plab qo'shish" variant="outline" className="sm:hidden" onClick={openBulk}>
                  <FileSpreadsheet className="w-[18px] h-[18px]" />
                </IconButton>
                <Button icon={<Plus className="w-4 h-4" />} onClick={() => openForm(null)}>
                  <span className="hidden sm:inline">Stol qo'shish</span>
                  <span className="sm:hidden">Stol</span>
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="space-y-2.5">
          {view === 'TABLES' && halls.length > 0 && (
            <div className="lg:hidden">
            <Tabs<string>
              value={hallFilter}
              onChange={setHallFilter}
              options={[
                { value: 'ALL', label: 'Barcha zallar' },
                ...halls.map((h) => ({
                  value: h.uuid,
                  label: h.name,
                  count: h.self_service ? selfCounts[h.uuid] || 0 : tables.filter((t) => t.hall === h.uuid).length,
                })),
                ...(hasUnassigned ? [{ value: '', label: 'Zalsiz', count: tables.filter((t) => !t.hall).length }] : []),
              ]}
            />
            </div>
          )}
        </div>
      </PageHeader>

      {view === 'DELIVERY' ? (
        <DispatchBoard
          orders={svcOrders.filter((o) => o.delivery_type === 'DELIVERY')}
          couriers={couriers}
          now={now}
          loading={svcLoading || couriersLoading}
          onNew={() => navigate('/new-order?type=DELIVERY')}
          onOpen={(uuid) => navigate(`/orders?open=${uuid}`)}
          onAssign={setAssignOrder}
        />
      ) : view !== 'TABLES' ? (
        <ServiceBoard
          kind={view}
          orders={svcOrders.filter((o) => o.delivery_type === view)}
          now={now}
          loading={svcLoading}
          onNew={() => navigate(`/new-order?type=${view}`)}
          onOpen={(uuid) => navigate(`/orders?open=${uuid}`)}
        />
      ) : (
      <div className="mt-2 flex gap-4">
        {halls.length > 0 && !loading && !error && (
          <HallRail
            halls={halls}
            tables={tables}
            value={hallFilter}
            onChange={setHallFilter}
            hasUnassigned={hasUnassigned}
            onManage={canManage ? () => setHallsOpen(true) : undefined}
            selfCounts={selfCounts}
          />
        )}
        <div className="flex-1 min-w-0">
        {/* «Barcha zallar»: o'z-o'ziga xizmat zallarining faol buyurtmalari stollar ustida */}
        {hallFilter === 'ALL' && !selectedSelfHall &&
          selfHalls.map((h) => (
            <section key={h.uuid} className="mb-5">
              <h2 className="mb-0 text-[13px] font-extrabold uppercase tracking-wider text-subtle">
                {h.name} <span className="text-muted normal-case">· o'z-o'ziga xizmat · {selfCounts[h.uuid] || 0}</span>
              </h2>
              {selfBoard(h, true)}
            </section>
          ))}
        {selectedSelfHall ? (
          selfBoard(selectedSelfHall, false)
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[140px] rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchTables()} />
        ) : visible.length === 0 ? (
          tables.length === 0 && selfHalls.length > 0 ? null : tables.length === 0 ? (
            <EmptyState
              icon={<Table2 className="w-7 h-7" />}
              title="Hali stol qo'shilmagan"
              description="Zal stollarini qo'shing — keyin har bir stol uchun buyurtma ochishingiz mumkin."
              action={
                canManage && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button icon={<Plus className="w-4 h-4" />} onClick={() => openForm(null)}>
                      Stol qo'shish
                    </Button>
                    <Button variant="outline" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={openBulk}>
                      Ko'plab qo'shish
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            <EmptyState
              title="Mos stol topilmadi"
              description="Tanlangan zalda stol yo'q."
            />
          )
        ) : (
          <div className="space-y-5">
            {sections.map((sec) => (
              <section key={sec.key}>
                {sec.title && (
                  <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-subtle">
                    {sec.title} <span className="text-muted">· {sec.items.length}</span>
                  </h2>
                )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {sec.items.map((t) => (
              <TableTile
                key={t.uuid}
                table={t}
                now={now}
                draft={drafts[t.uuid]}
                label={sec.byName ? splitName(t.table_number).num : undefined}
                canManage
                onOpen={() => {
                  if (t.is_active === false) {
                    if (canManage) setMenuTable(t);
                    else toast.info('Bu stol nofaol.');
                    return;
                  }
                  setOrderingTable(t);
                }}
                onMenu={() => setMenuTable(t)}
              />
            ))}
          </div>
              </section>
            ))}
          </div>
        )}
        </div>
      </div>
      )}

      <TableActionsSheet
        table={menuTable}
        onClose={() => setMenuTable(null)}
        onEdit={openForm}
        onToggleActive={toggleActive}
        onDelete={deleteTable}
        onOpenOrder={(t) => {
          setMenuTable(null);
          setOrderingTable(t);
        }}
        onOpenBill={(t) => {
          setMenuTable(null);
          setBillTable(t);
        }}
        onTransfer={(t) => {
          setMenuTable(null);
          setTransferFrom(t);
        }}
        canManage={canManage}
      />

      <TransferSheet
        from={transferFrom}
        tables={tables}
        onClose={() => setTransferFrom(null)}
        onDone={() => {
          setTransferFrom(null);
          void fetchTables(true);
        }}
      />

      <HallsSheet
        open={hallsOpen}
        halls={halls}
        onClose={() => setHallsOpen(false)}
        onChanged={() => {
          fetchHalls();
          void fetchTables(true);
        }}
      />

      <TableBillSheet table={billTable} canPay={manager} onClose={() => setBillTable(null)} onChanged={() => void fetchTables(true)} />

      <CourierPickerSheet
        order={assignOrder}
        couriers={couriers}
        filials={filials}
        loading={couriersLoading}
        assigningUuid={assigningUuid}
        onClose={() => setAssignOrder(null)}
        onAssign={async (courierUuid) => {
          if (!assignOrder) return;
          setAssigningUuid(courierUuid);
          try {
            await ordersApi.assignOwnCourier(assignOrder.uuid, courierUuid);
            toast.success('Kuryer biriktirildi, buyurtma qabul qilindi.');
            setAssignOrder(null);
            void fetchSvcOrders();
            couriersApi.getCouriers().then(setCouriers).catch(() => undefined);
          } catch (err) {
            toast.error(getErrorMessage(err, 'Kuryerni biriktirishda xatolik yuz berdi.'));
          } finally {
            setAssigningUuid(null);
          }
        }}
      />

      <TableFormSheet
        open={formOpen}
        table={editing}
        defaultOrder={tables.length + 1}
        isManager={manager}
        filials={filials}
        halls={halls}
        defaultHall={hallFilter === 'ALL' ? null : hallFilter}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          toast.success(editing ? 'Stol saqlandi' : "Stol qo'shildi");
          fetchTables(true);
          fetchHalls();
        }}
      />

      <BulkImportSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          toast.success('Stollar qo‘shildi');
          fetchTables(true);
        }}
      />

      {qrUrl && (
        <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} url={qrUrl} fileName={partner?.name || partner?.partner_name || 'menyu'} />
      )}

      <TableQrSheet
        open={tableQrOpen}
        onClose={() => {
          setTableQrOpen(false);
          if (openQr) navigate('/tables', { replace: true });
        }}
        enabled={tariff.allow_qr_menu}
        tables={tables}
        restaurantName={partner?.name || partner?.partner_name || 'Restoran'}
        logo={partner?.logo}
        canManage={canManage}
        onReset={async (t) => {
          try {
            await tablesApi.resetTableQr(t.uuid);
            toast.success("QR yangilandi. Eski QR kodlar ishlamaydi, yangisini chop eting.");
            await fetchTables(true);
          } catch (err) {
            toast.error(getErrorMessage(err, "QR'ni yangilab bo'lmadi."));
          }
        }}
      />

      {orderingTable && (
        <TableOrderModal
          table={orderingTable}
          onClose={(refresh) => {
            setOrderingTable(null);
            setDrafts(getDrafts());
            if (refresh) fetchTables(true);
          }}
        />
      )}
    </div>
  );
};

export default TablesPage;
