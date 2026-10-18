import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, FileSpreadsheet, MoreVertical, Plus, QrCode, RefreshCw, Table2, Users } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import type { TableModel } from '../services/tablesApi';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { TableOrderModal } from '../components/TableOrderModal';
import { BulkImportSheet, QrSheet, TableActionsSheet, TableFormSheet, TABLE_STATUS_LABEL } from '../components/TableSheets';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useRealtime } from '../../../core/realtime/RealtimeProvider';
import type { RealtimeEvent } from '../../../core/realtime/RealtimeProvider';
import { getPartner, isManager as isManagerRole } from '../../../core/lib/session';
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

const TILE_THEME: Record<string, { tile: string; chip: string; dot: string }> = {
  AVAILABLE: { tile: 'bg-brand-soft border-brand/20', chip: 'bg-surface/80 text-brand', dot: 'bg-brand-bright' },
  OCCUPIED: { tile: 'bg-gold-soft border-gold/50', chip: 'bg-surface/80 text-gold-ink', dot: 'bg-gold' },
  RESERVED: { tile: 'bg-info-soft border-info/25', chip: 'bg-surface/80 text-info', dot: 'bg-info' },
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
  return (
    <div
      className={`relative rounded-2xl border min-h-[148px] flex flex-col transition hover:shadow-card ${
        inactive ? 'border-dashed border-edge-strong bg-surface opacity-60' : theme.tile
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 text-left p-3.5 pr-12 flex flex-col gap-2 cursor-pointer rounded-2xl"
        aria-label={`Stol ${table.table_number}`}
      >
        <span className={`inline-flex self-start items-center gap-1.5 h-6 px-2 rounded-lg text-[11px] font-extrabold ${inactive ? 'bg-field text-muted' : theme.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${inactive ? 'bg-subtle' : theme.dot}`} />
          {inactive ? 'Nofaol' : TABLE_STATUS_LABEL[table.status] || table.status}
        </span>
        <span className="text-[26px] font-black text-ink tracking-tightest leading-none break-words">{table.table_number}</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
          <Users className="w-3.5 h-3.5" /> {table.capacity} kishi
        </span>
        <span className="mt-auto">
          {order ? (
            <span className="flex items-end justify-between gap-2">
              <span className="text-[15px] font-extrabold text-ink tabular-nums">{formatMoney(order.total_price)}</span>
              {mins !== null && (
                <span className={`inline-flex items-center gap-1 text-[12px] font-bold tabular-nums ${mins >= 60 ? 'text-danger-ink' : 'text-muted'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {mins} daq
                </span>
              )}
            </span>
          ) : table.notes ? (
            <span className="block text-[12px] text-muted truncate">{table.notes}</span>
          ) : null}
        </span>
      </button>
      {canManage && (
        <IconButton label="Amallar" onClick={onMenu} className="absolute top-1 right-1">
          <MoreVertical className="w-5 h-5" />
        </IconButton>
      )}
    </div>
  );
};

const TablesPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const partner = useMemo(() => getPartner(), []);
  const manager = isManagerRole(partner);
  // Waiters are blocked at login, so everyone who reaches this page can manage tables.
  const canManage = partner?.role !== ('waiter' as any);

  const [tables, setTables] = useState<TableModel[]>([]);
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
  const [menuTable, setMenuTable] = useState<TableModel | null>(null);
  const [orderingTable, setOrderingTable] = useState<TableModel | null>(null);

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
      if (!q) return true;
      return String(t.table_number).toLowerCase().includes(q) || String(t.notes || '').toLowerCase().includes(q);
    });
  }, [tables, filter, search]);

  const openForm = (t: TableModel | null) => {
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
            {canManage && qrUrl && (
              <IconButton label="QR-kod" variant="outline" onClick={() => setQrOpen(true)}>
                <QrCode className="w-[18px] h-[18px]" />
              </IconButton>
            )}
            {canManage && (
              <>
                <Button variant="outline" className="hidden sm:inline-flex" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>
                  Ko'plab qo'shish
                </Button>
                <IconButton label="Ko'plab qo'shish" variant="outline" className="sm:hidden" onClick={() => setBulkOpen(true)}>
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
          {tables.length > 8 && <SearchInput value={search} onChange={setSearch} placeholder="Stol raqami yoki izoh bo'yicha qidirish" className="md:max-w-sm" />}
        </div>
      </PageHeader>

      <div className="mt-2">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[148px] rounded-2xl" />
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
                    <Button variant="outline" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {visible.map((t) => (
              <TableTile
                key={t.uuid}
                table={t}
                now={now}
                canManage={canManage}
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
        )}
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
      />

      <TableFormSheet
        open={formOpen}
        table={editing}
        defaultOrder={tables.length + 1}
        isManager={manager}
        filials={filials}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          toast.success(editing ? 'Stol saqlandi' : "Stol qo'shildi");
          fetchTables(true);
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
