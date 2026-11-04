import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, FileSpreadsheet, Layers, MoreVertical, Plus, QrCode, RefreshCw, ScanLine, Table2, Users } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import type { Hall, TableModel } from '../services/tablesApi';
import { HallsSheet, TransferSheet } from '../components/HallSheets';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { TableBillSheet } from '../components/TableBillSheet';
import { TableOrderModal } from '../components/TableOrderModal';
import { TableQrSheet } from '../components/TableQrPosters';
import { BulkImportSheet, QrSheet, TableActionsSheet, TableFormSheet, TABLE_STATUS_LABEL } from '../components/TableSheets';
import { useToast } from '../../../core/components/ToastProvider';
import { useNavigate } from 'react-router-dom';
import { limitText, useTariff } from '../../../core/lib/tariff';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useRealtime } from '../../../core/realtime/RealtimeProvider';
import type { RealtimeEvent } from '../../../core/realtime/RealtimeProvider';
import { getPartner, isCashier, isManager as isManagerRole } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, minutesSince } from '../../../core/lib/format';
import { Button, EmptyState, ErrorState, IconButton, PageHeader, SearchInput, Skeleton, Tabs } from '../../../core/ui';

type Filter = 'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'INACTIVE';

// display_order first, then natural sort ("ZAL 2" before "ZAL 10")
const sortTables = (list: TableModel[]): TableModel[] =>
  [...list].sort((a, b) => {
    const oa = a.display_order ?? 0;
    const ob = b.display_order ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: 'base' });
  });

/**
 * Stol kartasi (kassa uslubida): bo'sh — oq, «+» bilan; band — yashil, summa · vaqt · ofitsiant; bron — ko'k.
 * 60 daqiqadan oshgan band stolda vaqt qizil bo'ladi.
 */
const TILE_THEME: Record<string, { tile: string; num: string }> = {
  AVAILABLE: { tile: 'bg-surface border-edge hover:border-brand/40', num: 'text-ink' },
  OCCUPIED: { tile: 'bg-brand-soft border-brand/45', num: 'text-brand-dark' },
  RESERVED: { tile: 'bg-info-soft border-info/40', num: 'text-info' },
};

