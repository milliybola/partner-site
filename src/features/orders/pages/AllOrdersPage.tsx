import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  MapPin,
  Pencil,
  Phone,
  Printer,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { filialApi } from '../services/filialApi';
import type { PartnerFilial } from '../services/filialApi';
import { EditOrderModal } from '../components/EditOrderModal';
import { printReceipt as printReceiptUtil } from '../utils/printing';
import { useToast } from '../../../core/components/ToastProvider';
import {
  Badge,
  Button,
  DataList,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Sheet,
  SkeletonList,
  StatCard,
} from '../../../core/ui';
import type { Column } from '../../../core/ui';
import { formatDateTime, formatMoney, formatPhone, parseDate } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { getPartner, isShop } from '../../../core/lib/session';
import {
  QUEUE_GROUPS,
  deliveryTypeLabel,
  paymentLabel,
  statusLabel,
  statusTone,
} from '../utils/status';

type DatePreset = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

const formatDateParam = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Resolves a preset into a concrete from/to date pair (both inclusive, local time).
const getPresetDateRange = (preset: DatePreset): { from?: string; to?: string } => {
  const now = new Date();
  const today = formatDateParam(now);
  switch (preset) {
    case 'TODAY':
      return { from: today, to: today };
    case 'WEEK': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      return { from: formatDateParam(monday), to: today };
    }
    case 'MONTH':
      return { from: formatDateParam(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'YEAR':
      return { from: formatDateParam(new Date(now.getFullYear(), 0, 1)), to: today };
    default:
      return {};
  }
};

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'TODAY', label: 'Bugun' },
  { value: 'WEEK', label: 'Hafta' },
  { value: 'MONTH', label: 'Oy' },
  { value: 'YEAR', label: 'Yil' },
  { value: 'ALL', label: 'Hammasi' },
  { value: 'CUSTOM', label: 'Oraliq' },
];

const DONE_OK = ['COMPLETED', 'DELIVERED'];
const DONE_BAD = ['CANCELLED', 'REJECTED'];
const ACTIVE = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ON_THE_WAY'];

const orderPayment = (o: Order) => (o.payment || o.payment_method || '').toUpperCase();
const orderNo = (o: Order) => o.order_number || `#${o.id}`;
const timeOf = (o: Order) => parseDate(o.created_at)?.getTime() ?? 0;

const SOURCE_LABEL: Record<string, string> = {
  WAITER: 'Ofitsiant',
  CUSTOMER: 'Mijoz (ilova)',
  PARTNER: 'Kassa',
};

