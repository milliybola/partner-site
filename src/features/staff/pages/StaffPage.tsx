import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart2, Bike, Edit, Plus, RefreshCw, Shield, Trash2, Trophy, Users } from 'lucide-react';
import { staffApi } from '../services/staffApi';
import type { StaffMember, StaffRatingMember } from '../services/staffApi';
import { couriersApi } from '../services/couriersApi';
import type { CourierModel } from '../services/couriersApi';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import {
  Badge,
  Button,
  Card,
  DataList,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  SkeletonList,
  Switch,
  Tabs,
} from '../../../core/ui';
import type { Column } from '../../../core/ui';
import { formatMoney, formatPhone } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { isManager as isManagerFn } from '../../../core/lib/session';
import { ROLE_LABEL, StaffFormSheet } from '../components/StaffFormSheet';
import { CourierFormSheet, TRANSPORT_LABEL } from '../components/CourierFormSheet';
import { StaffStatsSheet } from '../components/StaffStatsSheet';

type Tab = 'staff' | 'couriers' | 'ratings';
type Period = 'today' | 'week' | 'month' | 'all';

const Avatar: React.FC<{ name?: string }> = ({ name }) => (
  <span className="w-9 h-9 rounded-full bg-field text-ink flex items-center justify-center text-[13px] font-extrabold shrink-0">
    {(name || '?').trim().charAt(0).toUpperCase()}
  </span>
);

const courierStatus = (status?: string) => {
  switch (status) {
    case 'online':
      return <Badge tone="success" dot>Onlayn</Badge>;
    case 'busy':
    case 'on_delivery':
      return <Badge tone="warning" dot>Band</Badge>;
    case 'offline':
      return <Badge dot>Oflayn</Badge>;
    default:
      return <Badge>{status || '—'}</Badge>;
  }
};

