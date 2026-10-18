import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eraser, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { deliveryZonesApi } from '../services/deliveryZonesApi';
import type { Neighborhood, PartnerDeliveryZone } from '../services/deliveryZonesApi';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { NeighborhoodMap } from '../components/NeighborhoodMap';
import { NeighborhoodChecklist } from '../components/NeighborhoodChecklist';
import { EditZoneModal } from '../components/EditZoneModal';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { isManager as isManagerRole } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import {
  Badge,
  Button,
  Card,
  DataList,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  PageHeader,
  SearchInput,
  Select,
  Sheet,
  SkeletonList,
  Switch,
} from '../../../core/ui';
import type { Column } from '../../../core/ui';

const TASHKENT_CENTER: [number, number] = [41.311081, 69.240562];

const formatFee = (fee: string | null): string => {
  if (fee === null || fee === undefined || fee === '') return 'Standart narx';
  const n = Number(fee);
  return isNaN(n) ? fee : formatMoney(n);
};

const formatMinutes = (minutes: number | null): string => (minutes === null || minutes === undefined ? '—' : `${minutes} daq`);

const DeliveryZonesPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const manager = isManagerRole();

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(true);
  const [neighborhoodsError, setNeighborhoodsError] = useState<string | null>(null);

  const [zones, setZones] = useState<PartnerDeliveryZone[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const [filialList, setFilialList] = useState<PartnerFilial[]>([]);
  const [filialUuid, setFilialUuid] = useState('');

  const [pendingUuids, setPendingUuids] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeliveryFee, setBulkDeliveryFee] = useState('');
  const [bulkEstimatedMinutes, setBulkEstimatedMinutes] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [editingZone, setEditingZone] = useState<PartnerDeliveryZone | null>(null);
  const [busyZone, setBusyZone] = useState<string | null>(null);

  const fetchNeighborhoods = useCallback(async () => {
    setLoadingNeighborhoods(true);
    setNeighborhoodsError(null);
    try {
      const data = await deliveryZonesApi.getNeighborhoods();
      setNeighborhoods(Array.isArray(data.neighborhoods) ? data.neighborhoods : []);
      setDistricts(Array.isArray(data.districts) ? data.districts : []);
      setSelectedDistrict((prev) => prev || data.districts?.[0] || '');
    } catch (err) {
      setNeighborhoodsError(getErrorMessage(err, "Mahallalar ro'yxatini yuklashda xatolik yuz berdi."));
    } finally {
      setLoadingNeighborhoods(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    setLoadingZones(true);
    setZonesError(null);
    try {
      setZones(await deliveryZonesApi.getZones(filialUuid || undefined));
    } catch (err) {
      setZonesError(getErrorMessage(err, 'Yetkazib berish hududlarini yuklashda xatolik yuz berdi.'));
    } finally {
      setLoadingZones(false);
    }
  }, [filialUuid]);

  useEffect(() => {
    fetchNeighborhoods();
  }, [fetchNeighborhoods]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  useEffect(() => {
    if (manager) return;
    filialApi
      .getFilials()
      .then(setFilialList)
      .catch(() => setFilialList([]));
  }, [manager]);

  // Pending selections made for one filial must not leak into another filial's bulk add.
  useEffect(() => {
    setPendingUuids(new Set());
  }, [filialUuid]);

  const savedZonesByUuid = useMemo(() => {
    const map = new Map<string, PartnerDeliveryZone>();
    zones.forEach((z) => {
      if (z.neighborhood?.uuid) map.set(z.neighborhood.uuid, z);
    });
    return map;
  }, [zones]);

  const districtFiltered = useMemo(
    () => (selectedDistrict ? neighborhoods.filter((n) => n.district === selectedDistrict) : neighborhoods),
    [neighborhoods, selectedDistrict],
  );

  const checklistItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? districtFiltered.filter((n) => n.name.toLowerCase().includes(q)) : districtFiltered;
  }, [districtFiltered, searchQuery]);

  // Saved zones and pending picks stay on the map even outside the selected district.
  const mapNeighborhoods = useMemo(() => {
    const byUuid = new Map<string, Neighborhood>();
    districtFiltered.forEach((n) => byUuid.set(n.uuid, n));
    zones.forEach((z) => {
      if (z.neighborhood) byUuid.set(z.neighborhood.uuid, z.neighborhood);
    });
    pendingUuids.forEach((uuid) => {
      if (!byUuid.has(uuid)) {
        const n = neighborhoods.find((nb) => nb.uuid === uuid);
        if (n) byUuid.set(uuid, n);
      }
    });
    return Array.from(byUuid.values());
  }, [districtFiltered, zones, pendingUuids, neighborhoods]);

  const mapCenter = useMemo<[number, number]>(() => {
    const withCenter = districtFiltered.find((n) => n.center) || neighborhoods.find((n) => n.center);
    return withCenter?.center || TASHKENT_CENTER;
  }, [districtFiltered, neighborhoods]);

  const handleToggle = (uuid: string) => {
    const saved = savedZonesByUuid.get(uuid);
    if (saved) {
      setEditingZone(saved);
      return;
    }
    setPendingUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const selectAllVisible = () => {
    setPendingUuids((prev) => {
      const next = new Set(prev);
      checklistItems.forEach((n) => {
        if (!savedZonesByUuid.has(n.uuid)) next.add(n.uuid);
      });
      return next;
    });
  };

  const bulkFeeInvalid = bulkDeliveryFee.trim() !== '' && (isNaN(Number(bulkDeliveryFee)) || Number(bulkDeliveryFee) < 0);
  const bulkMinInvalid =
    bulkEstimatedMinutes.trim() !== '' && (!Number.isInteger(Number(bulkEstimatedMinutes)) || Number(bulkEstimatedMinutes) < 0);

  const handleBulkAdd = async () => {
    if (pendingUuids.size === 0 || bulkFeeInvalid || bulkMinInvalid) return;
    setBulkSubmitting(true);
    try {
      const count = pendingUuids.size;
      await deliveryZonesApi.bulkAddZones({
        neighborhood_uuids: Array.from(pendingUuids),
        filial_uuid: filialUuid || null,
        delivery_fee: bulkDeliveryFee.trim() ? bulkDeliveryFee.trim() : null,
        estimated_minutes: bulkEstimatedMinutes.trim() ? Number(bulkEstimatedMinutes) : null,
      });
      toast.success(`${count} ta hudud qo'shildi.`);
      setPendingUuids(new Set());
      setBulkOpen(false);
      setBulkDeliveryFee('');
      setBulkEstimatedMinutes('');
      fetchZones();
    } catch (err) {
      toast.error(getErrorMessage(err, "Hududlarni qo'shishda xatolik yuz berdi."));
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleToggleZoneActive = async (zone: PartnerDeliveryZone) => {
    const updated = !zone.is_active;
    setBusyZone(zone.uuid);
    setZones((prev) => prev.map((z) => (z.uuid === zone.uuid ? { ...z, is_active: updated } : z)));
    try {
      await deliveryZonesApi.updateZone(zone.uuid, { is_active: updated });
    } catch (err) {
      setZones((prev) => prev.map((z) => (z.uuid === zone.uuid ? { ...z, is_active: !updated } : z)));
      toast.error(getErrorMessage(err, "Hudud faolligini o'zgartirishda xatolik."));
    } finally {
      setBusyZone(null);
    }
  };

  const handleDeleteZone = async (zone: PartnerDeliveryZone) => {
    const ok = await confirm(`"${zone.neighborhood.name}" hududi o'chiriladi. Davom etasizmi?`, {
      title: "Hududni o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (!ok) return;
    setBusyZone(zone.uuid);
    try {
      await deliveryZonesApi.deleteZone(zone.uuid);
      setZones((prev) => prev.filter((z) => z.uuid !== zone.uuid));
      toast.success("Hudud o'chirildi.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Hududni o'chirishda xatolik yuz berdi."));
    } finally {
      setBusyZone(null);
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm(
      // NOTE: DELETE partner/delivery-zones/clear/ takes no filial parameter — it clears ALL zones of the partner.
      `Barcha ${zones.length > 0 ? `(${zones.length} ta ko'rinayotgan) ` : ''}yetkazib berish hududlari o'chiriladi — barcha filiallar uchun. Bu amalni ortga qaytarib bo'lmaydi.`,
      { title: 'Barcha hududlarni tozalash', danger: true, confirmText: "Barchasini o'chirish" },
    );
    if (!ok) return;
    try {
      await deliveryZonesApi.clearZones();
      setPendingUuids(new Set());
      toast.success('Barcha hududlar tozalandi.');
      fetchZones();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Hududlarni tozalashda xatolik yuz berdi.'));
    }
  };

  const columns: Column<PartnerDeliveryZone>[] = [
    {
      key: 'name',
      header: 'Mahalla',
      primary: true,
      render: (z) => (
        <div className="min-w-0">
          <div className="font-bold text-ink truncate">{z.neighborhood?.name || '—'}</div>
          <div className="text-[12px] text-muted md:hidden">{z.neighborhood?.district}</div>
        </div>
      ),
    },
    { key: 'district', header: 'Tuman', mobileHidden: true, render: (z) => <span className="text-muted">{z.neighborhood?.district || '—'}</span> },
    { key: 'filial', header: 'Filial', render: (z) => <span className="text-muted">{z.filial_name || 'Barcha filiallar'}</span> },
    { key: 'fee', header: 'Narx', render: (z) => <span className="whitespace-nowrap">{formatFee(z.delivery_fee)}</span> },
    { key: 'time', header: 'Vaqt', render: (z) => formatMinutes(z.estimated_minutes) },
    {
      key: 'status',
      header: 'Holat',
      mobileAside: true,
      render: (z) => <Badge tone={z.is_active ? 'success' : 'neutral'}>{z.is_active ? 'Faol' : 'Nofaol'}</Badge>,
    },
  ];

  const pendingCount = pendingUuids.size;

  if (loadingNeighborhoods) {
    return (
      <div>
        <PageHeader title="Yetkazish hududlari" />
        <LoadingState label="Mahallalar ro'yxati yuklanmoqda..." />
      </div>
    );
  }

  if (neighborhoodsError) {
    return (
      <div>
        <PageHeader title="Yetkazish hududlari" />
        <Card>
          <ErrorState message={neighborhoodsError} onRetry={fetchNeighborhoods} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Yetkazish hududlari"
        subtitle="Xarita yoki ro'yxatdan mahallalarni tanlang"
        sticky={false}
        actions={
          <Button variant="danger-soft" icon={<Eraser className="w-4 h-4" />} onClick={handleClearAll} disabled={zones.length === 0}>
            <span className="hidden sm:inline">Barchasini tozalash</span>
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filialList.length > 0 && (
            <Select value={filialUuid} onChange={(e) => setFilialUuid(e.target.value)} aria-label="Filial">
              <option value="">Barcha filiallar</option>
              {filialList.map((f) => (
                <option key={f.uuid} value={f.uuid}>
                  {f.filial_name} {f.is_main ? '(Asosiy)' : ''}
                </option>
              ))}
            </Select>
          )}
          <Select value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)} aria-label="Tuman">
            <option value="">Barcha tumanlar</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Mahalla nomi..." />
        </div>
      </PageHeader>

      {/* Map + checklist: stacked on phones (map first), side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
        <div className="lg:col-span-7 min-w-0">
          <NeighborhoodMap
            neighborhoods={mapNeighborhoods}
            savedZonesByUuid={savedZonesByUuid}
            pendingUuids={pendingUuids}
            centerFallback={mapCenter}
            onToggle={handleToggle}
          />
        </div>
        <Card padded={false} className="lg:col-span-5 min-w-0 flex flex-col lg:max-h-[600px]">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
            <div className="min-w-0">
              <h3 className="text-[16px] font-extrabold tracking-tightest">Mahallalar</h3>
              <p className="text-[12px] text-muted">{checklistItems.length} ta ko'rsatilmoqda</p>
            </div>
            <Button size="sm" variant="secondary" onClick={selectAllVisible} disabled={checklistItems.length === 0}>
              Hammasini tanlash
            </Button>
          </div>
          <div className="px-3 pb-3 overflow-y-auto max-h-[50vh] lg:max-h-none lg:flex-1">
            <NeighborhoodChecklist
              neighborhoods={checklistItems}
              savedZonesByUuid={savedZonesByUuid}
              pendingUuids={pendingUuids}
              onToggle={handleToggle}
            />
          </div>
        </Card>
      </div>

      {/* Saved zones */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[17px] font-extrabold tracking-tightest">
            Qo'shilgan hududlar {!loadingZones && !zonesError && <span className="text-muted font-bold">({zones.length})</span>}
          </h2>
        </div>
        {loadingZones ? (
          <SkeletonList rows={3} />
        ) : zonesError ? (
          <Card>
            <ErrorState message={zonesError} onRetry={fetchZones} />
          </Card>
        ) : (
          <DataList
            rows={zones}
            columns={columns}
            rowKey={(z) => z.uuid}
            empty={
              <Card>
                <EmptyState
                  icon={<MapPin className="w-7 h-7" />}
                  title="Hozircha hudud qo'shilmagan"
                  description="Xarita yoki ro'yxatdan mahalla tanlab, pastdagi tugma orqali qo'shing."
                />
              </Card>
            }
            rowActions={(z) => (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-2 mr-1">
                  <span className="text-[12px] text-muted md:hidden">Faol</span>
                  <Switch size="sm" checked={z.is_active} disabled={busyZone === z.uuid} onChange={() => handleToggleZoneActive(z)} label="Faol" />
                </span>
                <IconButton label="Tahrirlash" variant="secondary" onClick={() => setEditingZone(z)}>
                  <Pencil className="w-4 h-4" />
                </IconButton>
                <IconButton label="O'chirish" variant="danger-soft" disabled={busyZone === z.uuid} onClick={() => handleDeleteZone(z)}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            )}
          />
        )}
      </section>

      {/* Selection bar: fixed above the tab bar on phones, sticky at the bottom on desktop */}
      {pendingCount > 0 && (
        <>
          <div className="h-20 md:hidden" aria-hidden />
          <div
            className="fixed md:sticky left-0 right-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] md:bottom-4 z-30
              bg-surface border-t md:border border-edge md:rounded-2xl md:shadow-pop px-4 py-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-extrabold">{pendingCount} ta mahalla tanlandi</div>
              <div className="text-[12px] text-muted truncate">{filialUuid ? filialList.find((f) => f.uuid === filialUuid)?.filial_name : 'Barcha filiallar uchun'}</div>
            </div>
            <IconButton label="Tanlovni bekor qilish" variant="secondary" onClick={() => setPendingUuids(new Set())}>
              <X className="w-4 h-4" />
            </IconButton>
            <Button size="lg" icon={<Plus className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>
              Qo'shish
            </Button>
          </div>
        </>
      )}

      <Sheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        persistent={bulkSubmitting}
        size="sm"
        title={`${pendingCount} ta hududni qo'shish`}
        subtitle={filialUuid ? filialList.find((f) => f.uuid === filialUuid)?.filial_name : 'Barcha filiallar uchun'}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>
              Bekor qilish
            </Button>
            <Button size="lg" onClick={handleBulkAdd} loading={bulkSubmitting} disabled={pendingCount === 0 || bulkFeeInvalid || bulkMinInvalid}>
              Qo'shish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Yetkazib berish narxi (so'm)"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Bo'sh — standart narx"
            value={bulkDeliveryFee}
            onChange={(e) => setBulkDeliveryFee(e.target.value)}
            error={bulkFeeInvalid ? "Narx 0 yoki undan katta son bo'lishi kerak" : null}
            hint="Ixtiyoriy. Barcha tanlangan hududlarga qo'llanadi"
          />
          <Input
            label="Taxminiy yetkazish vaqti (daqiqa)"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Masalan, 40"
            value={bulkEstimatedMinutes}
            onChange={(e) => setBulkEstimatedMinutes(e.target.value)}
            error={bulkMinInvalid ? 'Butun son kiriting' : null}
          />
        </div>
      </Sheet>

      {editingZone && (
        <EditZoneModal
          zone={editingZone}
          onClose={(refresh) => {
            setEditingZone(null);
            if (refresh) fetchZones();
          }}
        />
      )}
    </div>
  );
};

export default DeliveryZonesPage;
