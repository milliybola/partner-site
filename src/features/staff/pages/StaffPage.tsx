import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  UserCheck, 
  UserX, 
  AlertCircle, 
  RefreshCw, 
  Lock, 
  Phone, 
  Shield, 
  User,
  X,
  CheckCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import { staffApi } from '../services/staffApi';
import type { StaffMember } from '../services/staffApi';

const StaffPage: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // User role details
  const [userRole, setUserRole] = useState<'superadmin' | 'manager'>('superadmin');
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'manager' | 'waiter'>('waiter');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Load user role and fetch staff list
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const partnerDataStr = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
      if (partnerDataStr) {
        const partnerData = JSON.parse(partnerDataStr);
        if (partnerData.role === 'manager') {
          setUserRole('manager');
        } else {
          setUserRole('superadmin');
        }
      }
      
      const data = await staffApi.getStaff();
      setStaffList(data);
    } catch (err: any) {
      console.error("Failed to load staff list:", err);
      setError(
        err.response?.data?.message || 
        err.message || 
        "Xodimlar ro'yxatini yuklashda xatolik yuz berdi. Internet aloqasini tekshiring."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Handle phone changes and apply formatting
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('+998')) {
      val = '+998';
    }
    const numbersOnly = val.substring(4).replace(/\D/g, '');
    const truncated = numbersOnly.substring(0, 9);
    
    let formatted = '+998';
    if (truncated.length > 0) {
      formatted += ' (' + truncated.substring(0, 2);
    }
    if (truncated.length > 2) {
      formatted += ') ' + truncated.substring(2, 5);
    }
    if (truncated.length > 5) {
      formatted += '-' + truncated.substring(5, 7);
    }
    if (truncated.length > 7) {
      formatted += '-' + truncated.substring(7, 9);
    }
    
    setPhone(formatted);
  };

  const cleanPhoneNumber = (formattedPhone: string) => {
    return formattedPhone.replace(/[^\d+]/g, '');
  };

  // Open modal for Create
  const handleOpenAddModal = () => {
    setSelectedStaff(null);
    setName('');
    setPhone('+998');
    setPassword('');
    setRole('waiter');
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
    setShowPassword(false);
  };

  // Open modal for Edit
  const handleOpenEditModal = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setName(staff.name);
    
    // Format phone number back to input structure if possible
    let rawPhone = staff.phone.replace(/[^\d]/g, '');
    if (rawPhone.startsWith('998') && rawPhone.length === 12) {
      rawPhone = rawPhone.substring(3);
    }
    let formatted = '+998';
    if (rawPhone.length >= 2) formatted += ` (${rawPhone.substring(0, 2)})`;
    if (rawPhone.length > 2) formatted += ` ${rawPhone.substring(2, 5)}`;
    if (rawPhone.length > 5) formatted += `-${rawPhone.substring(5, 7)}`;
    if (rawPhone.length > 7) formatted += `-${rawPhone.substring(7, 9)}`;
    
    setPhone(formatted);
    setPassword(''); // keep blank unless updating
    setRole(staff.role);
    setIsActive(staff.is_active);
    setFormError(null);
    setModalOpen(true);
    setShowPassword(false);
  };

  // Handle CRUD submit (Create / Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const rawPhone = cleanPhoneNumber(phone);
    if (rawPhone.length !== 13) {
      setFormError("Telefon raqami noto'g'ri. Format: +998 (90) 123-45-67");
      setSubmitting(false);
      return;
    }

    if (!selectedStaff && password.length < 4) {
      setFormError("Yangi xodim uchun parol kamida 4 ta belgidan iborat bo'lishi kerak");
      setSubmitting(false);
      return;
    }

    try {
      if (selectedStaff) {
        // Edit logic
        const payload: any = {
          name,
          phone: rawPhone,
          role,
          is_active: isActive
        };
        if (password.trim().length >= 4) {
          payload.password = password;
        }
        await staffApi.updateStaff(selectedStaff.uuid, payload);
      } else {
        // Create logic
        const payload = {
          name,
          phone: rawPhone,
          password,
          role,
          is_active: isActive
        };
        await staffApi.createStaff(payload);
      }
      
      setModalOpen(false);
      fetchStaff();
    } catch (err: any) {
      console.error("Save staff member failed:", err);
      setFormError(
        err.response?.data?.message || 
        err.response?.data?.detail || 
        "Ma'lumotlarni saqlashda xatolik yuz berdi. Telefon raqami band emasligini tekshiring."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active status directly from row (Superadmin only)
  const handleToggleStatus = async (staff: StaffMember) => {
    if (userRole !== 'superadmin') return;
    try {
      await staffApi.updateStaff(staff.uuid, { is_active: !staff.is_active });
      setStaffList(prev => 
        prev.map(item => item.uuid === staff.uuid ? { ...item, is_active: !item.is_active } : item)
      );
    } catch (err) {
      console.error("Failed to toggle status:", err);
      alert("Xodim holatini o'zgartirib bo'lmadi.");
    }
  };

  // Delete staff member
  const handleDeleteStaff = async (staff: StaffMember) => {
    if (userRole !== 'superadmin') return;
    if (!window.confirm(`Haqiqatan ham "${staff.name}" xodimini o'chirishni xohlaysizmi?`)) return;
    
    try {
      await staffApi.deleteStaff(staff.uuid);
      setStaffList(prev => prev.filter(item => item.uuid !== staff.uuid));
    } catch (err) {
      console.error("Failed to delete staff:", err);
      alert("Xodimni o'chirishda xatolik yuz berdi.");
    }
  };

  const formatUzPhone = (phoneStr: string) => {
    const clean = phoneStr.replace(/\D/g, '');
    if (clean.length === 12) {
      return `+${clean.slice(0, 3)} (${clean.slice(3, 5)}) ${clean.slice(5, 8)}-${clean.slice(8, 10)}-${clean.slice(10, 12)}`;
    }
    return phoneStr;
  };

  return (
    <div className="space-y-8 font-Outfit">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3 text-left">
            Xodimlar <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><Users className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-left text-sm mt-1">Xizmat ko'rsatuvchi xodimlar, menejerlar va ofitsantlarni boshqaring</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={fetchStaff}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition text-slate-300 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Yangilash</span>
          </button>
          
          {userRole === 'superadmin' && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/15 hover:shadow-brand/25 transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Xodim qo'shish</span>
            </button>
          )}
        </div>
      </div>

      {/* Role notice banner for Manager */}
      {userRole === 'manager' && (
        <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm text-left shadow-lg">
          <Shield className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-white">Menejer hisobi</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Menejer sifatida siz faqat ofitsantlar (waiter) ro'yxatini ko'ra olasiz. Xodimlarni yaratish, yangilash yoki o'chirish faqat Restoran Egasi (Superadmin) hisobi orqali amalga oshiriladi.
            </p>
          </div>
        </div>
      )}

      {/* Main List Display */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
          <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
          <h4 className="font-bold text-white text-base mb-1">Xatolik yuz berdi</h4>
          <p className="text-sm max-w-sm mb-4 text-slate-400">{error}</p>
          <button
            onClick={fetchStaff}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Qayta urinish</span>
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-semibold">Xodimlar yuklanmoqda...</p>
        </div>
      ) : staffList.length > 0 ? (
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider font-bold">
                  <th className="pb-3.5 pl-2">Ism</th>
                  <th className="pb-3.5">Telefon raqami</th>
                  <th className="pb-3.5">Roli</th>
                  <th className="pb-3.5 text-center">Holat</th>
                  {userRole === 'superadmin' && <th className="pb-3.5 text-center pr-2">Amallar</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {staffList.map((staff) => (
                  <tr key={staff.uuid} className="hover:bg-white/[0.01] transition-colors">
                    <td className="py-4 pl-2 font-bold text-white flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-400 shrink-0 font-bold text-xs">
                        {staff.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{staff.name}</span>
                    </td>
                    <td className="py-4 font-mono font-medium text-xs text-slate-300">
                      {formatUzPhone(staff.phone)}
                    </td>
                    <td className="py-4 font-semibold">
                      {staff.role === 'manager' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          Menejer
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20">
                          Ofitsant
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(staff)}
                        disabled={userRole !== 'superadmin'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition ${
                          userRole === 'superadmin' ? 'cursor-pointer hover:bg-opacity-80' : 'cursor-default'
                        } ${
                          staff.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {staff.is_active ? (
                          <>
                            <UserCheck className="w-3 h-3" />
                            <span>Faol</span>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3 h-3" />
                            <span>Bloklangan</span>
                          </>
                        )}
                      </button>
                    </td>
                    {userRole === 'superadmin' && (
                      <td className="py-4 text-center pr-2">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleOpenEditModal(staff)}
                            className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:border-white/10 transition cursor-pointer"
                            title="Tahrirlash"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteStaff(staff)}
                            className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition cursor-pointer"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-darkCard/50 border border-dashed border-white/5 rounded-2xl">
          <Users className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600 animate-pulse" />
          <h3 className="font-bold text-white mb-1">Xodimlar mavjud emas</h3>
          <p className="text-xs px-6 text-center max-w-sm">Tizimda hali hech qanday xodim qo'shilmagan.</p>
          {userRole === 'superadmin' && (
            <button
              onClick={handleOpenAddModal}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold transition cursor-pointer border border-brand/10"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Xodim qo'shish</span>
            </button>
          )}
        </div>
      )}

      {/* CRUD Entry Modal Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-md bg-darkCard border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto text-left space-y-5 animate-[slideUp_0.3s_ease-out]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white">
                {selectedStaff ? "Xodimni Tahrirlash" : "Yangi Xodim Yaratish"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2.5 items-start">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                  <span className="leading-normal">{formError}</span>
                </div>
              )}

              {/* Name field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-brand" />
                  <span>Xodim Ismi</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Bobur Karimov"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              {/* Phone field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-brand" />
                  <span>Telefon Raqami (Login uchun)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="+998 (90) 123-45-67"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              {/* Role selection dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-brand" />
                  <span>Roli / Huquqi</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none transition cursor-pointer"
                >
                  <option value="waiter">Ofitsant (Waiter)</option>
                  <option value="manager">Menejer (Manager)</option>
                </select>
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-brand" />
                  <span>Parol {selectedStaff && "(Parolni o'zgartirish uchun yozing, aks holda bo'sh qoldiring)"}</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!selectedStaff}
                    placeholder={selectedStaff ? "••••••••" : "Parolni kiriting"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl pl-4 pr-10 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Active Switch checkbox */}
              <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                <span className="text-xs text-slate-400 font-semibold font-Outfit">
                  Hisob holati (Faol / Bloklangan)
                </span>
                
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isActive ? 'bg-brand shadow-md shadow-brand/20' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Modal footer save button */}
              <div className="flex gap-3 justify-end pt-4 border-t border-white/5 mt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Bekor qilish
                </button>
                
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/10 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Saqlanmoqda...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Saqlash</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffPage;