const StaffPage: React.FC<{ initialTab?: Tab }> = ({ initialTab = 'staff' }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const manager = isManagerFn();
  const canEdit = !manager;

  const [tab, setTab] = useState<Tab>(initialTab);
  const [filials, setFilials] = useState<PartnerFilial[]>([]);

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState('');
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [statsStaff, setStatsStaff] = useState<StaffMember | null>(null);

  // Couriers
  const [couriers, setCouriers] = useState<CourierModel[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(false);
  const [couriersError, setCouriersError] = useState<string | null>(null);
  const [courierSearch, setCourierSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courierStatus_, setCourierStatus] = useState<'ALL' | 'online' | 'offline'>('ALL');
  const [courierFilial, setCourierFilial] = useState('');
  const [editingCourier, setEditingCourier] = useState<CourierModel | null>(null);
  const [courierFormOpen, setCourierFormOpen] = useState(false);

  // Ratings
  const [period, setPeriod] = useState<Period>('month');
  const [ratings, setRatings] = useState<StaffRatingMember[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [ratingsError, setRatingsError] = useState<string | null>(null);

  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  // BUGFIX: staff + filials were loaded with Promise.all, so a failing (or
  // forbidden-for-managers) filials request blanked the whole staff list.
  const fetchStaff = useCallback(async () => {
    setStaffLoading(true);
    setStaffError(null);
    const [s, f] = await Promise.allSettled([staffApi.getStaff(), filialApi.getFilials()]);
    if (s.status === 'fulfilled') setStaff(s.value);
    else setStaffError(getErrorMessage(s.reason, "Xodimlar ro'yxatini yuklab bo'lmadi."));
    if (f.status === 'fulfilled') setFilials(f.value);
    setStaffLoading(false);
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // BUGFIX: courier search fired a request on every keystroke; now debounced.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(courierSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [courierSearch]);

  const fetchCouriers = useCallback(async () => {
    setCouriersLoading(true);
    setCouriersError(null);
    try {
      setCouriers(
        await couriersApi.getCouriers({
          filial_uuid: courierFilial || undefined,
          status: courierStatus_ !== 'ALL' ? courierStatus_ : undefined,
          search: debouncedSearch || undefined,
        }),
      );
    } catch (err) {
      setCouriersError(getErrorMessage(err, "Kuryerlar ro'yxatini yuklab bo'lmadi."));
    } finally {
      setCouriersLoading(false);
    }
  }, [courierFilial, courierStatus_, debouncedSearch]);

  useEffect(() => {
    if (tab === 'couriers') fetchCouriers();
  }, [tab, fetchCouriers]);

  const fetchRatings = useCallback(async (p: Period) => {
    setRatingsLoading(true);
    setRatingsError(null);
    try {
      setRatings(await staffApi.getStaffRating(p));
    } catch (err) {
      setRatingsError(getErrorMessage(err, "Reytingni yuklab bo'lmadi."));
    } finally {
      setRatingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'ratings') fetchRatings(period);
  }, [tab, period, fetchRatings]);

  const refresh = () => {
    if (tab === 'staff') fetchStaff();
    else if (tab === 'couriers') fetchCouriers();
    else fetchRatings(period);
  };

  /* ------------------------------------------------------ staff actions */
  const toggleStaff = async (m: StaffMember) => {
    if (!canEdit) return;
    setBusyUuid(m.uuid);
    try {
      await staffApi.updateStaff(m.uuid, { is_active: !m.is_active });
      setStaff((prev) => prev.map((x) => (x.uuid === m.uuid ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error(getErrorMessage(err, "Xodim holatini o'zgartirib bo'lmadi."));
    } finally {
      setBusyUuid(null);
    }
  };

  const deleteStaff = async (m: StaffMember) => {
    const ok = await confirm(`"${m.name}" xodimini o'chirasizmi? Bu amalni bekor qilib bo'lmaydi.`, {
      title: "Xodimni o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (!ok) return;
    try {
      await staffApi.deleteStaff(m.uuid);
      setStaff((prev) => prev.filter((x) => x.uuid !== m.uuid));
      toast.success("Xodim o'chirildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Xodimni o'chirib bo'lmadi."));
    }
  };

  /* ---------------------------------------------------- courier actions */
  const toggleCourier = async (c: CourierModel) => {
    if (!canEdit) return;
    setBusyUuid(c.uuid);
    try {
      await couriersApi.updateCourier(c.uuid, { is_active: !c.is_active });
      setCouriers((prev) => prev.map((x) => (x.uuid === c.uuid ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error(getErrorMessage(err, "Kuryer holatini o'zgartirib bo'lmadi."));
    } finally {
      setBusyUuid(null);
    }
  };

  const deleteCourier = async (c: CourierModel) => {
    const ok = await confirm(`"${c.first_name} ${c.last_name}" kuryerini o'chirasizmi?`, {
      title: "Kuryerni o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (!ok) return;
    try {
      await couriersApi.deleteCourier(c.uuid);
      setCouriers((prev) => prev.filter((x) => x.uuid !== c.uuid));
      toast.success("Kuryer o'chirildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Kuryerni o'chirib bo'lmadi."));
    }
  };

  /* ------------------------------------------------------------ columns */
  const filteredStaff = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return staff;
    const digits = q.replace(/\D/g, '');
    return staff.filter((m) => m.name?.toLowerCase().includes(q) || (digits && m.phone?.replace(/\D/g, '').includes(digits)));
  }, [staff, staffQuery]);

  const staffColumns: Column<StaffMember>[] = [
    {
      key: 'name',
      header: 'Xodim',
      primary: true,
      render: (m) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={m.name} />
          <div className="min-w-0">
            <div className="font-bold truncate">{m.name}</div>
            <div className="text-[12px] text-muted font-normal md:hidden">{formatPhone(m.phone)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      mobileAside: true,
      render: (m) => <Badge tone={m.role === 'manager' ? 'info' : 'neutral'}>{ROLE_LABEL[m.role] || m.role}</Badge>,
    },
    { key: 'phone', header: 'Telefon', mobileHidden: true, render: (m) => <span className="tabular-nums">{formatPhone(m.phone)}</span> },
    {
      key: 'filial',
      header: 'Filial',
      render: (m) => (
        <div className="min-w-0">
          <div className="truncate">{m.home_filial?.filial_name || '—'}</div>
          {m.current_filial && m.current_filial.uuid !== m.home_filial?.uuid && (
            <div className="text-[12px] text-brand truncate">Hozir: {m.current_filial.filial_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'today',
      header: 'Bugun',
      render: (m) =>
        m.today_stats ? (
          <div className="tabular-nums">
            <div className="font-semibold">{formatMoney(m.today_stats.revenue)}</div>
            <div className="text-[12px] text-muted">
              {m.today_stats.completed_orders}/{m.today_stats.total_orders} buyurtma
            </div>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'active',
      header: 'Faol',
      align: 'center',
      render: (m) =>
        canEdit ? (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch size="sm" checked={m.is_active} disabled={busyUuid === m.uuid} onChange={() => toggleStaff(m)} label="Faol" />
          </span>
        ) : (
          <Badge tone={m.is_active ? 'success' : 'danger'}>{m.is_active ? 'Faol' : 'Bloklangan'}</Badge>
        ),
    },
  ];

  const courierColumns: Column<CourierModel>[] = [
    {
      key: 'name',
      header: 'Kuryer',
      primary: true,
      render: (c) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={c.first_name} />
          <div className="min-w-0">
            <div className="font-bold truncate">{`${c.first_name || ''} ${c.last_name || ''}`.trim() || '—'}</div>
            <div className="text-[12px] text-muted font-normal md:hidden">{formatPhone(c.phone)}</div>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Holat', mobileAside: true, render: (c) => courierStatus(c.status) },
    { key: 'phone', header: 'Telefon', mobileHidden: true, render: (c) => <span className="tabular-nums">{formatPhone(c.phone)}</span> },
    {
      key: 'vehicle',
      header: 'Transport',
      render: (c) => (
        <div className="min-w-0">
          <div className="truncate">
            {c.vehicle_info?.brand || TRANSPORT_LABEL[c.vehicle_info?.transport_type || ''] || c.vehicle_info?.transport_type || '—'}
          </div>
          {c.vehicle_info?.license_plate && <div className="text-[12px] text-muted font-mono">{c.vehicle_info.license_plate}</div>}
        </div>
      ),
    },
    { key: 'filial', header: 'Filial', render: (c) => c.filial_name || '—' },
    { key: 'tg', header: 'Telegram', mobileHidden: true, render: (c) => (c.telegram_id ? <span className="font-mono text-[13px]">{c.telegram_id}</span> : '—') },
    {
      key: 'active',
      header: 'Faol',
      align: 'center',
      render: (c) =>
        canEdit ? (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch size="sm" checked={c.is_active} disabled={busyUuid === c.uuid} onChange={() => toggleCourier(c)} label="Faol" />
          </span>
        ) : (
          <Badge tone={c.is_active ? 'success' : 'danger'}>{c.is_active ? 'Faol' : 'Bloklangan'}</Badge>
        ),
    },
  ];

  const sortedRatings = useMemo(() => [...ratings].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0)), [ratings]);
  const maxRevenue = sortedRatings[0]?.total_revenue || 1;
  const rankOf = (r: StaffRatingMember) => sortedRatings.indexOf(r) + 1;

  const ratingColumns: Column<StaffRatingMember>[] = [
    {
      key: 'name',
      header: 'Xodim',
      primary: true,
      render: (r) => {
        const rank = rankOf(r);
        const medal = rank === 1 ? 'bg-gold text-ink' : rank === 2 ? 'bg-edge-strong text-ink' : rank === 3 ? 'bg-gold-soft text-gold-ink' : 'bg-field text-muted';
        return (
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black shrink-0 ${medal}`}>{rank}</span>
            <div className="min-w-0">
              <div className="font-bold truncate">{r.name}</div>
              <div className="text-[12px] text-muted font-normal">{ROLE_LABEL[r.role] || r.role}</div>
            </div>
          </div>
        );
      },
    },
    { key: 'rev', header: 'Tushum', align: 'right', mobileAside: true, render: (r) => <span className="font-extrabold tabular-nums">{formatMoney(r.total_revenue)}</span> },
    { key: 'orders', header: 'Buyurtmalar', align: 'right', render: (r) => `${r.completed_orders} / ${r.total_orders} ta` },
    {
      key: 'share',
      header: 'Ulush',
      className: 'md:w-1/4',
      render: (r) => (
        <div className="w-full h-2 rounded-full bg-field overflow-hidden" aria-hidden>
          <div className="h-full bg-brand-bright rounded-full" style={{ width: `${Math.max(2, ((r.total_revenue || 0) / maxRevenue) * 100)}%` }} />
        </div>
      ),
    },
  ];

  const addAction =
    canEdit && tab === 'staff' ? (
      <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingStaff(null); setStaffFormOpen(true); }}>
        <span className="hidden sm:inline">Xodim qo'shish</span>
        <span className="sm:hidden">Qo'shish</span>
      </Button>
    ) : canEdit && tab === 'couriers' ? (
      <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingCourier(null); setCourierFormOpen(true); }}>
        <span className="hidden sm:inline">Kuryer qo'shish</span>
        <span className="sm:hidden">Qo'shish</span>
      </Button>
    ) : null;

  return (
    <div className="pb-6">
      <PageHeader
        title="Xodimlar"
        subtitle="Menejerlar, ofitsantlar va o'z kuryerlaringiz"
        actions={
          <>
            <IconButton label="Yangilash" variant="outline" onClick={refresh}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            {addAction}
          </>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'staff', label: 'Xodimlar', icon: <Users className="w-4 h-4" />, count: staffLoading ? undefined : staff.length },
            { value: 'couriers', label: 'Kuryerlar', icon: <Bike className="w-4 h-4" /> },
            { value: 'ratings', label: 'Reyting', icon: <Trophy className="w-4 h-4" /> },
          ]}
        />
      </PageHeader>

      <div className="space-y-4 mt-1">
        {manager && (
          <InlineAlert tone="info" icon={<Shield className="w-4 h-4" />}>
            Menejer sifatida ro'yxatni ko'rasiz. Xodim va kuryerlarni qo'shish, tahrirlash va o'chirish faqat egasi hisobidan mumkin.
          </InlineAlert>
        )}

        {tab === 'staff' && (
          <>
            {staff.length > 5 && <SearchInput value={staffQuery} onChange={setStaffQuery} placeholder="Ism yoki telefon bo'yicha qidirish" className="max-w-md" />}
            {staffLoading ? (
              <SkeletonList rows={5} />
            ) : staffError ? (
              <Card><ErrorState message={staffError} onRetry={fetchStaff} /></Card>
            ) : (
              <DataList
                rows={filteredStaff}
                columns={staffColumns}
                rowKey={(m) => m.uuid}
                onRowClick={setStatsStaff}
                rowActions={(m) => (
                  <>
                    <Button size="sm" variant="secondary" icon={<BarChart2 className="w-4 h-4" />} onClick={() => setStatsStaff(m)}>
                      Statistika
                    </Button>
                    {canEdit && (
                      <>
                        <IconButton label="Tahrirlash" size="sm" variant="secondary" onClick={() => { setEditingStaff(m); setStaffFormOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </IconButton>
                        <IconButton label="O'chirish" size="sm" variant="danger-soft" onClick={() => deleteStaff(m)}>
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </>
                    )}
                  </>
                )}
                empty={
                  <Card>
                    <EmptyState
                      icon={<Users className="w-7 h-7" />}
                      title={staffQuery ? 'Hech narsa topilmadi' : "Xodimlar yo'q"}
                      description={staffQuery ? "Qidiruv so'zini o'zgartirib ko'ring." : "Menejer yoki ofitsant qo'shing — ular o'z ilovasidan buyurtma qabul qiladi."}
                      action={canEdit && !staffQuery ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingStaff(null); setStaffFormOpen(true); }}>Xodim qo'shish</Button> : undefined}
                    />
                  </Card>
                }
              />
            )}
          </>
        )}

        {tab === 'couriers' && (
          <>
            <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
              <SearchInput value={courierSearch} onChange={setCourierSearch} placeholder="Ism yoki telefon" className="lg:max-w-sm w-full" />
              <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
                <Segmented
                  value={courierStatus_}
                  onChange={setCourierStatus}
                  options={[
                    { value: 'ALL', label: 'Barchasi' },
                    { value: 'online', label: 'Onlayn' },
                    { value: 'offline', label: 'Oflayn' },
                  ]}
                />
                {canEdit && filials.length > 1 && (
                  <Select value={courierFilial} onChange={(e) => setCourierFilial(e.target.value)} aria-label="Filial" containerClassName="sm:w-56">
                    <option value="">Barcha filiallar</option>
                    {filials.map((f) => (
                      <option key={f.uuid} value={f.uuid}>{f.filial_name}</option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
            {couriersLoading && couriers.length === 0 ? (
              <SkeletonList rows={4} />
            ) : couriersError ? (
              <Card><ErrorState message={couriersError} onRetry={fetchCouriers} /></Card>
            ) : (
              <div className={couriersLoading ? 'opacity-60 transition-opacity' : ''}>
                <DataList
                  rows={couriers}
                  columns={courierColumns}
                  rowKey={(c) => c.uuid}
                  rowActions={
                    canEdit
                      ? (c) => (
                          <>
                            <IconButton label="Tahrirlash" size="sm" variant="secondary" onClick={() => { setEditingCourier(c); setCourierFormOpen(true); }}>
                              <Edit className="w-4 h-4" />
                            </IconButton>
                            <IconButton label="O'chirish" size="sm" variant="danger-soft" onClick={() => deleteCourier(c)}>
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          </>
                        )
                      : undefined
                  }
                  empty={
                    <Card>
                      <EmptyState
                        icon={<Bike className="w-7 h-7" />}
                        title="Kuryerlar topilmadi"
                        description={debouncedSearch || courierStatus_ !== 'ALL' ? "Filtrlarni o'zgartirib ko'ring." : "O'z kuryeringizni qo'shing — buyurtmalarni unga to'g'ridan-to'g'ri biriktirasiz."}
                        action={canEdit && !debouncedSearch ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingCourier(null); setCourierFormOpen(true); }}>Kuryer qo'shish</Button> : undefined}
                      />
                    </Card>
                  }
                />
              </div>
            )}
          </>
        )}

        {tab === 'ratings' && (
          <>
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'today', label: 'Bugun' },
                { value: 'week', label: 'Hafta' },
                { value: 'month', label: 'Oy' },
                { value: 'all', label: 'Hammasi' },
              ]}
            />
            {ratingsLoading ? (
              <SkeletonList rows={5} />
            ) : ratingsError ? (
              <Card><ErrorState message={ratingsError} onRetry={() => fetchRatings(period)} /></Card>
            ) : (
              <DataList
                rows={sortedRatings}
                columns={ratingColumns}
                rowKey={(r) => r.uuid}
                empty={<Card><EmptyState icon={<Trophy className="w-7 h-7" />} title="Reyting bo'sh" description="Tanlangan davrda xodimlar buyurtma qabul qilmagan." /></Card>}
              />
            )}
          </>
        )}
      </div>

      <StaffFormSheet
        open={staffFormOpen}
        staff={editingStaff}
        filials={filials}
        onClose={() => setStaffFormOpen(false)}
        onSaved={() => {
          setStaffFormOpen(false);
          toast.success(editingStaff ? 'Xodim yangilandi' : "Xodim qo'shildi");
          fetchStaff();
        }}
      />
      <CourierFormSheet
        open={courierFormOpen}
        courier={editingCourier}
        filials={filials}
        onClose={() => setCourierFormOpen(false)}
        onSaved={() => {
          setCourierFormOpen(false);
          toast.success(editingCourier ? 'Kuryer yangilandi' : "Kuryer qo'shildi");
          fetchCouriers();
        }}
      />
      <StaffStatsSheet staff={statsStaff} onClose={() => setStatsStaff(null)} />
    </div>
  );
};

export default StaffPage;