const TableTile: React.FC<{
  table: TableModel;
  now: number;
  canManage: boolean;
  onOpen: () => void;
  onMenu: () => void;
}> = ({ table, now, canManage, onOpen, onMenu }) => {
  const inactive = table.is_active === false;
  const theme = TILE_THEME[table.status] || TILE_THEME.AVAILABLE;
  const order = table.current_order;
  const mins = order?.created_at ? minutesSince(order.created_at, now) : null;
  const busy = !!order || table.status === 'OCCUPIED';
  return (
    <div
      className={`relative rounded-2xl border-2 min-h-[124px] flex flex-col transition hover:shadow-card ${
        inactive ? 'border-dashed border-edge-strong bg-surface opacity-60' : theme.tile
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 text-left p-3 flex flex-col gap-1.5 cursor-pointer rounded-2xl active:scale-[0.98] transition"
        aria-label={`Stol ${table.table_number}${busy ? ', band' : ", bo'sh"}`}
      >
        <span className="flex items-start justify-between gap-2 pr-7">
          <span className={`text-[24px] font-black tracking-tightest leading-none break-words ${inactive ? 'text-muted' : theme.num}`}>
            {table.table_number}
          </span>
        </span>

        {inactive ? (
          <span className="mt-auto text-[12px] font-bold text-muted">Nofaol</span>
        ) : order ? (
          <span className="mt-auto flex flex-col gap-1">
            <span className="text-[17px] font-black text-ink tabular-nums leading-tight">{formatMoney(order.total_price)}</span>
            <span className="flex items-center justify-between gap-2 text-[12px] font-bold">
              {mins !== null && (
                <span className={`inline-flex items-center gap-1 tabular-nums ${mins >= 60 ? 'text-danger-ink' : 'text-muted'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {mins >= 60 ? `${Math.floor(mins / 60)} s ${mins % 60} daq` : `${mins} daq`}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-muted">
                <Users className="w-3.5 h-3.5" />
                {table.capacity}
              </span>
            </span>
            {order.waiter_name && <span className="text-[12px] font-semibold text-muted truncate">{order.waiter_name}</span>}
          </span>
        ) : table.status === 'RESERVED' ? (
          <span className="mt-auto flex flex-col gap-0.5">
            <span className="text-[13px] font-extrabold text-info">{TABLE_STATUS_LABEL.RESERVED || 'Bron'}</span>
            {table.notes && <span className="text-[12px] text-muted truncate">{table.notes}</span>}
          </span>
        ) : (
          <span className="mt-auto flex items-end justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
              <Users className="w-3.5 h-3.5" /> {table.capacity} kishi
            </span>
            <span className="w-8 h-8 rounded-xl border-2 border-dashed border-edge-strong text-subtle flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </span>
          </span>
        )}
      </button>
      {canManage && (
        <IconButton label="Amallar" onClick={onMenu} className="absolute top-0.5 right-0.5">
          <MoreVertical className="w-5 h-5" />
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
}> = ({ halls, tables, value, onChange, hasUnassigned, onManage }) => {
  const active = tables.filter((t) => t.is_active !== false);
  const stat = (key: string | null) => {
    const list = key === null ? active : active.filter((t) => (t.hall || '') === key);
    return { busy: list.filter((t) => t.current_order || t.status === 'OCCUPIED').length, all: list.length };
  };
  const items = [
    { key: 'ALL', label: 'Barcha zallar', s: stat(null) },
    ...halls.map((h) => ({ key: h.uuid, label: h.name, s: stat(h.uuid) })),
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
            <span className={`shrink-0 text-[12px] font-bold tabular-nums ${on ? 'text-white/85' : 'text-muted'}`}>
              {it.s.busy}/{it.s.all}
            </span>
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
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());

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
    refetchTimer.current = setTimeout(() => fetchTables(true), 600);
  }, [fetchTables]);
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
    const q = search.trim().toLowerCase();
    return tables.filter((t) => {
      if (filter === 'INACTIVE' && t.is_active !== false) return false;
      if (filter !== 'ALL' && filter !== 'INACTIVE' && (t.status !== filter || t.is_active === false)) return false;
      if (hallFilter !== 'ALL' && (t.hall || '') !== hallFilter) return false;
      if (!q) return true;
      return String(t.table_number).toLowerCase().includes(q) || String(t.notes || '').toLowerCase().includes(q);
    });
  }, [tables, filter, search, hallFilter]);

  // «Barchasi» tanlanganda va zallar bo'lsa — stollar zallar bo'yicha bo'limlarga bo'linadi
  const sections = useMemo(() => {
    if (hallFilter !== 'ALL' || halls.length === 0) return [{ key: 'all', title: '', items: visible }];
    const list = [...halls.map((h) => ({ key: h.uuid, title: h.name })), { key: '', title: 'Zalsiz' }];
    return list.map((h) => ({ ...h, items: visible.filter((t) => (t.hall || '') === h.key) })).filter((h) => h.items.length > 0);
  }, [visible, halls, hallFilter]);
  const hasUnassigned = halls.length > 0 && tables.some((t) => !t.hall);

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
  const busy = counts.OCCUPIED;

  return (
    <div className="pb-4">
      <PageHeader
        title="Stollar"
        subtitle={loading ? 'Yuklanmoqda...' : `${counts.ALL} ta stol · ${busy} ta band · ${counts.AVAILABLE} ta bo'sh`}
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
            {canManage && qrUrl && (
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
          <Tabs<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'Barchasi', count: counts.ALL },
              { value: 'AVAILABLE', label: "Bo'sh", count: counts.AVAILABLE },
              { value: 'OCCUPIED', label: 'Band', count: counts.OCCUPIED },
              { value: 'RESERVED', label: 'Rezerv', count: counts.RESERVED },
              ...(counts.INACTIVE > 0 ? [{ value: 'INACTIVE' as Filter, label: 'Nofaol', count: counts.INACTIVE }] : []),
            ]}
          />
          {halls.length > 0 && (
            <div className="lg:hidden">
            <Tabs<string>
              value={hallFilter}
              onChange={setHallFilter}
              options={[
                { value: 'ALL', label: 'Barcha zallar' },
                ...halls.map((h) => ({ value: h.uuid, label: h.name, count: tables.filter((t) => t.hall === h.uuid).length })),
                ...(hasUnassigned ? [{ value: '', label: 'Zalsiz', count: tables.filter((t) => !t.hall).length }] : []),
              ]}
            />
            </div>
          )}
          {tables.length > 8 && <SearchInput value={search} onChange={setSearch} placeholder="Stol raqami yoki izoh bo'yicha qidirish" className="md:max-w-sm" />}
        </div>
      </PageHeader>

      <div className="mt-2 flex gap-4">
        {halls.length > 0 && !loading && !error && (
          <HallRail
            halls={halls}
            tables={tables}
            value={hallFilter}
            onChange={setHallFilter}
            hasUnassigned={hasUnassigned}
            onManage={canManage ? () => setHallsOpen(true) : undefined}
          />
        )}
        <div className="flex-1 min-w-0">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[124px] rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchTables()} />
        ) : visible.length === 0 ? (
          tables.length === 0 ? (
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
              description="Filtr yoki qidiruv shartini o'zgartiring."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter('ALL');
                    setSearch('');
                  }}
                >
                  Filtrni tozalash
                </Button>
              }
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-2.5">
            {sec.items.map((t) => (
              <TableTile
                key={t.uuid}
                table={t}
                now={now}
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
            if (refresh) fetchTables(true);
          }}
        />
      )}
    </div>
  );
};

export default TablesPage;
