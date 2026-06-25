import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  TrendingUp,
  ShoppingBag,
  Coins,
  CreditCard,
  Truck,
  Building,
  User,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  DollarSign,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  LogOut,
  Calendar,
  Layers,
  HelpCircle,
  Download
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import { shiftApi } from '../services/shiftApi';
import type { Shift } from '../services/shiftApi';

const ShiftPage: React.FC = () => {
  const navigate = useNavigate();

  // User role details
  const [userRole, setUserRole] = useState<'superadmin' | 'manager'>('superadmin');
  
  // Shift state
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [historyShifts, setHistoryShifts] = useState<Shift[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [historyPeriod, setHistoryPeriod] = useState<'day' | 'week' | 'month' | 'all'>('day');
  
  // Loading & error states
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorCurrent, setErrorCurrent] = useState<string | null>(null);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);

  // Close shift modal and form states
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closingBalance, setClosingBalance] = useState<string>('');
  const [submittingClose, setSubmittingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  
  // Post-close success modal state
  const [closedShiftResult, setClosedShiftResult] = useState<Shift | null>(null);
  const [requiresLogout, setRequiresLogout] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Open shift form states
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [submittingOpen, setSubmittingOpen] = useState(false);
  const [openShiftError, setOpenShiftError] = useState<string | null>(null);

  // Export Excel loading state
  const [exportingExcel, setExportingExcel] = useState(false);

  // Handle Excel export
  const handleExportExcel = async (period: 'day' | 'week' | 'month' | 'all') => {
    setExportingExcel(true);
    try {
      const blob = await shiftApi.exportShiftsExcel(period);
      const isCsv = blob.type === 'text/csv';
      const fileName = `Smenalar_Hisoboti_${period}_${new Date().toISOString().slice(0, 10)}.${isCsv ? 'csv' : 'xlsx'}`;
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to export Excel:", err);
      alert("Excel hisobotini yuklab olishda xatolik yuz berdi.");
    } finally {
      setExportingExcel(false);
    }
  };

  // Fetch current shift
  const fetchCurrentShift = useCallback(async () => {
    setLoadingCurrent(true);
    setErrorCurrent(null);
    try {
      const shift = await shiftApi.getCurrentShift();
      setCurrentShift(shift);
    } catch (err: any) {
      console.error("Failed to load current shift:", err);
      setErrorCurrent(
        err.response?.data?.message || 
        err.message || 
        "Joriy smena ma'lumotlarini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoadingCurrent(false);
    }
  }, []);

  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpenShiftError(null);
    setSubmittingOpen(true);

    const balanceNum = Number(openingBalance.replace(/[^\d]/g, ''));
    if (isNaN(balanceNum) || balanceNum < 0) {
      setOpenShiftError("Iltimos, boshlang'ich kassa balansini to'g'ri musbat son ko'rinishida kiriting.");
      setSubmittingOpen(false);
      return;
    }

    try {
      await shiftApi.openShift(balanceNum);
      fetchCurrentShift();
    } catch (err: any) {
      console.error("Failed to open shift:", err);
      setOpenShiftError(
        err.response?.data?.message || 
        err.response?.data?.detail ||
        "Smenani ochishda xatolik yuz berdi. Iltimos qayta urinib ko'ring."
      );
    } finally {
      setSubmittingOpen(false);
    }
  };

  // Fetch shifts history
  const fetchShiftsHistory = useCallback(async (period: 'day' | 'week' | 'month' | 'all') => {
    setLoadingHistory(true);
    setErrorHistory(null);
    try {
      const data = await shiftApi.getShifts(period);
      setHistoryShifts(data);
    } catch (err: any) {
      console.error("Failed to load shifts history:", err);
      setErrorHistory(
        err.response?.data?.message || 
        err.response?.data?.detail ||
        err.message || 
        "Smenalar tarixini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Load user role and initial details
  useEffect(() => {
    const partnerDataStr = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (partnerDataStr) {
      const partnerData = JSON.parse(partnerDataStr);
      if (partnerData.role === 'manager') {
        setUserRole('manager');
        setActiveTab('active'); // managers only care about active shift dashboard
      } else {
        setUserRole('superadmin');
      }
    }
    fetchCurrentShift();
  }, [fetchCurrentShift]);

  // Fetch history when tab changes to history or period changes
  useEffect(() => {
    if (activeTab === 'history' && userRole === 'superadmin') {
      fetchShiftsHistory(historyPeriod);
    }
  }, [activeTab, historyPeriod, userRole, fetchShiftsHistory]);

  // Handle final logout secure execution
  const handleFinalLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.PARTNER_DATA);
    navigate('/login', { replace: true });
  };

  // Timer countdown for logout page
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      handleFinalLogout();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Handle shift closing submit
  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloseError(null);
    setSubmittingClose(true);

    const balanceNum = Number(closingBalance.replace(/[^\d]/g, ''));
    if (isNaN(balanceNum) || balanceNum < 0) {
      setCloseError("Iltimos, kassa balansini to'g'ri musbat son ko'rinishida kiriting.");
      setSubmittingClose(false);
      return;
    }

    try {
      const response = await shiftApi.closeShift(balanceNum);
      if (response.success) {
        setClosedShiftResult(response.data);
        setRequiresLogout(response.requires_logout);
        setIsCloseModalOpen(false);
        
        if (response.requires_logout) {
          // Start 8 seconds countdown for forced logout
          setCountdown(8);
        } else {
          // Egasiga: Refresh shift details instead of logging out
          fetchCurrentShift();
        }
      }
    } catch (err: any) {
      console.error("Failed to close shift:", err);
      setCloseError(
        err.response?.data?.message || 
        err.response?.data?.detail ||
        "Smenani yopishda xatolik yuz berdi. Iltimos qayta urinib ko'ring."
      );
    } finally {
      setSubmittingClose(false);
    }
  };

  const formatUzS = (amount: number | string | null | undefined) => {
    const num = Number(amount);
    if (isNaN(num)) {
      return "0 UZS";
    }
    return num.toLocaleString('uz-UZ') + " UZS";
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    
    let date = new Date(dateStr);
    
    // Check if standard parsing failed and attempt parsing DD-MM-YYYY HH:mm:ss format
    if (isNaN(date.getTime())) {
      const regex = /^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/;
      const match = dateStr.trim().match(regex);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // months are 0-indexed
        const year = parseInt(match[3], 10);
        const hour = match[4] ? parseInt(match[4], 10) : 0;
        const minute = match[5] ? parseInt(match[5], 10) : 0;
        const second = match[6] ? parseInt(match[6], 10) : 0;
        date = new Date(year, month, day, hour, minute, second);
      }
    }

    if (isNaN(date.getTime())) {
      return dateStr; // fallback to raw string
    }

    return date.toLocaleString('uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const calculateDifference = (shift: Shift) => {
    const actual = Number(shift.closing_balance) || 0;
    const expected = Number(shift.expected_closing_balance) || 0;
    return actual - expected;
  };

  return (
    <div className="space-y-8 font-Outfit">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3 text-left">
            Smena Boshqaruvi <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><Clock className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-left text-sm mt-1">POS tizimi kassa smenalari, statistika va hisobotlar</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              fetchCurrentShift();
              if (activeTab === 'history') fetchShiftsHistory(historyPeriod);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition text-slate-300 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Yangilash</span>
          </button>
        </div>
      </div>

      {/* Tabs - Only for Superadmin */}
      {userRole === 'superadmin' && (
        <div className="flex bg-slate-950/60 p-1 rounded-xl border border-white/5 max-w-md">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
              activeTab === 'active'
                ? 'bg-brand text-white shadow-lg shadow-brand/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Joriy faol smena
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-brand text-white shadow-lg shadow-brand/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Smenalar tarixi
          </button>
        </div>
      )}

      {/* ACTIVE SHIFT TAB CONTENT */}
      {activeTab === 'active' && (
        <div className="space-y-6">
          {loadingCurrent ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-semibold">Smena holati tekshirilmoqda...</p>
            </div>
          ) : errorCurrent ? (
            <div className="flex flex-col items-center justify-center py-20 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
              <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
              <h4 className="font-bold text-white text-base mb-1">Xatolik yuz berdi</h4>
              <p className="text-sm max-w-sm mb-4 text-slate-400">{errorCurrent}</p>
              <button
                onClick={fetchCurrentShift}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Qayta urinish</span>
              </button>
            </div>
          ) : currentShift ? (
            <div className="space-y-6">
              {/* Smena Header Details Card */}
              <div className="p-6 rounded-2xl bg-darkCard border border-white/5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
                <div className="flex items-start gap-4">
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white">Smena #{currentShift.id}</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
                        Faol Ochiq
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-brand" /> Ochgan xodim: <strong className="text-white font-medium">{currentShift.opened_by_name}</strong></span>
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-brand" /> Ochilgan vaqt: <strong className="text-white font-medium">{formatDate(currentShift.opened_at)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setClosingBalance('');
                      setCloseError(null);
                      setIsCloseModalOpen(true);
                    }}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-bold text-sm shadow-lg shadow-red-500/10 hover:shadow-red-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Smenani Yopish</span>
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Expected cash balance */}
                <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-brand/20 transition-all duration-300 text-left">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-brand/5 rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-4">
                    <span className="p-3 rounded-xl bg-brand/10 text-brand"><Coins className="w-5 h-5" /></span>
                    <span className="text-[10px] text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-md font-bold uppercase">Kassa qoldig'i</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">Kutilayotgan yakuniy balans</p>
                  <h3 className="text-2xl font-bold text-white mt-1 truncate">{formatUzS(currentShift.expected_closing_balance)}</h3>
                </div>

                {/* Total Orders Count */}
                <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-violet-500/20 transition-all duration-300 text-left">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-4">
                    <span className="p-3 rounded-xl bg-violet-500/10 text-violet-400"><ShoppingBag className="w-5 h-5" /></span>
                    <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-md font-bold uppercase">Buyurtmalar</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">Smena buyurtmalari soni</p>
                  <h3 className="text-2xl font-bold text-white mt-1">{currentShift.total_orders_count} ta</h3>
                </div>

                {/* Total revenue */}
                <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300 text-left">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-4">
                    <span className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400"><TrendingUp className="w-5 h-5" /></span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold uppercase">Umumiy Tushum</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">Jami tushum summasi</p>
                  <h3 className="text-2xl font-bold text-white mt-1 truncate">{formatUzS(currentShift.total_revenue)}</h3>
                </div>
              </div>

              {/* Details and breakdown breakdown panels */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
                {/* Tushum turlari bo'yicha (Cash vs Card) */}
                <div className="p-6 rounded-2xl bg-darkCard border border-white/5 space-y-5">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Coins className="w-5 h-5 text-brand" />
                    <h3 className="font-bold text-white text-base">To'lov turlari bo'yicha</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="text-xs font-medium text-slate-300">Naqd pul tushumi (Cash)</span>
                      </div>
                      <span className="font-bold text-white text-sm">{formatUzS(currentShift.cash_revenue)}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                        <span className="text-xs font-medium text-slate-300">Plastik karta tushumi (Card)</span>
                      </div>
                      <span className="font-bold text-white text-sm">{formatUzS(currentShift.card_revenue)}</span>
                    </div>
                    
                    <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs font-bold text-slate-400">
                      <span>Boshlang'ich kassa qoldig'i:</span>
                      <span className="text-white">{formatUzS(currentShift.opening_balance)}</span>
                    </div>
                  </div>
                </div>

                {/* Xizmat turlari bo'yicha (Delivery, Dine-in, Pickup) */}
                <div className="p-6 rounded-2xl bg-darkCard border border-white/5 space-y-5">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Layers className="w-5 h-5 text-brand" />
                    <h3 className="font-bold text-white text-base">Xizmat turlari bo'yicha</h3>
                  </div>

                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center text-xs pb-2 border-b border-white/5 text-slate-400">
                      <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-violet-400" /> Yetkazib berish (Delivery)</span>
                      <span className="font-bold text-white">{formatUzS(currentShift.delivery_revenue)}</span>
                    </div>

                    <div className="flex justify-between items-center text-xs pb-2 border-b border-white/5 text-slate-400">
                      <span className="flex items-center gap-1.5"><Building className="w-4 h-4 text-amber-400" /> Zalda tanovul qilish (Dine-in)</span>
                      <span className="font-bold text-white">{formatUzS(currentShift.dine_in_revenue)}</span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-cyan-400" /> Olib ketish (Pickup)</span>
                      <span className="font-bold text-white">{formatUzS(currentShift.pickup_revenue)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* No active shift - Show Open Shift card */
            <div className="max-w-md mx-auto p-8 rounded-2xl bg-darkCard border border-white/5 shadow-2xl relative overflow-hidden group hover:border-brand/20 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand/5 rounded-bl-full pointer-events-none" />
              
              <div className="text-center space-y-3 mb-6">
                <div className="w-14 h-14 bg-brand/10 border border-brand/20 text-brand rounded-full flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-white">Yangi Smena Ochish</h3>
                <p className="text-xs text-slate-400">POS tizimida savdoni boshlash uchun kassa smenasini ochishingiz lozim.</p>
              </div>

              <form onSubmit={handleOpenShiftSubmit} className="space-y-4 text-left">
                {openShiftError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 animate-pulse" />
                    <span>{openShiftError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-brand" />
                    <span>Boshlang'ich Kassa Qoldig'i</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="0"
                      value={openingBalance}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val) {
                          setOpeningBalance(Number(val).toLocaleString('uz-UZ'));
                        } else {
                          setOpeningBalance('0');
                        }
                      }}
                      className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl pl-4 pr-16 py-3 text-sm font-bold text-white placeholder-slate-500 focus:outline-none transition"
                      disabled={submittingOpen}
                    />
                    <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                      UZS
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                    Kassadagi boshlang'ich naqd pul miqdori (odatda 0 yoki qaytim pullar).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submittingOpen}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-sm shadow-lg hover:shadow-brand/20 transition duration-150 cursor-pointer disabled:opacity-50 mt-6"
                >
                  {submittingOpen ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Smena ochilmoqda...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Smenani ochish</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB CONTENT (Superadmin/Owner only) */}
      {activeTab === 'history' && userRole === 'superadmin' && (
        <div className="space-y-6 text-left">
          {/* Period Filter Buttons and Export Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2.5">
              {(['day', 'week', 'month', 'all'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setHistoryPeriod(period)}
                  className={`px-4.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    historyPeriod === period
                      ? 'bg-brand text-white border-brand shadow-lg shadow-brand/10'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {period === 'day' && 'Bugungi'}
                  {period === 'week' && 'Shu haftalik'}
                  {period === 'month' && 'Shu oylik'}
                  {period === 'all' && 'Barchasi'}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleExportExcel(historyPeriod)}
              disabled={exportingExcel}
              className="flex items-center justify-center gap-2 px-4.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 transition duration-150 cursor-pointer disabled:opacity-50"
            >
              {exportingExcel ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Yuklanmoqda...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel yuklab olish</span>
                </>
              )}
            </button>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-semibold">Smenalar tarixi yuklanmoqda...</p>
            </div>
          ) : errorHistory ? (
            <div className="flex flex-col items-center justify-center py-20 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
              <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
              <h4 className="font-bold text-white text-base mb-1">Yuklashda xatolik</h4>
              <p className="text-sm max-w-sm mb-4 text-slate-400">{errorHistory}</p>
              <button
                onClick={() => fetchShiftsHistory(historyPeriod)}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Qayta urinish</span>
              </button>
            </div>
          ) : historyShifts.length > 0 ? (
            <div className="p-6 rounded-2xl bg-darkCard border border-white/5 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider font-bold">
                      <th className="pb-3.5 pl-2">Smena ID</th>
                      <th className="pb-3.5">Ochilgan / Yopilgan vaqt</th>
                      <th className="pb-3.5">Kim ochdi / yopdi</th>
                      <th className="pb-3.5">Buyurtma soni</th>
                      <th className="pb-3.5 text-right">Kassa (Haqiqiy / Kutilgan)</th>
                      <th className="pb-3.5 text-right">Farq (Over/Short)</th>
                      <th className="pb-3.5 text-right pr-2">Jami tushum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {historyShifts.map((shift) => {
                      const diff = calculateDifference(shift);
                      return (
                        <tr key={shift.uuid} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-4 pl-2 font-bold text-white">
                            #{shift.id}
                          </td>
                          <td className="py-4 text-xs font-semibold leading-relaxed">
                            <div>{formatDate(shift.opened_at)}</div>
                            <div className="text-slate-500 text-[10px] mt-0.5">
                              {shift.closed_at ? formatDate(shift.closed_at) : (
                                <span className="text-emerald-400 animate-pulse">Hali ochiq</span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 text-xs font-semibold">
                            <div>{shift.opened_by_name}</div>
                            <div className="text-slate-500 text-[10px] mt-0.5">{shift.closed_by_name || '-'}</div>
                          </td>
                          <td className="py-4 font-bold text-xs text-center md:text-left">
                            {shift.total_orders_count} ta
                          </td>
                          <td className="py-4 text-right font-mono text-xs">
                            <div className="font-bold text-white">
                              {shift.closed_at ? formatUzS(shift.closing_balance) : "-"}
                            </div>
                            <div className="text-slate-500 text-[10px] mt-0.5">
                              Kutilgan: {formatUzS(shift.expected_closing_balance)}
                            </div>
                          </td>
                          <td className="py-4 text-right font-mono font-bold text-xs">
                            {!shift.closed_at ? (
                              <span className="text-slate-500">-</span>
                            ) : diff < 0 ? (
                              <span className="text-rose-400 bg-rose-500/10 border border-rose-500/10 px-2 py-0.5 rounded-lg">
                                {formatUzS(diff)}
                              </span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/10 px-2 py-0.5 rounded-lg">
                                +{formatUzS(diff)}
                              </span>
                            ) : (
                              <span className="text-slate-400 bg-white/5 border border-white/5 px-2 py-0.5 rounded-lg">
                                Balans
                              </span>
                            )}
                          </td>
                          <td className="py-4 text-right font-bold text-emerald-400 pr-2 font-mono text-xs">
                            {formatUzS(shift.total_revenue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-darkCard/50 border border-dashed border-white/5 rounded-2xl">
              <Calendar className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
              <h3 className="font-bold text-white mb-1">Hisobotlar mavjud emas</h3>
              <p className="text-xs px-6 text-center max-w-sm">Tanlangan davr bo'yicha yopilgan smenalar tarixi topilmadi.</p>
            </div>
          )}
        </div>
      )}

      {/* CONFIRM / CLOSE SHIFT MODAL DIALOG */}
      {isCloseModalOpen && currentShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-md bg-darkCard border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col text-left space-y-5 animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-500 animate-pulse" /> Smenani Yopish
              </h3>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
                disabled={submittingClose}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning description */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs leading-relaxed font-semibold">
              Smenani yopishni tasdiqlaysizmi? {userRole === 'manager' && "Smena yopilgandan so'ng dasturdan avtomatik chiqiladi."}
            </div>

            {/* Form */}
            <form onSubmit={handleCloseShiftSubmit} className="space-y-4">
              {closeError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{closeError}</span>
                </div>
              )}

              {/* Input for final balance */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-brand" />
                  <span>Kassadagi Yakuniy Summa (Naqd pul qoldig'i)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Masalan: 450,000"
                    value={closingBalance}
                    onChange={(e) => {
                      // Allow numbers only
                      const val = e.target.value.replace(/\D/g, '');
                      // Format visually
                      if (val) {
                        setClosingBalance(Number(val).toLocaleString('uz-UZ'));
                      } else {
                        setClosingBalance('');
                      }
                    }}
                    className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl pl-4 pr-16 py-3 text-sm font-bold text-white placeholder-slate-500 focus:outline-none transition"
                    disabled={submittingClose}
                  />
                  <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                    UZS
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 flex justify-between font-semibold">
                  <span>Kassa kutilayotgan yakuniy qoldig'i:</span>
                  <span className="text-slate-300">{formatUzS(currentShift.expected_closing_balance)}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-3 border-t border-white/5 mt-4">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                  disabled={submittingClose}
                >
                  Bekor qilish
                </button>
                
                <button
                  type="submit"
                  disabled={submittingClose}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-500/10 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingClose ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Yopilmoqda...</span>
                    </>
                  ) : (
                    <>
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Smenani yopish</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST-CLOSE SUCCESS RESULT MODAL (Over/Short summary) */}
      {closedShiftResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-lg bg-darkCard border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col text-left space-y-5 animate-[slideUp_0.3s_ease-out]">
            {/* Logo and title */}
            <div className="text-center space-y-2 border-b border-white/5 pb-4">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 text-xl font-bold">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Smena Muvaffaqiyatli Yopildi</h2>
              <p className="text-xs text-slate-400">Smena #{closedShiftResult.id} yakuniy hisoboti va kassa taftishi</p>
            </div>

            {/* Over/Short calculation report */}
            {(() => {
              const diff = calculateDifference(closedShiftResult);
              return (
                <div className="space-y-4">
                  {/* Visual warning boxes based on over/short */}
                  {diff < 0 ? (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-3 items-start">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
                      <div className="space-y-1">
                        <strong className="font-bold text-white text-sm block">Kassada Kamomad (Shortage)</strong>
                        <p className="leading-relaxed text-slate-400 font-semibold">
                          Kiritilgan yakuniy kassa balansi kutilgan balansdan kam. Kamomad miqdori: <strong className="text-rose-400 font-bold">{formatUzS(Math.abs(diff))}</strong>. Iltimos, buni tekshirib chiqing.
                        </p>
                      </div>
                    </div>
                  ) : diff > 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex gap-3 items-start">
                      <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <strong className="font-bold text-white text-sm block">Kassada Ortiqcha (Surplus)</strong>
                        <p className="leading-relaxed text-slate-400 font-semibold">
                          Kiritilgan yakuniy kassa balansi kutilgan balansdan ko'proq. Ortiqcha summa miqdori: <strong className="text-emerald-400 font-bold">+{formatUzS(diff)}</strong>.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs flex gap-3 items-start">
                      <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                      <div className="space-y-1">
                        <strong className="font-bold text-white text-sm block">Kassa Balansi To'g'ri (Balanced)</strong>
                        <p className="leading-relaxed text-slate-400 font-semibold">
                          Kassa balansi 100% to'g'ri chiqdi. Kutilgan kassa va haqiqiy kiritilgan summa teng: <strong className="text-emerald-400 font-bold">{formatUzS(closedShiftResult.expected_closing_balance)}</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stat breakdown list */}
                  <div className="p-4.5 rounded-xl bg-slate-900 border border-white/5 space-y-3.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-slate-400 font-semibold">Smenani yopgan xodim:</span>
                      <span className="font-bold text-white">{closedShiftResult.closed_by_name || closedShiftResult.opened_by_name}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-slate-400 font-semibold">Yopilgan vaqt:</span>
                      <span className="font-bold text-white">{formatDate(closedShiftResult.closed_at)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-slate-400 font-semibold">Boshlang'ich kassa qoldig'i:</span>
                      <span className="font-bold text-white">{formatUzS(closedShiftResult.opening_balance)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-slate-400 font-semibold">Kutilgan yakuniy qoldiq:</span>
                      <span className="font-bold text-white">{formatUzS(closedShiftResult.expected_closing_balance)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-slate-400 font-semibold">Kiritilgan haqiqiy qoldiq:</span>
                      <span className="font-bold text-white">{formatUzS(closedShiftResult.closing_balance)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-400 font-semibold">Jami buyurtmalar tushumi:</span>
                      <span className="font-bold text-emerald-400">{formatUzS(closedShiftResult.total_revenue)} ({closedShiftResult.total_orders_count} ta buyurtma)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Logout notification and control button */}
            <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              {requiresLogout && countdown !== null ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>Tizimdan avtomatik chiqish: <strong className="text-sm font-bold text-white">{countdown} s</strong></span>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Egasi hisobi bo'lganligi sababli tizimda qolasiz.
                </div>
              )}

              <button
                onClick={() => {
                  if (requiresLogout) {
                    handleFinalLogout();
                  } else {
                    setClosedShiftResult(null);
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] ${
                  requiresLogout 
                    ? 'bg-brand hover:bg-brand-dark text-white' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5'
                }`}
              >
                {requiresLogout ? (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>Tizimdan chiqish</span>
                  </>
                ) : (
                  <span>Oynani yopish</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const X: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default ShiftPage;
