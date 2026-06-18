import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowDownLeft,
  RefreshCw,
  ShoppingBag,
  Percent,
  Truck,
  Phone,
  Calendar,
  Layers,
  Sparkles,
  XCircle,
  Info
} from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';
import { ordersApi } from '../../orders/services/ordersApi';
import type { Order } from '../../orders/services/ordersApi';

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

interface Transaction {
  id: string;
  orderId: number;
  date: string;
  amount: number;
  paymentMethod: string;
  status: 'PAID' | 'REFUNDED' | 'PENDING';
}

const FinancePage: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'paid' | 'refunded'>('all');
  const [activeTab, setActiveTab] = useState<'today' | 'this_week' | 'this_month' | 'overall'>('today');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        apiClient.get(ENDPOINTS.DASHBOARD.STATS),
        ordersApi.getOrders()
      ]);
      
      if (statsRes.data.success && statsRes.data.data) {
        setStats(statsRes.data.data);
      } else {
        throw new Error("Ma'lumotlar formati noto'g'ri");
      }
      
      setOrders(ordersRes);
    } catch (err: any) {
      console.error("Failed to load finance data:", err);
      setError(
        err.response?.data?.message ||
        err.message ||
        "Moliya ma'lumotlarini yuklashda xatolik yuz berdi. Internet aloqasini tekshiring."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const formatUzS = (amount: number | string | null | undefined) => {
    const num = Number(amount);
    if (isNaN(num)) {
      return "0 UZS";
    }
    return num.toLocaleString('uz-UZ') + " UZS";
  };

  const formatPhone = (phoneStr: string | undefined) => {
    if (!phoneStr) return '';
    const clean = phoneStr.replace(/\D/g, '');
    if (clean.length === 12) {
      return `+${clean.slice(0, 3)} (${clean.slice(3, 5)}) ${clean.slice(5, 8)}-${clean.slice(8, 10)}-${clean.slice(10, 12)}`;
    }
    return phoneStr;
  };

  const formatChartDate = (dateStr: string) => {
    try {
      const dateObj = new Date(dateStr);
      const months = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
      return `${dateObj.getDate()}-${months[dateObj.getMonth()]}`;
    } catch {
      return dateStr;
    }
  };

  const transactions: Transaction[] = orders.map((order) => {
    let status: 'PAID' | 'REFUNDED' | 'PENDING' = 'PENDING';
    const orderStatus = order.status?.toUpperCase();
    if (orderStatus === 'COMPLETED' || orderStatus === 'DELIVERED') {
      status = 'PAID';
    } else if (orderStatus === 'REJECTED' || orderStatus === 'CANCELLED') {
      status = 'REFUNDED';
    }
    
    return {
      id: `TXN-${order.id}`,
      orderId: order.id,
      date: order.created_at,
      amount: order.total_price,
      paymentMethod: order.payment || 'CASH',
      status
    };
  });

  const getFilteredTransactions = () => {
    switch (filter) {
      case 'paid':
        return transactions.filter((t) => t.status === 'PAID');
      case 'refunded':
        return transactions.filter((t) => t.status === 'REFUNDED');
      case 'all':
      default:
        return transactions;
    }
  };

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case 'CLICK':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/10">CLICK</span>;
      case 'PAYME':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/10">Payme</span>;
      case 'CASH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/10">CASH</span>;
      case 'UZCARD':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/10">Uzcard</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-300">{method}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle className="w-3.5 h-3.5" /> To'landi</span>;
      case 'REFUNDED':
        return <span className="flex items-center gap-1 text-xs font-semibold text-rose-400"><ArrowDownLeft className="w-3.5 h-3.5" /> Qaytarildi</span>;
      case 'PENDING':
        return <span className="flex items-center gap-1 text-xs font-semibold text-amber-400"><Clock className="w-3.5 h-3.5 animate-pulse" /> Kutilmoqda</span>;
      default:
        return <span>{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
        <p className="text-slate-400 font-Outfit text-sm">Moliya ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 font-Outfit">
        <AlertCircle className="w-12 h-12 text-rose-500 animate-pulse" />
        <h3 className="text-xl font-bold text-white">Xatolik yuz berdi</h3>
        <p className="text-slate-400 text-sm max-w-md text-center">{error || "Statistika yuklanmadi"}</p>
        <button
          onClick={fetchFinanceData}
          className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Qayta urinish</span>
        </button>
      </div>
    );
  }

  // Calculate stats based on active period tab
  const activeStats = (() => {
    switch (activeTab) {
      case 'today':
        return {
          title: "Bugun",
          ordersCount: stats.today.orders_count,
          deliveredCount: stats.today.delivered,
          cancelledCount: stats.today.cancelled,
          revenue: stats.today.revenue,
          deliveryFees: stats.today.delivery_fees,
          cancelledRevenue: stats.today.cancelled_revenue || 0,
          netRevenue: stats.today.net_revenue,
          averageCheck: stats.today.average_check,
          commission: stats.today.revenue - stats.today.net_revenue,
          topProducts: stats.today.top_products || [],
          isFallbackProducts: false
        };
      case 'this_week':
        return {
          title: "Shu hafta",
          ordersCount: stats.this_week.orders_count,
          deliveredCount: stats.this_week.delivered,
          cancelledCount: Math.max(0, stats.this_week.orders_count - stats.this_week.delivered),
          revenue: stats.this_week.revenue,
          deliveryFees: stats.this_week.delivery_fees,
          cancelledRevenue: 0, // Not explicitly in API
          netRevenue: stats.this_week.net_revenue,
          averageCheck: stats.this_week.average_check,
          commission: stats.this_week.revenue - stats.this_week.net_revenue,
          topProducts: stats.this_month.top_products || [], // Fallback to month
          isFallbackProducts: true
        };
      case 'this_month':
        return {
          title: "Shu oy",
          ordersCount: stats.this_month.orders_count,
          deliveredCount: stats.this_month.delivered,
          cancelledCount: Math.max(0, stats.this_month.orders_count - stats.this_month.delivered),
          revenue: stats.this_month.revenue,
          deliveryFees: stats.this_month.delivery_fees,
          cancelledRevenue: 0, // Not explicitly in API
          netRevenue: stats.this_month.net_revenue,
          averageCheck: stats.this_month.average_check,
          commission: stats.commission?.month_commission ?? 0,
          topProducts: stats.this_month.top_products || [],
          isFallbackProducts: false
        };
      case 'overall':
      default:
        return {
          title: "Barcha davr",
          ordersCount: stats.overall.total_orders,
          deliveredCount: stats.overall.delivered,
          cancelledCount: stats.overall.cancelled,
          revenue: stats.overall.total_revenue,
          deliveryFees: stats.overall.total_delivery_fees,
          cancelledRevenue: 0, // Not explicitly in API
          netRevenue: stats.overall.net_revenue,
          averageCheck: stats.overall.total_orders > 0 ? Math.round(stats.overall.total_revenue / stats.overall.total_orders) : 0,
          commission: stats.commission?.total_commission ?? 0,
          topProducts: stats.this_month.top_products || [], // Fallback to month
          isFallbackProducts: true
        };
    }
  })();

  const dailyChart = stats.daily_chart || [];
  const maxWeeklyAmount = Math.max(...dailyChart.map(d => d.revenue), 1);
  const filteredTxns = getFilteredTransactions();

  // Compute percentages for dynamic visual bars
  const deliveredPercentage = activeStats.ordersCount > 0 
    ? Math.round((activeStats.deliveredCount / activeStats.ordersCount) * 100)
    : 0;
  
  const cancelledPercentage = activeStats.ordersCount > 0 
    ? Math.round((activeStats.cancelledCount / activeStats.ordersCount) * 100)
    : 0;

  const maxProductQty = activeStats.topProducts && activeStats.topProducts.length > 0
    ? Math.max(...activeStats.topProducts.map(p => p.qty))
    : 1;

  return (
    <div className="space-y-8 font-Outfit">
      {/* Header section with period filter */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Moliya & Statistika <Sparkles className="w-6 h-6 text-brand animate-pulse" />
          </h1>
          <p className="text-slate-400">Do'koningiz moliyaviy hisobotlari, tushumlar va komissiyalar tahlili</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Period Tabs */}
          <div className="flex items-center gap-1 bg-slate-900/50 p-1.5 rounded-xl border border-white/5 shadow-inner">
            {(['today', 'this_week', 'this_month', 'overall'] as const).map((tab) => {
              const label = {
                today: "Bugun",
                this_week: "Hafta",
                this_month: "Oy",
                overall: "Barchasi"
              }[tab];
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
                    isActive 
                      ? 'bg-brand text-white shadow-lg shadow-brand/20' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => alert(`Excel hisoboti yuklab olindi (Davr: ${activeStats.title})`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition text-slate-300 text-sm font-semibold cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Hisobotni yuklash</span>
          </button>
        </div>
      </div>

      {/* Partner Info and Agreement Settings */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-bl-full pointer-events-none filter blur-2xl" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand/10 border border-brand/20 rounded-2xl text-brand text-xl font-black shrink-0">
              {stats.partner.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{stats.partner.name}</h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  stats.partner.is_open 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${stats.partner.is_open ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                  {stats.partner.is_open ? "Hamkor Ochiq" : "Hamkor Yopiq"}
                </span>
              </div>
              <p className="text-slate-400 text-sm flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <a href={`tel:${stats.partner.phone}`} className="hover:text-brand transition">{formatPhone(stats.partner.phone)}</a>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 lg:gap-12 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-white/5 lg:pl-12">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Minimal buyurtma</span>
              <span className="text-sm font-bold text-slate-200 mt-0.5 block">{formatUzS(stats.partner.min_order_amount)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Yetkazib berish</span>
              <span className="text-sm font-bold text-slate-200 mt-0.5 block">{formatUzS(stats.partner.delivery_fee)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Bepul kuryer</span>
              <span className="text-sm font-bold text-brand mt-0.5 block">{formatUzS(stats.partner.free_delivery_threshold)} dan</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Tizim komissiyasi</span>
              <span className="text-sm font-bold text-rose-400 mt-0.5 block flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 shrink-0" /> {stats.commission?.rate ?? 0}% ({stats.commission?.type === 'percentage' ? "Foizda" : (stats.commission?.type ?? '')})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main KPI Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {/* Card 1: Gross Revenue */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-brand/20 transition-all duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-brand/10 text-brand"><DollarSign className="w-5 h-5" /></span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-brand/10 text-brand rounded uppercase">Tushum</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">Umumiy savdo tushumi</p>
            <h3 className="text-xl font-bold text-white mt-1.5 tracking-tight">{formatUzS(activeStats.revenue)}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span>Kuryer va komissiyani o'z ichiga olgan</span>
          </div>
        </div>

        {/* Card 2: Net Payout */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle className="w-5 h-5" /></span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded uppercase">Sof foyda</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">Hisobingizga to'lanadigan</p>
            <h3 className="text-xl font-bold text-emerald-400 mt-1.5 tracking-tight">{formatUzS(activeStats.netRevenue)}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-emerald-400/80">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Sof foyda sizning hisobingiz</span>
          </div>
        </div>

        {/* Card 3: Platform Fee */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-rose-500/20 transition-all duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400"><Percent className="w-5 h-5" /></span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded uppercase">Komissiya</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">Platforma haqi ({stats.commission?.rate ?? 0}%)</p>
            <h3 className="text-xl font-bold text-rose-400 mt-1.5 tracking-tight">{formatUzS(activeStats.commission)}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>MilliyGo xizmat ko'rsatish haqi</span>
          </div>
        </div>

        {/* Card 4: Delivery Fees */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-cyan-500/20 transition-all duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400"><Truck className="w-5 h-5" /></span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded uppercase">Yetkazish</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">Jami yetkazib berish haqi</p>
            <h3 className="text-xl font-bold text-cyan-400 mt-1.5 tracking-tight">{formatUzS(activeStats.deliveryFees)}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>Kuryerlar xizmati uchun hisoblangan</span>
          </div>
        </div>

        {/* Card 5: Orders Count & Ratios */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-violet-500/20 transition-all duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400"><ShoppingBag className="w-5 h-5" /></span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded uppercase">Buyurtmalar</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">Jami buyurtmalar soni</p>
            <h3 className="text-xl font-bold text-white mt-1.5 tracking-tight">{activeStats.ordersCount} ta</h3>
          </div>

          <div className="mt-4 space-y-2 pt-2">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                <CheckCircle className="w-3 h-3" /> {activeStats.deliveredCount} ta
              </span>
              <span className="flex items-center gap-1 font-semibold text-rose-400">
                <XCircle className="w-3 h-3" /> {activeStats.cancelledCount} ta
              </span>
            </div>
            {/* Visual ratio bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${deliveredPercentage}%` }} />
              <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${cancelledPercentage}%` }} />
            </div>
            {activeStats.cancelledRevenue > 0 && (
              <span className="text-[9px] text-slate-500 block truncate">
                Bekor qilingan tushum: {formatUzS(activeStats.cancelledRevenue)}
              </span>
            )}
          </div>
        </div>

        {/* Card 6: Average Check */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-amber-500/20 transition-all duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400"><TrendingUp className="w-5 h-5" /></span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded uppercase">O'rtacha</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">O'rtacha chek summasi</p>
            <h3 className="text-xl font-bold text-white mt-1.5 tracking-tight">{formatUzS(activeStats.averageCheck)}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>Bitta savdoga to'g'ri keladigan chek</span>
          </div>
        </div>
      </div>

      {/* Grid: Graphical Chart & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* CSS Chart: Daily income and orders */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-darkCard border border-white/5 space-y-6 flex flex-col justify-between min-h-[420px]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand" />
                Daromadlar va buyurtmalar grafigi
              </span>
              <span className="text-xs font-normal text-slate-400">Kunlik ko'rsatkichlar</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">Diagramma ustuniga sichqonchani olib borib batafsil ma'lumotni ko'ring</p>
          </div>

          {/* Graphical CSS Chart Area */}
          <div className="flex items-end justify-between gap-6 h-60 pt-6 px-2 relative border-b border-white/5">
            {/* Guide line indicators */}
            <div className="absolute inset-x-0 top-1/4 border-b border-white/5 pointer-events-none" />
            <div className="absolute inset-x-0 top-2/4 border-b border-white/5 pointer-events-none" />
            <div className="absolute inset-x-0 top-3/4 border-b border-white/5 pointer-events-none" />

            {dailyChart.map((item, idx) => {
              const pct = (item.revenue / maxWeeklyAmount) * 80; // Max height 80%
              const isPeak = item.revenue === maxWeeklyAmount;
              
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-3 group relative cursor-pointer min-w-0">
                  
                  {/* Premium Glowing Tooltip on Hover */}
                  <div className="absolute bottom-full mb-3 bg-slate-950 text-white border border-white/10 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 min-w-[150px] -translate-x-1/2 left-1/2">
                    <div className="font-bold border-b border-white/10 pb-1 mb-1 text-[10px] text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> {item.date}
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Tushum:</span>
                      <span className="font-bold text-brand">{formatUzS(item.revenue)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Buyurtmalar:</span>
                      <span className="font-bold text-emerald-400">{item.orders} ta</span>
                    </div>
                  </div>

                  {/* Orders count bubble directly above bar */}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition duration-300 ${
                    isPeak 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' 
                      : 'bg-white/5 text-slate-400 group-hover:text-slate-200'
                  }`}>
                    {item.orders} ta
                  </span>
                  
                  {/* Visual Bar with Gradient */}
                  <div className="w-full relative flex flex-col justify-end h-36">
                    <div 
                      style={{ height: `${pct || 5}%` }} 
                      className={`w-full rounded-t-lg transition-all duration-300 relative ${
                        isPeak 
                          ? 'bg-gradient-to-t from-brand/40 to-brand border-t border-brand-light shadow-[0_0_15px_rgba(14,165,233,0.3)]' 
                          : 'bg-gradient-to-t from-slate-800 to-slate-700 group-hover:from-brand/30 group-hover:to-brand/70'
                      }`}
                    />
                  </div>
                  
                  {/* Date Label */}
                  <span className="text-slate-400 text-[10px] font-bold tracking-wider truncate w-full text-center">
                    {formatChartDate(item.date)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-4 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Eng yuqori savdoli kun
            </span>
            <span className="font-bold text-white flex items-center gap-1">
              {formatUzS(maxWeeklyAmount)} 
              <span className="text-[10px] text-slate-500">({dailyChart.find(d => d.revenue === maxWeeklyAmount)?.date})</span>
            </span>
          </div>
        </div>

        {/* Top selling products list */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-darkCard border border-white/5 space-y-6 flex flex-col justify-between min-h-[420px]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand" />
                Top mahsulotlar
              </span>
              <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded uppercase">
                {activeStats.title}
              </span>
            </h3>
            {activeStats.isFallbackProducts && (
              <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" />
                Shu oy uchun top mahsulotlar ko'rsatilmoqda
              </p>
            )}
          </div>

          <div className="flex-1 space-y-5 py-2 overflow-y-auto max-h-[280px] pr-1 scrollbar-thin">
            {activeStats.topProducts && activeStats.topProducts.length > 0 ? (
              activeStats.topProducts.map((product, idx) => {
                const ratio = (product.qty / maxProductQty) * 100;
                
                return (
                  <div key={idx} className="space-y-1.5 group">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-200 truncate pr-4">{product.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-slate-400">{product.qty} ta</span>
                        <span className="font-bold text-emerald-400">{formatUzS(product.revenue)}</span>
                      </div>
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${ratio}%` }} 
                        className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                          idx === 0 
                            ? 'from-brand to-cyan-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]' 
                            : 'from-slate-600 to-slate-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
                <ShoppingBag className="w-12 h-12 stroke-[1] mb-2 text-slate-600" />
                <p className="text-sm">Ushbu davr bo'yicha mahsulotlar sotilmagan</p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
            <span>Ushbu davrdagi jami taomlar soni:</span>
            <span className="font-bold text-white">
              {activeStats.topProducts.reduce((acc, p) => acc + p.qty, 0)} ta
            </span>
          </div>
        </div>
      </div>

      {/* Transactions list */}
      <div className="p-6 rounded-2xl bg-darkCard border border-white/5 flex flex-col shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
              <span>Tranzaksiyalar tarixi</span>
            </h3>
            <p className="text-xs text-slate-400">Buyurtmalar bo'yicha to'lov usullari va tranzaksiya holatlari</p>
          </div>
          
          {/* Action filters */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-white/5 self-start shadow-inner">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
                filter === 'all' ? 'bg-white/5 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Barchasi
            </button>
            <button
              onClick={() => setFilter('paid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
                filter === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              To'langanlar
            </button>
            <button
              onClick={() => setFilter('refunded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
                filter === 'refunded' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Qaytarilganlar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredTxns.length > 0 ? (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider font-bold">
                  <th className="pb-3.5 pl-2">ID / Sana</th>
                  <th className="pb-3.5 text-center">To'lov Turi</th>
                  <th className="pb-3.5 text-center">Tranzaksiya Holati</th>
                  <th className="pb-3.5 text-right pr-2">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredTxns.map((txn) => (
                  <tr key={txn.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="py-3.5 pl-2">
                      <div className="font-bold text-white text-xs">{txn.id}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Buyurtma #{txn.orderId} • {txn.date}</div>
                    </td>
                    <td className="py-3.5 text-center">{getPaymentBadge(txn.paymentMethod)}</td>
                    <td className="py-3.5 text-center">{getStatusBadge(txn.status)}</td>
                    <td className={`py-3.5 text-right pr-2 font-bold ${txn.status === 'REFUNDED' ? 'text-rose-400 line-through' : 'text-white'}`}>
                      {formatUzS(txn.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <AlertCircle className="w-12 h-12 stroke-[1] mb-2 text-slate-600" />
              <p className="text-sm">Mos keladigan tranzaksiyalar topilmadi</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinancePage;

