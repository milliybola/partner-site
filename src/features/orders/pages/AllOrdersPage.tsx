import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  MapPin, 
  Phone, 
  CreditCard, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  DollarSign,
  TrendingUp,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';

const AllOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('newest');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ordersApi.getOrders();
      setOrders(data);
    } catch (err: any) {
      console.error("Failed to load orders:", err);
      setError(
        err.response?.data?.message || 
        err.message || 
        "Buyurtmalarni yuklashda xatolik yuz berdi. Internet aloqasini tekshiring."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">Kutilmoqda</span>;
      case 'SEARCHING_COURIER':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">Kuryer izlanmoqda</span>;
      case 'ACCEPTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Qabul qilindi</span>;
      case 'PREPARING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Tayyorlanmoqda</span>;
      case 'READY_FOR_PICKUP':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Tayyor (Kuryerga)</span>;
      case 'DELIVERING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">Yo'lda</span>;
      case 'COMPLETED':
      case 'DELIVERED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Yetkazildi</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/15">Rad etilgan</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/15">Bekor qilingan</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300">{status}</span>;
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

  // Get filtered and sorted orders list
  const filteredAndSortedOrders = orders
    .filter((order) => {
      // Search matches ID or Phone
      const matchesSearch = 
        order.id.toString().includes(searchQuery) ||
        order.contact_phone.includes(searchQuery) ||
        order.address.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Status matches filter
      const orderStatus = order.status?.toUpperCase();
      const filterStatus = statusFilter?.toUpperCase();
      const matchesStatus = 
        statusFilter === 'ALL' || 
        orderStatus === filterStatus ||
        (statusFilter === 'COMPLETED' && orderStatus === 'DELIVERED') ||
        (statusFilter === 'PENDING_GROUP' && (orderStatus === 'PENDING' || orderStatus === 'SEARCHING_COURIER')) ||
        (statusFilter === 'ACTIVE_GROUP' && ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING'].includes(orderStatus)) ||
        (statusFilter === 'HISTORY_GROUP' && ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'].includes(orderStatus));

      // Payment matches filter
      const matchesPayment = 
        paymentFilter === 'ALL' || 
        order.payment === paymentFilter;

      return matchesSearch && matchesStatus && matchesPayment;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'price-desc') {
        return b.total_price - a.total_price;
      }
      if (sortBy === 'price-asc') {
        return a.total_price - b.total_price;
      }
      return 0;
    });

  // Calculate statistics counters
  const totalCount = orders.length;
  const completedCount = orders.filter((o) => {
    const s = o.status?.toUpperCase();
    return s === 'COMPLETED' || s === 'DELIVERED';
  }).length;
  const activeCount = orders.filter((o) => {
    const s = o.status?.toUpperCase();
    return ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING'].includes(s);
  }).length;
  const cancelledCount = orders.filter((o) => {
    const s = o.status?.toUpperCase();
    return ['CANCELLED', 'REJECTED'].includes(s);
  }).length;
  const totalRevenue = orders
    .filter((o) => {
      const s = o.status?.toUpperCase();
      return s === 'COMPLETED' || s === 'DELIVERED';
    })
    .reduce((sum, o) => sum + o.total_price, 0);

  return (
    <div className="space-y-8 font-Outfit">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Barcha buyurtmalar <ShoppingBag className="w-7 h-7 text-brand" />
          </h1>
          <p className="text-slate-400">Buyurtmalar to'liq tarixi, qidiruv va batafsil hisobotlari</p>
        </div>

        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition text-slate-300 text-sm cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Yangilash</span>
        </button>
      </div>

      {/* KPI Counters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-brand/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-brand/10 text-brand"><ShoppingBag className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Jami</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Jami buyurtmalar</p>
          <h3 className="text-2xl font-bold text-white mt-1">{totalCount} ta</h3>
        </div>

        {/* Active Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-blue-500/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400"><Clock className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-blue-400 uppercase">Faol</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Jarayondagilar</p>
          <h3 className="text-2xl font-bold text-white mt-1">{activeCount} ta</h3>
        </div>

        {/* Completed Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-emerald-400 uppercase">Yakunlandi</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Yetkazib berildi</p>
          <h3 className="text-2xl font-bold text-emerald-400 mt-1">{completedCount} ta</h3>
        </div>

        {/* Cancelled/Rejected Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-rose-500/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400"><XCircle className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-rose-400 uppercase">Bekor qilingan</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Rad/Bekor bo'lganlar</p>
          <h3 className="text-2xl font-bold text-white mt-1">{cancelledCount} ta</h3>
        </div>

        {/* Completed revenue */}
        <div className="p-5 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-amber-500/20 transition-all duration-300 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400"><DollarSign className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-amber-400 uppercase">Kirim</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Yakunlangan savdo summasi</p>
          <h3 className="text-xl font-bold text-amber-400 mt-1 truncate">{formatUzS(totalRevenue)}</h3>
        </div>
      </div>

      {/* Advanced Filter and Search Bar */}
      <div className="p-5 rounded-2xl bg-darkCard border border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-xl">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
            <Search className="w-4.5 h-4.5" />
          </span>
          <input
            type="text"
            placeholder="Buyurtma raqami, manzil yoki telefon orqali qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/5 hover:border-white/10 focus:border-brand rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">Barcha holatlar</option>
              <option value="PENDING_GROUP" className="bg-slate-900 text-white">Yangi (Pending / Kuryer kutilmoqda)</option>
              <option value="ACTIVE_GROUP" className="bg-slate-900 text-white">Faol jarayondagilar (Yo'lda/Tayyorlanayotgan)</option>
              <option value="HISTORY_GROUP" className="bg-slate-900 text-white">Yakunlanganlar / Rad qilinganlar</option>
              <option value="COMPLETED" className="bg-slate-900 text-white">Yetkazib berilganlar</option>
              <option value="CANCELLED" className="bg-slate-900 text-white">Bekor qilinganlar</option>
              <option value="REJECTED" className="bg-slate-900 text-white">Rad etilganlar</option>
            </select>
          </div>

          {/* Payment filter */}
          <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">Barcha to'lovlar</option>
              <option value="CASH" className="bg-slate-900 text-white">CASH</option>
              <option value="CLICK" className="bg-slate-900 text-white">CLICK</option>
              <option value="PAYME" className="bg-slate-900 text-white">Payme</option>
              <option value="UZCARD" className="bg-slate-900 text-white">Uzcard</option>
            </select>
          </div>

          {/* Sort selection */}
          <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="newest" className="bg-slate-900 text-white">Yangi buyurtmalar birinchi</option>
              <option value="oldest" className="bg-slate-900 text-white">Eski buyurtmalar birinchi</option>
              <option value="price-desc" className="bg-slate-900 text-white">Summa: Kamayuvchi</option>
              <option value="price-asc" className="bg-slate-900 text-white">Summa: O'suvchi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table view of Orders */}
      <div className="p-6 rounded-2xl bg-darkCard border border-white/5 flex flex-col shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
            <p className="text-slate-400 font-semibold text-sm">Buyurtmalar ro'yxati yuklanmoqda...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 animate-pulse mb-3" />
            <h4 className="font-bold text-white text-base">Ma'lumot yuklashda xatolik</h4>
            <p className="text-xs max-w-sm mt-1 mb-4">{error}</p>
            <button
              onClick={fetchOrders}
              className="px-4 py-2.5 rounded-xl bg-brand text-white font-semibold text-xs transition hover:bg-brand-dark cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" /> Qayta urinish
            </button>
          </div>
        ) : filteredAndSortedOrders.length > 0 ? (
          <div className="overflow-x-auto">
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse text-sm hidden md:table">
              <thead>
                <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider font-bold">
                  <th className="pb-3.5 pl-2">ID</th>
                  <th className="pb-3.5">Sana / Vaqt</th>
                  <th className="pb-3.5">Telefon</th>
                  <th className="pb-3.5">Manzil</th>
                  <th className="pb-3.5 text-center">To'lov</th>
                  <th className="pb-3.5 text-center">Holat</th>
                  <th className="pb-3.5 text-right pr-2">Jami</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredAndSortedOrders.map((order) => (
                  <tr 
                    key={order.uuid} 
                    onClick={() => setSelectedOrder(order)}
                    className="hover:bg-white/[0.01] transition-colors cursor-pointer"
                  >
                    <td className="py-4 pl-2 font-bold text-white text-xs">#{order.id}</td>
                    <td className="py-4 text-xs font-semibold text-slate-400">{order.created_at}</td>
                    <td className="py-4 font-semibold text-slate-300 text-xs">{formatPhone(order.contact_phone)}</td>
                    <td className="py-4 text-xs max-w-[200px] truncate" title={order.address}>{order.address}</td>
                    <td className="py-4 text-center">{getPaymentBadge(order.payment)}</td>
                    <td className="py-4 text-center">{getStatusBadge(order.status)}</td>
                    <td className="py-4 text-right pr-2 font-bold text-white text-xs">{formatUzS(order.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Card-List View (fallback) */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {filteredAndSortedOrders.map((order) => (
                <div 
                  key={order.uuid} 
                  onClick={() => setSelectedOrder(order)}
                  className="p-4 rounded-xl border border-white/5 bg-slate-900/40 flex flex-col gap-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">#{order.id}</span>
                    <span className="text-[10px] text-slate-500">{order.created_at.split(',')[1] || order.created_at}</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 truncate">{order.address}</p>
                    <p className="text-xs font-semibold text-slate-300 mt-1">{formatPhone(order.contact_phone)}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      {getPaymentBadge(order.payment)}
                      {getStatusBadge(order.status)}
                    </div>
                    <span className="font-bold text-white text-xs">{formatUzS(order.total_price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
            <ShoppingBag className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
            <h3 className="font-bold text-white mb-1">Buyurtmalar topilmadi</h3>
            <p className="text-xs max-w-xs">Filtr parametrlari bo'yicha hech qanday buyurtma mavjud emas</p>
          </div>
        )}
      </div>

      {/* Selected Order Details Modal Dialog */}
      {selectedOrder && (
        <div 
          onClick={() => setSelectedOrder(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-darkCard border border-white/10 rounded-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto text-left space-y-6 animate-[slideUp_0.3s_ease-out]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-white">Buyurtma #{selectedOrder.id} Tafsilotlari</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedOrder.created_at}</p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white transition cursor-pointer text-xs font-bold"
              >
                Yopish
              </button>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Joriy Holat:</span>
              {getStatusBadge(selectedOrder.status)}
            </div>

            {/* Dishes list items */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Buyurtma qilingan taomlar</h4>
              <div className="divide-y divide-white/5 max-h-60 overflow-y-auto pr-1">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-white">{item.product.name}</p>
                      <p className="text-xs text-slate-500">{formatUzS(item.product.price)} x {item.quantity}</p>
                    </div>
                    <span className="font-semibold text-slate-300 shrink-0">
                      {formatUzS(item.product.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing Details */}
            <div className="pt-4 border-t border-white/5 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Kuryer yetkazib berish xizmati</span>
                <span>{formatUzS(selectedOrder.delivery_fee)}</span>
              </div>
              <div className="flex justify-between font-bold text-white text-base pt-1">
                <span>Jami to'lov summasi</span>
                <span className="text-emerald-400">{formatUzS(selectedOrder.total_price)}</span>
              </div>
            </div>

            {/* Client address details */}
            <div className="p-4 rounded-xl bg-slate-900 border border-white/5 space-y-3 text-xs">
              <p className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <span><strong>Manzil:</strong> {selectedOrder.address}</span>
              </p>
              <p className="flex items-center gap-2 text-slate-300">
                <Phone className="w-4 h-4 text-brand shrink-0" />
                <span><strong>Mijoz telefoni:</strong> {formatPhone(selectedOrder.contact_phone)}</span>
              </p>
              <p className="flex items-center gap-2 text-slate-300">
                <CreditCard className="w-4 h-4 text-brand shrink-0" />
                <span><strong>To'lov turi:</strong> {selectedOrder.payment}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllOrdersPage;