const AllOrdersPage: React.FC = () => {
  const toast = useToast();
  const partner = getPartner();
  const manager = partner?.role === 'manager';
  const shop = isShop(partner);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printingUuid, setPrintingUuid] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  const [selectedFilialUuid, setSelectedFilialUuid] = useState<string>('');
  const [filials, setFilials] = useState<PartnerFilial[]>([]);

  useEffect(() => {
    if (manager) return;
    filialApi
      .getFilials()
      .then(setFilials)
      .catch(() => setFilials([]));
  }, [manager]);

  const fetchOrders = useCallback(async (): Promise<Order[]> => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } =
        datePreset === 'CUSTOM'
          ? { from: customFromDate || undefined, to: customToDate || undefined }
          : getPresetDateRange(datePreset);
      const data = await ordersApi.getOrders({
        filialUuid: selectedFilialUuid || undefined,
        fromDate: from,
        toDate: to,
      });
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      return list;
    } catch (err) {
      setError(getErrorMessage(err, "Buyurtmalarni yuklashda xatolik yuz berdi."));
      return [];
    } finally {
      setLoading(false);
    }
  }, [selectedFilialUuid, datePreset, customFromDate, customToDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handlePrintReceipt = async (orderUuid: string, includeOfdQr: boolean) => {
    setPrintingUuid(orderUuid);
    try {
      await printReceiptUtil(orderUuid, includeOfdQr);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Chekni chop etishda xatolik'));
    } finally {
      setPrintingUuid(null);
    }
  };

  // BUGFIX: the old filter called order.contact_phone.includes / order.address.toLowerCase
  // directly, which crashed the page for dine-in/pickup orders without phone or address.
  // Sorting used new Date(created_at), which is NaN for backend "dd-MM-yyyy HH:mm" strings.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const group = QUEUE_GROUPS.find((g) => g.key === statusFilter);
    return orders
      .filter((o) => {
        if (q) {
          const hit =
            String(o.id ?? '').includes(q) ||
            (o.order_number || '').toLowerCase().includes(q) ||
            (o.contact_name || '').toLowerCase().includes(q) ||
            (o.address || '').toLowerCase().includes(q) ||
            (!!qDigits && (o.contact_phone || '').replace(/\D/g, '').includes(qDigits));
          if (!hit) return false;
        }
        const s = (o.status || '').toUpperCase();
        if (statusFilter !== 'ALL') {
          if (group) {
            if (!group.statuses.includes(s)) return false;
          } else if (s !== statusFilter) return false;
        }
        if (typeFilter !== 'ALL' && o.delivery_type !== typeFilter) return false;
        if (paymentFilter !== 'ALL' && orderPayment(o) !== paymentFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') return timeOf(a) - timeOf(b);
        if (sortBy === 'price-desc') return Number(b.total_price) - Number(a.total_price);
        if (sortBy === 'price-asc') return Number(a.total_price) - Number(b.total_price);
        return timeOf(b) - timeOf(a);
      });
  }, [orders, searchQuery, statusFilter, typeFilter, paymentFilter, sortBy]);

  const stats = useMemo(() => {
    const st = (o: Order) => (o.status || '').toUpperCase();
    const completed = orders.filter((o) => DONE_OK.includes(st(o)));
    return {
      total: orders.length,
      active: orders.filter((o) => ACTIVE.includes(st(o))).length,
      completed: completed.length,
      cancelled: orders.filter((o) => DONE_BAD.includes(st(o))).length,
      revenue: completed.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0),
    };
  }, [orders]);

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (paymentFilter !== 'ALL' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0) +
    (selectedFilialUuid ? 1 : 0);

  const resetFilters = () => {
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setPaymentFilter('ALL');
    setSortBy('newest');
    setSelectedFilialUuid('');
  };

  const typeBadge = (o: Order) => {
    if (o.delivery_type === 'DINE_IN') return <Badge tone="neutral">{o.table_number ? `Stol ${o.table_number}` : 'Zalda'}</Badge>;
    if (!o.delivery_type) return null;
    return <Badge tone="neutral">{deliveryTypeLabel(o.delivery_type)}</Badge>;
  };

  const printButtons = (o: Order, size: 'sm' | 'md' | 'lg' = 'sm') => (
    <>
      <Button
        size={size}
        variant="outline"
        loading={printingUuid === o.uuid}
        icon={<Printer className="w-4 h-4" />}
        onClick={() => handlePrintReceipt(o.uuid, true)}
        title="Chek (QR bilan)"
      >
        QR bilan
      </Button>
      <Button
        size={size}
        variant="ghost"
        disabled={printingUuid === o.uuid}
        icon={<Printer className="w-4 h-4" />}
        onClick={() => handlePrintReceipt(o.uuid, false)}
        title="Chek (QR siz)"
      >
        QR siz
      </Button>
    </>
  );

  const columns: Column<Order>[] = [
    {
      key: 'no',
      header: 'Buyurtma',
      primary: true,
      render: (o) => (
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-extrabold text-ink">{orderNo(o)}</span>
          <span className="flex flex-wrap gap-1">{typeBadge(o)}</span>
        </div>
      ),
    },
    { key: 'date', header: 'Sana', render: (o) => <span className="text-muted whitespace-nowrap">{formatDateTime(o.created_at)}</span> },
    {
      key: 'client',
      header: 'Mijoz',
      render: (o) => (
        <div className="min-w-0">
          <div className="truncate">{o.contact_name || formatPhone(o.contact_phone) || '—'}</div>
          {o.contact_name && o.contact_phone && <div className="text-[12px] text-muted">{formatPhone(o.contact_phone)}</div>}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Manzil',
      mobileHidden: true,
      className: 'max-w-[240px]',
      render: (o) => (
        <span className="block truncate text-muted" title={o.address}>
          {o.address || '—'}
        </span>
      ),
    },
    { key: 'pay', header: "To'lov", render: (o) => <span>{paymentLabel(orderPayment(o))}</span> },
    {
      key: 'status',
      header: 'Holat',
      mobileAside: true,
      render: (o) => <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>,
    },
    {
      key: 'total',
      header: 'Jami',
      align: 'right',
      mobileAside: true,
      render: (o) => <span className="font-extrabold text-ink whitespace-nowrap">{formatMoney(o.total_price)}</span>,
    },
  ];

  /* ------------------------------------------------------------ filters */
  const filterFields = (
    <>
      <Select label="Holat" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="ALL">Barcha holatlar</option>
        {QUEUE_GROUPS.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
        <option value="CANCELLED">Bekor qilingan</option>
        <option value="REJECTED">Rad etilgan</option>
      </Select>
      <Select label="Turi" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
        <option value="ALL">Barcha turlar</option>
        <option value="DELIVERY">Yetkazib berish</option>
        {!shop && <option value="PICKUP">Olib ketish</option>}
        {!shop && <option value="DINE_IN">Zalda</option>}
      </Select>
      <Select label="To'lov" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
        <option value="ALL">Barcha to'lovlar</option>
        <option value="CASH">Naqd</option>
        <option value="CARD">Karta</option>
        <option value="CLICK">Click</option>
        <option value="PAYME">Payme</option>
        <option value="UZCARD">Uzcard</option>
      </Select>
      <Select label="Saralash" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
        <option value="newest">Avval yangilari</option>
        <option value="oldest">Avval eskilari</option>
        <option value="price-desc">Summa: kamayish</option>
        <option value="price-asc">Summa: o'sish</option>
      </Select>
      {!manager && filials.length > 0 && (
        <Select label="Filial" value={selectedFilialUuid} onChange={(e) => setSelectedFilialUuid(e.target.value)}>
          <option value="">Barcha filiallar</option>
          {filials.map((f) => (
            <option key={f.uuid} value={f.uuid}>
              {f.filial_name}
            </option>
          ))}
        </Select>
      )}
    </>
  );

  /* ------------------------------------------------------------- detail */
  const o = selectedOrder;
  const detail = o && (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>
        {typeBadge(o)}
        <Badge tone={o.is_paid ? 'success' : 'warning'}>{o.is_paid ? "To'langan" : "To'lanmagan"}</Badge>
      </div>

      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-2">Tarkibi</div>
        <div className="divide-y divide-edge border border-edge rounded-2xl">
          {(o.items || []).length === 0 && <div className="p-4 text-[14px] text-muted">Mahsulotlar ro'yxati kelmadi</div>}
          {(o.items || []).map((item, idx) => {
            const name = item?.product_name || item?.name || item?.product?.name || "Noma'lum mahsulot";
            const price = Number(item?.price_at_time_of_order ?? item?.product?.price ?? 0);
            const qty = item?.quantity || 0;
            return (
              <div key={item.uuid || idx} className="px-4 py-3 flex items-center justify-between gap-3 text-[14px]">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{name}</div>
                  <div className="text-[13px] text-muted">
                    {formatMoney(price)} × {qty}
                  </div>
                </div>
                <span className="font-bold shrink-0">{formatMoney(item.line_total ?? price * qty)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 text-[14px]">
        {o.delivery_type === 'DELIVERY' && (
          <div className="flex justify-between text-muted">
            <span>Yetkazib berish</span>
            <span>{formatMoney(o.delivery_fee)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="font-bold">Jami</span>
          <span className="text-[20px] font-black text-ink tracking-tightest">{formatMoney(o.total_price)}</span>
        </div>
      </div>

      <div className="rounded-2xl bg-field p-4 space-y-2.5 text-[14px]">
        {o.contact_name && (
          <p className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-muted shrink-0" /> {o.contact_name}
          </p>
        )}
        {o.contact_phone && (
          <a href={`tel:${o.contact_phone}`} className="flex items-center gap-2.5 text-brand font-semibold">
            <Phone className="w-4 h-4 shrink-0" /> {formatPhone(o.contact_phone)}
          </a>
        )}
        {o.address && (
          <p className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-muted shrink-0 mt-0.5" />
            <span>
              {o.address}
              {o.distance ? ` · ${o.distance} km` : ''}
            </span>
          </p>
        )}
        {o.courier_phone && (
          <a href={`tel:${o.courier_phone}`} className="flex items-center gap-2.5">
            <Truck className="w-4 h-4 text-muted shrink-0" /> Kuryer: {formatPhone(o.courier_phone)}
          </a>
        )}
        <p className="flex items-center gap-2.5">
          <CreditCard className="w-4 h-4 text-muted shrink-0" />
          {o.payment_method_display || paymentLabel(orderPayment(o))}
        </p>
        {o.order_source && (
          <p className="text-muted">Manba: {SOURCE_LABEL[o.order_source] || o.order_source_display || o.order_source}</p>
        )}
        {o.description && o.description !== "Izoh yo'q" && <p className="text-muted italic">Izoh: {o.description}</p>}
        {o.reject_reason && <p className="text-danger-ink">Sabab: {o.reject_reason}</p>}
      </div>
    </div>
  );

  return (
    <div className="pb-4">
      <PageHeader
        title="Buyurtmalar tarixi"
        subtitle={loading ? 'Yuklanmoqda...' : `${filtered.length} ta buyurtma`}
        actions={
          <>
            <IconButton label="Yangilash" variant="outline" onClick={() => fetchOrders()} disabled={loading}>
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </IconButton>
          </>
        }
      >
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <SearchInput
              className="flex-1"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Raqam, mijoz, telefon yoki manzil"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="md:hidden relative h-11 w-11 shrink-0 rounded-xl bg-surface border border-edge flex items-center justify-center text-ink cursor-pointer"
              aria-label="Filtrlar"
            >
              <SlidersHorizontal className="w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[11px] font-extrabold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <Segmented
            options={DATE_PRESETS}
            value={datePreset}
            onChange={(v) => {
              setDatePreset(v);
              if (v !== 'CUSTOM') {
                setCustomFromDate('');
                setCustomToDate('');
              }
            }}
          />
          {datePreset === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <Input type="date" aria-label="Boshlanish" value={customFromDate} max={customToDate || undefined} onChange={(e) => setCustomFromDate(e.target.value)} />
              <Input type="date" aria-label="Tugash" value={customToDate} min={customFromDate || undefined} onChange={(e) => setCustomToDate(e.target.value)} />
            </div>
          )}
        </div>
      </PageHeader>

      {/* Desktop inline filters */}
      <div className="hidden md:grid grid-cols-5 gap-3 mb-4 items-end">
        {filterFields}
        {activeFilterCount > 0 && (
          <Button variant="ghost" onClick={resetFilters}>
            Tozalash
          </Button>
        )}
      </div>

      {/* KPIs (for the loaded period) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Jami" value={stats.total} icon={<ShoppingBag className="w-4 h-4" />} tone="neutral" />
        <StatCard label="Jarayonda" value={stats.active} icon={<Clock className="w-4 h-4" />} tone="info" />
        <StatCard label="Yakunlangan" value={stats.completed} icon={<CheckCircle className="w-4 h-4" />} tone="brand" />
        <StatCard label="Bekor / rad" value={stats.cancelled} icon={<XCircle className="w-4 h-4" />} tone="danger" />
        <StatCard
          className="col-span-2 lg:col-span-1"
          label="Yakunlangan savdo"
          value={formatMoney(stats.revenue)}
          icon={<DollarSign className="w-4 h-4" />}
          tone="gold"
        />
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        <div className="ui-card">
          <ErrorState message={error} onRetry={() => fetchOrders()} />
        </div>
      ) : (
        <DataList
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.uuid}
          onRowClick={setSelectedOrder}
          rowActions={(r) => printButtons(r)}
          empty={
            <div className="ui-card">
              <EmptyState
                icon={<ShoppingBag className="w-7 h-7" />}
                title="Buyurtmalar topilmadi"
                description={
                  orders.length > 0 ? 'Filtr yoki qidiruvni o‘zgartirib ko‘ring.' : 'Tanlangan davrda buyurtmalar yo‘q.'
                }
                action={
                  activeFilterCount > 0 || searchQuery ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        resetFilters();
                        setSearchQuery('');
                      }}
                    >
                      Filtrlarni tozalash
                    </Button>
                  ) : undefined
                }
              />
            </div>
          }
        />
      )}

      {/* Mobile filter sheet */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrlar"
        footer={
          <>
            <Button variant="secondary" size="lg" block onClick={resetFilters}>
              Tozalash
            </Button>
            <Button size="lg" block icon={<ArrowUpDown className="w-4 h-4" />} onClick={() => setFiltersOpen(false)}>
              Ko'rsatish ({filtered.length})
            </Button>
          </>
        }
      >
        <div className="space-y-4">{filterFields}</div>
      </Sheet>

      {/* Order detail */}
      <Sheet
        open={!!o}
        onClose={() => setSelectedOrder(null)}
        title={o ? `Buyurtma ${orderNo(o)}` : ''}
        subtitle={o ? formatDateTime(o.created_at) : undefined}
        size="md"
        footer={
          o && (
            <>
              <Button variant="secondary" size="lg" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditingOrder(o)}>
                Tahrirlash
              </Button>
              <div className="grid grid-cols-2 gap-2 md:flex">{printButtons(o, 'lg')}</div>
            </>
          )
        }
      >
        {detail}
      </Sheet>

      {editingOrder && (
        <EditOrderModal
          orderUuid={editingOrder.uuid}
          orderNumber={orderNo(editingOrder)}
          onClose={async (refresh) => {
            const editedUuid = editingOrder.uuid;
            setEditingOrder(null);
            if (refresh) {
              const data = await fetchOrders();
              const fresh = data.find((x) => x.uuid === editedUuid);
              if (fresh) setSelectedOrder(fresh);
            }
          }}
        />
      )}
    </div>
  );
};

export default AllOrdersPage;
