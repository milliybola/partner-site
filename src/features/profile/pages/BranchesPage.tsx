import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, 
  Plus, 
  Edit, 
  Trash2, 
  MapPin, 
  Phone, 
  UserCheck, 
  AlertCircle, 
  RefreshCw, 
  X,
  CheckCircle,
  Map,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { staffApi } from '../../staff/services/staffApi';
import type { StaffMember } from '../../staff/services/staffApi';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';

const BranchesPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [branches, setBranches] = useState<PartnerFilial[]>([]);
  const [managers, setManagers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<PartnerFilial | null>(null);
  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [selectedBranchForManager, setSelectedBranchForManager] = useState<PartnerFilial | null>(null);

  // Form States - Filial
  const [filialName, setFilialName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [lat, setLat] = useState('');
  const [long, setLong] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'CLOSED'>('ACTIVE');
  const [isMain, setIsMain] = useState(false);
  const [managerUuid, setManagerUuid] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Opening Hours States
  const [mon, setMon] = useState(true);
  const [tue, setTue] = useState(true);
  const [wed, setWed] = useState(true);
  const [thu, setThu] = useState(true);
  const [fri, setFri] = useState(true);
  const [sat, setSat] = useState(true);
  const [sun, setSun] = useState(true);
  const [fromHour, setFromHour] = useState('08:00:00');
  const [toHour, setToHour] = useState('22:00:00');

  // Form States - Manager Assign
  const [selectedManagerUuid, setSelectedManagerUuid] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Fetch Branches and Managers
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [branchData, staffData] = await Promise.all([
        filialApi.getFilials(),
        staffApi.getStaff()
      ]);
      setBranches(branchData);
      setManagers(staffData.filter(s => s.role === 'manager' && s.is_active));
    } catch (err: any) {
      console.error("Failed to fetch branch data:", err);
      setError(
        err.response?.data?.message || 
        err.message || 
        "Filiallar va menejerlar ro'yxatini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerSuccess = (msg: string) => {
    toast.success(msg);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setSelectedBranch(null);
    setFilialName('');
    setAddress('');
    setPhone('');
    setLat('');
    setLong('');
    setStatus('ACTIVE');
    setIsMain(false);
    setManagerUuid('');
    setMon(true);
    setTue(true);
    setWed(true);
    setThu(true);
    setFri(true);
    setSat(true);
    setSun(true);
    setFromHour('08:00:00');
    setToHour('22:00:00');
    setFormError(null);
    setEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (branch: PartnerFilial) => {
    setSelectedBranch(branch);
    setFilialName(branch.filial_name);
    setAddress(branch.address || '');
    setPhone(branch.phone || '');
    setLat(branch.location_lat?.toString() || '');
    setLong(branch.location_long?.toString() || '');
    setStatus(branch.filial_status);
    setIsMain(!!branch.is_main);
    setManagerUuid(branch.manager_info?.uuid || (branch.manager as any)?.uuid || (typeof branch.manager === 'string' ? branch.manager : ''));
    if (branch.opening_hours) {
      setMon(!!branch.opening_hours.mon);
      setTue(!!branch.opening_hours.tue);
      setWed(!!branch.opening_hours.wed);
      setThu(!!branch.opening_hours.thu);
      setFri(!!branch.opening_hours.fri);
      setSat(!!branch.opening_hours.sat);
      setSun(!!branch.opening_hours.sun);
      setFromHour(branch.opening_hours.from_hour || '08:00:00');
      setToHour(branch.opening_hours.to_hour || '22:00:00');
    } else {
      setMon(true);
      setTue(true);
      setWed(true);
      setThu(true);
      setFri(true);
      setSat(true);
      setSun(true);
      setFromHour('08:00:00');
      setToHour('22:00:00');
    }
    setFormError(null);
    setEditModalOpen(true);
  };

  // Open Assign Manager Modal
  const handleOpenAssignManager = (branch: PartnerFilial) => {
    setSelectedBranchForManager(branch);
    setSelectedManagerUuid(branch.manager_info?.uuid || (typeof branch.manager === 'string' ? branch.manager : (branch.manager as any)?.uuid) || '');
    setFormError(null);
    setManagerModalOpen(true);
  };

  // Handle Branch Form Submit (Create/Update)
  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    if (!filialName.trim()) {
      setFormError("Filial nomi bo'sh bo'lishi mumkin emas");
      setSubmitting(false);
      return;
    }

    const payload: any = {
      filial_name: filialName,
      address: address || undefined,
      phone: phone || undefined,
      location_lat: lat ? parseFloat(lat) : undefined,
      location_long: long ? parseFloat(long) : undefined,
      filial_status: status,
      is_main: isMain,
      manager: managerUuid || null,
      opening_hours: {
        mon,
        tue,
        wed,
        thu,
        fri,
        sat,
        sun,
        from_hour: fromHour,
        to_hour: toHour
      }
    };

    try {
      if (selectedBranch) {
        await filialApi.updateFilial(selectedBranch.uuid, payload);
        triggerSuccess("Filial muvaffaqiyatli tahrirlandi!");
      } else {
        await filialApi.createFilial(payload);
        triggerSuccess("Yangi filial muvaffaqiyatli qo'shildi!");
      }
      setEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error("Failed to save branch:", err);
      setFormError(err.response?.data?.message || err.message || "Filialni saqlashda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Assign Manager Submit
  const handleAssignManagerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchForManager) return;
    
    setFormError(null);
    setAssigning(true);

    if (!selectedManagerUuid) {
      setFormError("Iltimos, menejerni tanlang");
      setAssigning(false);
      return;
    }

    try {
      await filialApi.assignManager(selectedBranchForManager.uuid, selectedManagerUuid);
      triggerSuccess("Menejer filialga muvaffaqiyatli biriktirildi!");
      setManagerModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error("Failed to assign manager:", err);
      setFormError(err.response?.data?.message || err.message || "Menejerni biriktirishda xatolik yuz berdi.");
    } finally {
      setAssigning(false);
    }
  };

  // Handle Branch Delete
  const handleDeleteBranch = async (branch: PartnerFilial) => {
    const ok = await confirm(`Haqiqatan ham "${branch.filial_name}" filialini o'chirib tashlamoqchimisiz?`, { danger: true, confirmText: "O'chirish" });
    if (!ok) return;

    try {
      await filialApi.deleteFilial(branch.uuid);
      triggerSuccess("Filial o'chirildi.");
      fetchData();
    } catch (err: any) {
      console.error("Failed to delete branch:", err);
      toast.error(err.response?.data?.message || err.message || "Filialni o'chirishda xatolik yuz berdi.");
    }
  };

  // Format phone number
  const formatUzPhone = (numStr?: string) => {
    if (!numStr) return "Kiritilmagan";
    if (numStr.length === 13 && numStr.startsWith('+998')) {
      return `+998 (${numStr.substring(4, 6)}) ${numStr.substring(6, 9)}-${numStr.substring(9, 11)}-${numStr.substring(11, 13)}`;
    }
    return numStr;
  };

  return (
    <div className="space-y-8 font-Outfit text-left animate-fade-in pb-20">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-edge pb-4">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
            Filiallar Boshqaruvi 
            <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><Building2 className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Loyiha tarkibidagi barcha filiallar (filial manzili, telefoni, bosh menejeri va ish holati)</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg shadow-brand/10 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Yangi filial qo'shish</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-semibold">Filiallar yuklanmoqda...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
          <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
          <h4 className="font-bold text-ink text-base mb-1">Xatolik yuz berdi</h4>
          <p className="text-sm max-w-sm mb-4 text-slate-400">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Qayta urinish</span>
          </button>
        </div>
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-darkCard/50 border border-dashed border-edge rounded-2xl">
          <Building2 className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
          <h3 className="font-bold text-ink mb-1">Filiallar mavjud emas</h3>
          <p className="text-xs px-6 text-center max-w-sm">Hali hech qanday filial qo'shilmagan. Yuqoridagi tugma orqali birinchi filialni qo'shishingiz mumkin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map(branch => {
            const isMainBranch = !!branch.is_main;
            const statusLabel = branch.filial_status === 'ACTIVE' 
              ? 'Faol' 
              : branch.filial_status === 'INACTIVE' 
                ? 'Faol emas' 
                : 'Yopiq';
            const statusColor = branch.filial_status === 'ACTIVE'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : branch.filial_status === 'INACTIVE'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20';

            return (
              <div 
                key={branch.uuid}
                className="bg-gradient-to-br from-darkCard to-slate-900/90 border border-edge hover:border-edge-strong rounded-2xl shadow-xl p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group hover:scale-[1.01]"
              >
                {/* Visual side-marker for main filial */}
                <div className={`absolute top-0 left-0 w-1 h-full ${isMainBranch ? 'bg-brand' : 'bg-overlay'}`}></div>
                
                <div className="space-y-4">
                  {/* Top line with title and status */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-left space-y-1">
                      <h3 className="font-bold text-ink text-lg group-hover:text-brand transition duration-200 truncate pr-2 max-w-[200px]">
                        {branch.filial_name}
                      </h3>
                      {isMainBranch && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 border border-brand/20 rounded-md uppercase tracking-wider">
                          <CheckCircle className="w-3 h-3" /> Asosiy filial
                        </span>
                      )}
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shrink-0 ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-2.5 text-xs text-slate-400 border-t border-edge pt-3.5">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      <span>{branch.address || "Manzil kiritilmagan"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>{formatUzPhone(branch.phone)}</span>
                    </div>
                    
                    {/* Location coordinates */}
                    {(branch.location_lat && branch.location_long) ? (
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${branch.location_lat},${branch.location_long}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-brand hover:text-brand-dark transition duration-200 w-fit"
                      >
                        <Map className="w-4 h-4 shrink-0" />
                        <span className="font-semibold underline">Xaritadan ko'rish</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Map className="w-4 h-4 shrink-0" />
                        <span>Koordinatalar yo'q</span>
                      </div>
                    )}
                  </div>

                  {/* Manager details */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-edge text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Bosh menejer:</span>
                      {(branch.manager_info || branch.manager) ? (
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          {branch.manager_info?.name || (branch.manager as any)?.name || 'Menejer'}
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-500 italic">Menejer yo'q</span>
                      )}
                    </div>
                  </div>

                  {/* Opening hours info */}
                  {branch.opening_hours ? (
                    <div className="flex items-start gap-2 pt-1 border-t border-edge mt-1 text-xs text-slate-400">
                      <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-ink">
                          Ish vaqti: {branch.opening_hours.from_hour.substring(0, 5)} - {branch.opening_hours.to_hour.substring(0, 5)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Kunlar: {[
                            branch.opening_hours.mon && 'Dush',
                            branch.opening_hours.tue && 'Sesh',
                            branch.opening_hours.wed && 'Chor',
                            branch.opening_hours.thu && 'Pay',
                            branch.opening_hours.fri && 'Jum',
                            branch.opening_hours.sat && 'Shan',
                            branch.opening_hours.sun && 'Yak'
                          ].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-600 pt-1 text-xs border-t border-edge mt-1">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>Ish vaqti kiritilmagan</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-5 border-t border-edge pt-4">
                  <button
                    onClick={() => handleOpenEdit(branch)}
                    className="flex-1 py-2 rounded-xl bg-overlay hover:bg-overlay-strong border border-edge-strong hover:border-edge-strong text-slate-300 font-bold text-[11px] transition flex justify-center items-center gap-1.5 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Tahrirlash</span>
                  </button>

                  <button
                    onClick={() => handleOpenAssignManager(branch)}
                    className="flex-1 py-2 rounded-xl bg-brand/10 hover:bg-brand/20 border border-brand/20 text-brand font-bold text-[11px] transition flex justify-center items-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Menejer</span>
                  </button>

                  <button
                    onClick={() => handleDeleteBranch(branch)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition flex justify-center items-center cursor-pointer"
                    title="O'chirish"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CRUD Add/Edit Branch Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-md bg-darkCard border border-edge-strong rounded-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto text-left space-y-5 animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <h3 className="font-bold text-lg text-ink">
                {selectedBranch ? "Filialni Tahrirlash" : "Yangi Filial Qo'shish"}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1.5 rounded-lg bg-overlay text-slate-400 hover:text-ink transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleBranchSubmit} className="space-y-4">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2.5 items-start">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                  <span className="leading-normal">{formError}</span>
                </div>
              )}

              {/* Filial Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Filial nomi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Milliy Chilonzor"
                  value={filialName}
                  onChange={(e) => setFilialName(e.target.value)}
                  className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                />
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Manzili</label>
                <input
                  type="text"
                  placeholder="Masalan: Chilonzor 6-daha, 12-uy"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Telefon raqami</label>
                <input
                  type="text"
                  placeholder="Masalan: +998901234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                />
              </div>

              {/* Location Lat/Long */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Kenglik (Latitude)</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="41.2995"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Uzunlik (Longitude)</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="69.2401"
                    value={long}
                    onChange={(e) => setLong(e.target.value)}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Ish holati</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition cursor-pointer"
                >
                  <option value="ACTIVE">Faol (Ochiq)</option>
                  <option value="INACTIVE">Faol emas (Vaqtinchalik)</option>
                  <option value="CLOSED">Butunlay yopilgan</option>
                </select>
              </div>

              {/* Manager select */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Bosh menejer</label>
                <select
                  value={managerUuid}
                  onChange={(e) => setManagerUuid(e.target.value)}
                  className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition cursor-pointer"
                >
                  <option value="">-- Menejersiz --</option>
                  {managers.map(mgr => (
                    <option key={mgr.uuid} value={mgr.uuid}>
                      {mgr.name} ({mgr.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Working Hours */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Ish boshlanishi</label>
                  <input
                    type="text"
                    placeholder="08:00:00"
                    value={fromHour}
                    onChange={(e) => setFromHour(e.target.value)}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Ish tugashi</label>
                  <input
                    type="text"
                    placeholder="22:00:00"
                    value={toHour}
                    onChange={(e) => setToHour(e.target.value)}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Weekdays checkboxes */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Ish kunlari</label>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={mon} onChange={(e) => setMon(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Dush</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={tue} onChange={(e) => setTue(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Sesh</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={wed} onChange={(e) => setWed(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Chor</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={thu} onChange={(e) => setThu(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Pay</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={fri} onChange={(e) => setFri(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Jum</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={sat} onChange={(e) => setSat(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Shan</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-edge text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={sun} onChange={(e) => setSun(e.target.checked)} className="rounded text-brand bg-slate-900 border-edge-strong" />
                    <span>Yak</span>
                  </label>
                </div>
              </div>

              {/* Is Main */}
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-900/60 border border-edge">
                <input
                  type="checkbox"
                  id="isMainCheckbox"
                  checked={isMain}
                  onChange={(e) => setIsMain(e.target.checked)}
                  className="w-4 h-4 rounded text-brand focus:ring-brand bg-slate-900 border-edge-strong cursor-pointer"
                />
                <label htmlFor="isMainCheckbox" className="text-xs font-bold text-slate-300 cursor-pointer select-none">
                  Ushbu filialni brendning asosiy filiali deb belgilash
                </label>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2.5 border-t border-edge pt-4">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-overlay hover:bg-overlay-strong text-slate-400 hover:text-ink transition text-xs font-bold cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-slate-950 font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Manager Modal */}
      {managerModalOpen && selectedBranchForManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-md bg-darkCard border border-edge-strong rounded-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto text-left space-y-5 animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <h3 className="font-bold text-lg text-ink">
                Menejerni Biriktirish
              </h3>
              <button
                onClick={() => setManagerModalOpen(false)}
                className="p-1.5 rounded-lg bg-overlay text-slate-400 hover:text-ink transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-edge text-xs text-slate-400 leading-relaxed">
              Filial nomi: <span className="font-bold text-ink">{selectedBranchForManager.filial_name}</span>
            </div>

            {/* Form */}
            <form onSubmit={handleAssignManagerSubmit} className="space-y-4">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2.5 items-start">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                  <span className="leading-normal">{formError}</span>
                </div>
              )}

              {/* Manager Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Menejerni tanlang</label>
                {managers.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-400 text-xs flex gap-2.5 items-center">
                    <ShieldAlert className="w-4.5 h-4.5 shrink-0" />
                    <span>Tizimda faol menejerlar topilmadi. Avval xodimlar bo'limida yangi menejer qo'shing.</span>
                  </div>
                ) : (
                  <select
                    value={selectedManagerUuid}
                    onChange={(e) => setSelectedManagerUuid(e.target.value)}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink focus:outline-none transition cursor-pointer"
                  >
                    <option value="">-- Menejerni tanlang --</option>
                    {managers.map(mgr => (
                      <option key={mgr.uuid} value={mgr.uuid}>
                        {mgr.name} ({formatUzPhone(mgr.phone)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2.5 border-t border-edge pt-4">
                <button
                  type="button"
                  onClick={() => setManagerModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-overlay hover:bg-overlay-strong text-slate-400 hover:text-ink transition text-xs font-bold cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={assigning || managers.length === 0}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-slate-950 font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {assigning && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Menejerni Biriktirish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesPage;
