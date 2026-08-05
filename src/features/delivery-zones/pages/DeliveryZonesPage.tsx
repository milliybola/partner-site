import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  Edit,
  Trash2,
  Eraser,
  HelpCircle,
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import { deliveryZonesApi } from '../services/deliveryZonesApi';
import type { Neighborhood, PartnerDeliveryZone } from '../services/deliveryZonesApi';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { NeighborhoodMap } from '../components/NeighborhoodMap';
import { NeighborhoodChecklist } from '../components/NeighborhoodChecklist';
import { EditZoneModal } from '../components/EditZoneModal';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';

const TASHKENT_CENTER: [number, number] = [41.311081, 69.240562];

const formatFee = (fee: string | null): string => {
  if (fee === null || fee === undefined || fee === '') return 'Standart narx';
  const num = Number(fee);
  return isNaN(num) ? fee : `${num.toLocaleString('uz-UZ')} so'm`;
};

const formatMinutes = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return '-';
  return `${minutes} daqiqa`;
};

const DeliveryZonesPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();

  const partnerData = (() => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  })();

  // Neighborhoods (master list, selectable)
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(true);
  const [neighborhoodsError, setNeighborhoodsError] = useState<string | null>(null);

  // Partner's saved zones
  const [zones, setZones] = useState<PartnerDeliveryZone[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [zonesError, setZonesError] = useState<string | null>(null);

  // Filial scoping
  const [filialList, setFilialList] = useState<PartnerFilial[]>([]);
  const [filialUuid, setFilialUuid] = useState('');

  // Pending selection (not yet saved) + bulk-add form
  const [pendingUuids, setPendingUuids] = useState<Set<string>>(new Set());
  const [bulkDeliveryFee, setBulkDeliveryFee] = useState('');
  const [bulkEstimatedMinutes, setBulkEstimatedMinutes] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [editingZone, setEditingZone] = useState<PartnerDeliveryZone | null>(null);

  const fetchNeighborhoods = useCallback(async () => {
    setLoadingNeighborhoods(true);
    setNeighborhoodsError(null);
    try {
      const data = await deliveryZonesApi.getNeighborhoods();
      setNeighborhoods(data.neighborhoods);
      setDistricts(data.districts);
      setSelectedDistrict((prev) => prev || data.districts[0] || '');
    } catch (err: any) {
      console.error('Failed to fetch neighborhoods:', err);
      setNeighborhoodsError(
        err.response?.data?.message || err.message || "Mahallalar ro'yxatini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoadingNeighborhoods(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    setLoadingZones(true);
    setZonesError(null);
    try {
      const data = await deliveryZonesApi.getZones(filialUuid || undefined);
      setZones(data);
    } catch (err: any) {
      console.error('Failed to fetch delivery zones:', err);
      setZonesError(
        err.response?.data?.message || err.message || "Yetkazib berish hududlarini yuklashda xatolik yuz berdi."
      );
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
    if (partnerData?.role === 'manager') return;
    filialApi.getFilials()
      .then((data) => setFilialList(data))
      .catch((err) => console.error('Failed to load filials in DeliveryZonesPage:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedZonesByUuid = useMemo(() => {
    const map = new Map<string, PartnerDeliveryZone>();
    zones.forEach((z) => map.set(z.neighborhood.uuid, z));
    return map;
  }, [zones]);

  const districtFilteredNeighborhoods = useMemo(() => {
    if (!selectedDistrict) return neighborhoods;
    return neighborhoods.filter((n) => n.district === selectedDistrict);
  }, [neighborhoods, selectedDistrict]);

  const checklistFilteredNeighborhoods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return districtFilteredNeighborhoods;
    return districtFilteredNeighborhoods.filter((n) => n.name.toLowerCase().includes(q));
  }, [districtFilteredNeighborhoods, searchQuery]);

  // Saved zones and pending selections stay visible on the map even when the district
  // filter is scoped elsewhere — only the browsable/idle set is limited to the current
  // district (for render performance), never something the partner has already picked.
  const mapNeighborhoods = useMemo(() => {
    const byUuid = new Map<string, Neighborhood>();
    districtFilteredNeighborhoods.forEach((n) => byUuid.set(n.uuid, n));
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
  }, [districtFilteredNeighborhoods, zones, pendingUuids, neighborhoods]);

  const mapCenter = useMemo<[number, number]>(() => {
    const withCenter = districtFilteredNeighborhoods.find((n) => n.center) || neighborhoods.find((n) => n.center);
    return withCenter?.center || TASHKENT_CENTER;
  }, [districtFilteredNeighborhoods, neighborhoods]);

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

  const handleBulkAdd = async () => {
    if (pendingUuids.size === 0) return;
    setBulkSubmitting(true);
    try {
      await deliveryZonesApi.bulkAddZones({
        neighborhood_uuids: Array.from(pendingUuids),
        filial_uuid: filialUuid || null,
        delivery_fee: bulkDeliveryFee.trim() ? bulkDeliveryFee.trim() : null,
        estimated_minutes: bulkEstimatedMinutes.trim() ? Number(bulkEstimatedMinutes) : null,
      });
      toast.success(`${pendingUuids.size} ta hudud qo'shildi.`);
      setPendingUuids(new Set());
      fetchZones();
    } catch (err: any) {
      console.error('Failed to bulk add delivery zones:', err);
      toast.error(err.response?.data?.message || err.message || "Hududlarni qo'shishda xatolik yuz berdi.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleToggleZoneActive = async (zone: PartnerDeliveryZone) => {
    const updated = !zone.is_active;
    setZones((prev) => prev.map((z) => (z.uuid === zone.uuid ? { ...z, is_active: updated } : z)));
    try {
      await deliveryZonesApi.updateZone(zone.uuid, { is_active: updated });
    } catch (err: any) {
      console.error('Failed to toggle zone active state:', err);
      setZones((prev) => prev.map((z) => (z.uuid === zone.uuid ? { ...z, is_active: !updated } : z)));
      toast.error(err.response?.data?.message || "Hudud faolligini o'zgartirishda xatolik.");
    }
  };

  const handleDeleteZone = async (zone: PartnerDeliveryZone) => {
    const ok = await confirm(`Haqiqatan ham "${zone.neighborhood.name}" hududini o'chirmoqchimisiz?`, {
      danger: true,
      confirmText: "O'chirish",
    });
    if (!ok) return;
    try {
      await deliveryZonesApi.deleteZone(zone.uuid);
      fetchZones();
    } catch (err: any) {
      console.error('Failed to delete delivery zone:', err);
      toast.error(err.response?.data?.message || "Hududni o'chirishda xatolik yuz berdi.");
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm(
      "Haqiqatan ham barcha yetkazib berish hududlarini tozalamoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.",
      { danger: true, confirmText: "Barchasini o'chirish" }
    );
    if (!ok) return;
    try {
      await deliveryZonesApi.clearZones();
      setPendingUuids(new Set());
      toast.success('Barcha hududlar tozalandi.');
      fetchZones();
    } catch (err: any) {
      console.error('Failed to clear delivery zones:', err);
      toast.error(err.response?.data?.message || "Hududlarni tozalashda xatolik yuz berdi.");
    }
  };

  if (loadingNeighborhoods) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-4">
        <Loader2 className="w-10 h-10 text-brand animate-spin" />
        <p className="text-slate-400 text-sm font-semibold">Mahallalar ro'yxati yuklanmoqda...</p>
      </div>
    );
  }

  if (neighborhoodsError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
        <h4 className="font-bold text-ink text-base mb-1">Xatolik yuz berdi</h4>
        <p className="text-sm text-slate-400 mb-4">{neighborhoodsError}</p>
        <button
          onClick={fetchNeighborhoods}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Qayta urinish</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-Outfit text-slate-200">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-edge pb-4">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
            Yetkazib berish hududlari <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><MapPin className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Xaritadan yoki ro'yxatdan mahallalarni tanlab, yetkazib berish hududlarini sozlang</p>
        </div>
        <button
          onClick={handleClearAll}
          disabled={zones.length === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-bold text-xs transition duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Eraser className="w-4 h-4" />
          <span>Barchasini tozalash</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        {filialList.length > 0 && (
          <select
            value={filialUuid}
            onChange={(e) => setFilialUuid(e.target.value)}
            className="bg-slate-950/70 border border-edge focus:border-brand/40 text-slate-300 px-4 py-2.5 rounded-xl text-sm focus:outline-none transition cursor-pointer"
          >
            <option value="">Barcha filiallar</option>
            {filialList.map((f) => (
              <option key={f.uuid} value={f.uuid}>
                {f.filial_name} {f.is_main ? '(Asosiy)' : ''}
              </option>
            ))}
          </select>
        )}
        <select
          value={selectedDistrict}
          onChange={(e) => setSelectedDistrict(e.target.value)}
          className="bg-slate-950/70 border border-edge focus:border-brand/40 text-slate-300 px-4 py-2.5 rounded-xl text-sm focus:outline-none transition cursor-pointer"
        >
          <option value="">Barcha tumanlar</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Mahalla nomi bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-edge focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none transition duration-150"
          />
        </div>
      </div>

      {/* Map + checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <NeighborhoodMap
            neighborhoods={mapNeighborhoods}
            savedZonesByUuid={savedZonesByUuid}
            pendingUuids={pendingUuids}
            centerFallback={mapCenter}
            onToggle={handleToggle}
          />
        </div>
        <div className="lg:col-span-5 flex flex-col p-4 rounded-2xl bg-darkCard border border-edge max-h-[560px]">
          <NeighborhoodChecklist
            neighborhoods={checklistFilteredNeighborhoods}
            savedZonesByUuid={savedZonesByUuid}
            pendingUuids={pendingUuids}
            onToggle={handleToggle}
          />
        </div>
      </div>

      {/* Bulk add panel */}
      <div className="sticky bottom-4 z-10 p-4 rounded-2xl bg-darkCard border border-edge-strong shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">
            {pendingUuids.size} ta hudud tanlandi
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Xaritadan yoki ro'yxatdan mahalla tanlab, quyidagi tugma orqali qo'shing</p>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Yetkazish narxi (ixtiyoriy)"
          value={bulkDeliveryFee}
          onChange={(e) => setBulkDeliveryFee(e.target.value)}
          className="w-full sm:w-48 px-4 py-2.5 bg-slate-950 border border-edge focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
        />
        <input
          type="number"
          min="0"
          placeholder="Vaqt, daqiqa (ixtiyoriy)"
          value={bulkEstimatedMinutes}
          onChange={(e) => setBulkEstimatedMinutes(e.target.value)}
          className="w-full sm:w-44 px-4 py-2.5 bg-slate-950 border border-edge focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
        />
        <button
          onClick={handleBulkAdd}
          disabled={pendingUuids.size === 0 || bulkSubmitting}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/20 transition duration-150 disabled:opacity-50 cursor-pointer shrink-0"
        >
          {bulkSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>Tanlanganlarni qo'shish</span>
        </button>
      </div>

      {/* Existing zones table */}
      <div className="p-6 rounded-2xl bg-darkCard border border-edge shadow-xl">
        <h3 className="text-sm font-bold text-ink mb-4">Qo'shilgan hududlar</h3>
        {loadingZones ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
            <p className="text-slate-400 text-xs">Hududlar yuklanmoqda...</p>
          </div>
        ) : zonesError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm text-slate-400 mb-3">{zonesError}</p>
            <button
              onClick={fetchZones}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Qayta urinish</span>
            </button>
          </div>
        ) : zones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
            <HelpCircle className="w-12 h-12 stroke-[1] mb-3 text-slate-600" />
            <h4 className="font-bold text-ink text-sm mb-1">Hozircha hudud qo'shilmagan</h4>
            <p className="text-xs text-slate-400 max-w-sm">Yuqoridagi xarita yoki ro'yxatdan mahalla tanlab, hududlar qo'shishni boshlang.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-edge text-slate-500 text-xs uppercase tracking-wider font-bold">
                  <th className="pb-3.5 pl-2">Mahalla</th>
                  <th className="pb-3.5">Tuman</th>
                  <th className="pb-3.5">Filial</th>
                  <th className="pb-3.5">Narx</th>
                  <th className="pb-3.5">Vaqt</th>
                  <th className="pb-3.5 text-center">Holat</th>
                  <th className="pb-3.5 text-right pr-2">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge text-slate-300">
                {zones.map((zone) => (
                  <tr key={zone.uuid} className={`hover:bg-overlay transition-colors ${!zone.is_active ? 'opacity-55' : ''}`}>
                    <td className="py-3.5 pl-2 font-semibold text-ink">{zone.neighborhood.name}</td>
                    <td className="py-3.5 text-slate-400">{zone.neighborhood.district}</td>
                    <td className="py-3.5 text-slate-400">{zone.filial_name || 'Barcha filiallar'}</td>
                    <td className="py-3.5 text-slate-300">{formatFee(zone.delivery_fee)}</td>
                    <td className="py-3.5 text-slate-300">{formatMinutes(zone.estimated_minutes)}</td>
                    <td className="py-3.5 text-center">
                      <button
                        onClick={() => handleToggleZoneActive(zone)}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${zone.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-700/25 text-slate-500 border-slate-700/30'
                          }`}
                      >
                        {zone.is_active ? 'FAOL' : 'NOFAOL'}
                      </button>
                    </td>
                    <td className="py-3.5 text-right pr-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingZone(zone)}
                          className="p-1.5 rounded-lg bg-overlay border border-edge text-slate-400 hover:text-ink hover:bg-overlay-strong transition cursor-pointer"
                          title="Tahrirlash"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteZone(zone)}
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/10 text-rose-400 hover:text-white hover:bg-rose-500 transition cursor-pointer"
                          title="O'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
