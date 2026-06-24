import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  CheckCircle, 
  XCircle, 
  DollarSign, 
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../core/api/client';
import { ENDPOINTS, STORAGE_KEYS } from '../../../core/config/constants';

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface DashboardStats {
  partner: {
    name: string;
    phone: string;
    is_open: boolean;
    min_order_amount: number;
    delivery_fee: number;
    free_delivery_threshold: number;
  };
  overall: {
    total_orders: number;
    delivered: number;
    cancelled: number;
    total_revenue: number;
    total_delivery_fees: number;
    net_revenue: number;
  };
  today: {
    orders_count: number;
    delivered: number;
    cancelled: number;
    revenue: number;
    delivery_fees: number;
    cancelled_revenue: number;
    net_revenue: number;
    average_check: number;
    top_products?: TopProduct[];
  };
  this_week: {
    orders_count: number;
    delivered: number;
    revenue: number;
    delivery_fees: number;
    net_revenue: number;
    average_check: number;
  };
  this_month: {
    orders_count: number;
    delivered: number;
    revenue: number;
    delivery_fees: number;
    net_revenue: number;
    average_check: number;
    top_products?: TopProduct[];
  };
  commission: {
    type: string;
    rate: number;
    total_commission: number;
    month_commission: number;
  };
  daily_chart: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Check if role is manager synchronously to prevent UI flash or unauthorized API requests
  const isManager = (() => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
      return data ? JSON.parse(data).role === 'manager' : false;
    } catch {
      return false;
    }
  })();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(!isManager);
  const [error, setError] = useState<string | null>(null);


  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get(ENDPOINTS.DASHBOARD.STATS);
      if (response.data.success && response.data.data) {
        setStats(response.data.data);
      } else {
        throw new Error("Ma'lumotlar formati noto'g'ri");
      }
    } catch (err: any) {
      console.error("Failed to load dashboard stats:", err);
      setError(
        err.response?.data?.message || 
        err.response?.data?.detail || 
        "Statistika ma'lumotlarini yuklashda xatolik yuz berdi. Internet aloqasini tekshiring."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isManager) {
      navigate('/orders', { replace: true });
    } else {
      fetchStats();
    }
  }, [isManager, navigate]);

  if (isManager) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
        <p className="text-slate-400 font-Outfit text-sm">Dashboard yuklanmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 font-Outfit">
        <AlertCircle className="w-12 h-12 text-rose-500 animate-pulse" />
        <h3 className="text-xl font-bold text-white">Xatolik yuz berdi</h3>
        <p className="text-slate-400 text-sm max-w-md text-center">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Qayta urinish</span>
        </button>
      </div>
    );
  }

  const formatUzS = (amount: number | string | null | undefined) => {
    const num = Number(amount);
    if (isNaN(num)) {
      return "0 UZS";
    }
    return num.toLocaleString('uz-UZ') + " UZS";
  };

  const today = stats?.today;
  const overall = stats?.overall;
  const itemsSoldToday = today?.top_products?.reduce((acc: number, p) => acc + (p.qty || 0), 0) || 0;

  return (
    <div className="space-y-8 font-Outfit">
      {/* Top Banner and title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Panel <Sparkles className="w-6 h-6 text-brand" />
          </h1>
          <p className="text-slate-400">Restoraningiz bo'yicha bugungi ko'rsatkichlar va hisobotlar</p>
        </div>

        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition text-slate-300 text-sm cursor-pointer self-start"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Yangilash</span>
        </button>
      </div>

      {/* Grid of Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Today's Revenue */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-brand/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand/5 rounded-bl-full pointer-events-none group-hover:bg-brand/10 transition-colors" />
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-brand/10 text-brand"><DollarSign className="w-6 h-6" /></span>
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" /> +12%
            </span>
          </div>
          <p className="text-sm font-medium text-slate-400">Bugungi tushum</p>
          <h3 className="text-2xl font-bold text-white mt-1.5 truncate">{formatUzS(today?.revenue || 0)}</h3>
        </div>

        {/* Card 2: Today's Orders */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-violet-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full pointer-events-none group-hover:bg-violet-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-violet-500/10 text-violet-400"><ShoppingBag className="w-6 h-6" /></span>
            <span className="text-xs text-slate-400 font-medium">Bugun</span>
          </div>
          <p className="text-sm font-medium text-slate-400">Bugungi buyurtmalar</p>
          <h3 className="text-2xl font-bold text-white mt-1.5">{today?.orders_count || 0} ta</h3>
        </div>

        {/* Card 3: Completed Orders */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle className="w-6 h-6" /></span>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Jami: {overall?.delivered}</span>
          </div>
          <p className="text-sm font-medium text-slate-400">Yakunlanganlar</p>
          <h3 className="text-2xl font-bold text-white mt-1.5">{overall?.delivered || 0} ta</h3>
        </div>

        {/* Card 4: Cancelled Orders */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-rose-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full pointer-events-none group-hover:bg-rose-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-rose-500/10 text-rose-400"><XCircle className="w-6 h-6" /></span>
            <span className="text-xs text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">Canceled</span>
          </div>
          <p className="text-sm font-medium text-slate-400">Bekor qilinganlar</p>
          <h3 className="text-2xl font-bold text-white mt-1.5">{overall?.cancelled || 0} ta</h3>
        </div>
      </div>

      {/* Grid: Charts/Top Products and Overall Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Overall stats list */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 space-y-6">
          <h3 className="text-lg font-bold text-white">Umumiy ko'rsatkichlar</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-white/5">
              <span className="text-slate-400 text-sm">Jami daromad</span>
              <span className="font-bold text-white">{formatUzS(overall?.total_revenue || 0)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/5">
              <span className="text-slate-400 text-sm">O'rtacha chek</span>
              <span className="font-bold text-white">{formatUzS(today?.average_check || 0)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/5">
              <span className="text-slate-400 text-sm">Bugun sotilgan tovarlar</span>
              <span className="font-bold text-white">{itemsSoldToday} ta</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-400 text-sm">Bekor qilingan tushum</span>
              <span className="font-bold text-rose-400">{formatUzS(today?.cancelled_revenue || 0)}</span>
            </div>
          </div>
        </div>

        {/* Top selling products */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-darkCard border border-white/5 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">Ko'p sotilgan taomlar</h3>
            <span className="text-xs font-semibold text-brand bg-brand/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
              Top Mahsulotlar <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            {today?.top_products && today.top_products.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <th className="pb-3">Mahsulot</th>
                    <th className="pb-3 text-center">Soni</th>
                    <th className="pb-3 text-right">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {today.top_products.map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                      <td className="py-3.5 font-medium text-white">{item.name}</td>
                      <td className="py-3.5 text-center font-bold text-slate-400">{item.qty} ta</td>
                      <td className="py-3.5 text-right font-semibold text-emerald-400">{formatUzS(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <ShoppingBag className="w-12 h-12 stroke-[1.5] mb-2" />
                <p>Bugun hali taomlar sotilmadi</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
