import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingBag, 
  Clock, 
  MapPin, 
  Phone as PhoneIcon, 
  CreditCard,
  CheckCircle,
  XCircle,
  Play,
  Check,
  AlertCircle,
  Radio,
  Bell,
  RefreshCw
} from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { useWebSocket } from '../../../core/hooks/useWebSocket';
import { STORAGE_KEYS } from '../../../core/config/constants';
import confetti from 'canvas-confetti';

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'active' | 'history'>('pending');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Real-time toast alerts
  const [newOrderToast, setNewOrderToast] = useState<{
    show: boolean;
    message: string;
    orderUuid: string;
    price: string | number;
  } | null>(null);

  const [partnerUuid, setPartnerUuid] = useState<string | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      setPartnerUuid(JSON.parse(data).uuid);
    }
    setToken(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN));
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ordersApi.getOrders();
      setOrders(data);
    } catch (err: any) {
      console.error("Failed to load orders from API:", err);
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

  // Handle incoming Websocket order alerts
  const handleNewOrderAlert = useCallback((event: any) => {
    const orderData = event.order_data;
    
    // Add to orders list
    const newOrder: Order = {
      id: Math.floor(10000 + Math.random() * 90000),
      uuid: orderData.uuid,
      status: orderData.status || 'PENDING',
      contact_phone: orderData.contact_phone || '+998 (--) --- -- --',
      address: orderData.address || 'Manzil ko\'rsatilmagan',
      created_at: new Date().toLocaleString('uz-UZ'),
      delivery_fee: 15000,
      total_price: parseFloat(orderData.total_price || 0),
      payment: 'CASH',
      items: orderData.items || [{ product: { name: "Noma'lum taom", price: parseFloat(orderData.total_price) }, quantity: 1 }]
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Visual Slide-in toast
    setNewOrderToast({
      show: true,
      message: event.message || 'Yangi buyurtma keldi!',
      orderUuid: newOrder.uuid,
      price: newOrder.total_price
    });

    // Auto-clear toast after 8 seconds
    setTimeout(() => {
      setNewOrderToast((current) => current?.orderUuid === newOrder.uuid ? null : current);
    }, 8000);
  }, []);

  // Set up WebSocket Hook
  const { isConnected, triggerMockNotification } = useWebSocket(
    partnerUuid,
    token,
    handleNewOrderAlert
  );

  const handleUpdateStatus = async (orderUuid: string, nextStatus: string) => {
    try {
      await ordersApi.updateOrderStatus(orderUuid, nextStatus);
      // Refresh list
      fetchOrders();
      // Update drawer if open
      if (selectedOrder && selectedOrder.uuid === orderUuid) {
        const updatedOrd = orders.find((o) => o.uuid === orderUuid);
        if (updatedOrd) {
          setSelectedOrder({ ...updatedOrd, status: nextStatus as any });
        }
      }
      if (nextStatus === 'COMPLETED') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
    } catch (err) {
      alert("Buyurtma holatini yangilashda xatolik yuz berdi.");
    }
  };

  const getFilteredOrders = () => {
    switch (activeTab) {
      case 'pending':
        return orders.filter((o) => o.status === 'PENDING');
      case 'active':
        return orders.filter((o) => ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING'].includes(o.status));
      case 'history':
        return orders.filter((o) => ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(o.status));
      case 'all':
      default:
        return orders;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">Kutilmoqda</span>;
      case 'ACCEPTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Qabul qilindi</span>;
      case 'PREPARING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Tayyorlanmoqda</span>;
      case 'READY_FOR_PICKUP':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Tayyor (Kuryerga)</span>;
      case 'DELIVERING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">Yo'lda</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Yetkazildi</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/15">Rad etilgan</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/15">Bekor qilingan</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300">{status}</span>;
    }
  };

  const formatUzS = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + " UZS";
  };

  const filteredOrders = getFilteredOrders();
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;
  const activeCount = orders.filter((o) => ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING'].includes(o.status)).length;

  return (
    <div className="space-y-8 font-Outfit relative min-h-[80vh]">
      {/* Toast Alert popup */}
      {newOrderToast && (
        <div className="fixed top-24 right-6 z-50 w-full max-w-sm p-4 rounded-xl bg-brand text-white shadow-2xl border border-white/20 flex gap-3 animate-[slide-in_0.3s_ease-out]">
          <span className="p-2.5 rounded-lg bg-white/20 text-white shrink-0 self-start">
            <Bell className="w-6 h-6 animate-bounce" />
          </span>
          <div className="flex-1">
            <h4 className="font-bold text-base">Yangi Buyurtma Keldi!</h4>
            <p className="text-xs text-brand-soft/80 mt-0.5">Summa: {formatUzS(Number(newOrderToast.price))}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  const targetOrd = orders.find((o) => o.uuid === newOrderToast.orderUuid);
                  if (targetOrd) setSelectedOrder(targetOrd);
                  setNewOrderToast(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-white text-brand font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
              >
                Ko'rish
              </button>
              <button
                onClick={() => setNewOrderToast(null)}
                className="px-3 py-1.5 rounded-lg bg-transparent hover:bg-white/10 text-white font-semibold text-xs transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Buyurtmalar <ShoppingBag className="w-7 h-7 text-brand" />
          </h1>
          <p className="text-slate-400">Kelayotgan va faol holatdagi buyurtmalarni real vaqtda boshqaring</p>
        </div>

        <div className="flex items-center gap-3">
          {/* WebSocket indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-300">{isConnected ? 'WS Bog\'langan' : 'WS Ajralgan'}</span>
          </div>

          <button
            onClick={triggerMockNotification}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/20 hover:bg-brand/20 text-brand text-xs font-bold transition cursor-pointer"
          >
            <Radio className="w-4 h-4" />
            <span>Mock WS order</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center border-b border-white/5 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${
            activeTab === 'pending' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Yangi</span>
          {pendingCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-xs font-bold">
              {pendingCount}
            </span>
          )}
          {activeTab === 'pending' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>

        <button
          onClick={() => setActiveTab('active')}
          className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${
            activeTab === 'active' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Faol</span>
          {activeCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full bg-brand/20 text-brand text-xs font-bold">
              {activeCount}
            </span>
          )}
          {activeTab === 'active' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${
            activeTab === 'history' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Tarix</span>
          {activeTab === 'history' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${
            activeTab === 'all' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Barchasi</span>
          {activeTab === 'all' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>
      </div>

      {/* Main split grid: list of orders and detailed drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Order cards list */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-3 border-brand/20 border-t-brand rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
              <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
              <h4 className="font-bold text-white text-base mb-1">Xatolik yuz berdi</h4>
              <p className="text-sm max-w-sm mb-4 text-slate-400">{error}</p>
              <button
                onClick={fetchOrders}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center mx-auto"
              >
                <RefreshCw className="w-4 h-4 animate-[spin_4s_linear_infinite]" />
                <span>Qayta urinish</span>
              </button>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredOrders.map((order) => (
                <div
                  key={order.uuid}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-5 rounded-2xl border text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                    selectedOrder?.uuid === order.uuid
                      ? 'bg-brand/5 border-brand'
                      : 'bg-darkCard border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-xs font-bold text-slate-400">#{order.id}</span>
                    {getStatusBadge(order.status)}
                  </div>

                  <h4 className="font-bold text-white text-lg">{formatUzS(order.total_price)}</h4>
                  
                  <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{order.address}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{order.created_at}</span>
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                      {order.items.length} ta xil taom
                    </span>
                    <span className="text-xs font-semibold text-brand">Batafsil →</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-darkCard/50 border border-dashed border-white/5 rounded-2xl">
              <ShoppingBag className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
              <h3 className="font-bold text-white mb-1">Buyurtmalar mavjud emas</h3>
              <p className="text-sm px-6 text-center">Ushbu filtr bo'yicha hech qanday buyurtma topilmadi</p>
            </div>
          )}
        </div>

        {/* Selected Order Detail Sidebar Panel */}
        <div className="lg:col-span-1">
          {selectedOrder ? (
            <div className="p-6 rounded-2xl bg-darkCard border border-white/5 space-y-6 text-left sticky top-24 animate-[fade-in_0.2s_ease-out]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-white">Buyurtma #{selectedOrder.id}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedOrder.created_at}</p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white transition cursor-pointer text-xs font-bold"
                >
                  Yopish
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Holat:</span>
                {getStatusBadge(selectedOrder.status)}
              </div>

              {/* Items List */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Taomlar ro'yxati</h4>
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

              {/* Price Breakdown */}
              <div className="pt-4 border-t border-white/5 space-y-2 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Yetkazib berish</span>
                  <span>{formatUzS(selectedOrder.delivery_fee)}</span>
                </div>
                <div className="flex justify-between font-bold text-white text-base pt-1">
                  <span>Jami summa</span>
                  <span className="text-emerald-400">{formatUzS(selectedOrder.total_price)}</span>
                </div>
              </div>

              {/* Delivery and Customer details */}
              <div className="p-4 rounded-xl bg-slate-900 border border-white/5 space-y-3 text-xs">
                <p className="flex items-start gap-2 text-slate-300">
                  <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <span><strong>Manzil:</strong> {selectedOrder.address}</span>
                </p>
                <p className="flex items-center gap-2 text-slate-300">
                  <PhoneIcon className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>Telefon:</strong> {selectedOrder.contact_phone}</span>
                </p>
                <p className="flex items-center gap-2 text-slate-300">
                  <CreditCard className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>To'lov turi:</strong> {selectedOrder.payment}</span>
                </p>
              </div>

              {/* Context Actions based on status */}
              <div className="space-y-2.5">
                {selectedOrder.status === 'PENDING' && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.uuid, 'ACCEPTED')}
                      className="py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      Qabul qilish
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.uuid, 'REJECTED')}
                      className="py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/10 transition cursor-pointer flex justify-center items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      Rad etish
                    </button>
                  </div>
                )}

                {selectedOrder.status === 'ACCEPTED' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.uuid, 'PREPARING')}
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Tayyorlashni boshlash
                  </button>
                )}

                {selectedOrder.status === 'PREPARING' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.uuid, 'READY_FOR_PICKUP')}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Tayyor deb belgilash
                  </button>
                )}

                {selectedOrder.status === 'READY_FOR_PICKUP' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.uuid, 'COMPLETED')}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Kuryerga topshirildi
                  </button>
                )}

                {['COMPLETED', 'REJECTED', 'CANCELLED'].includes(selectedOrder.status) && (
                  <div className="p-3 text-center rounded-xl bg-white/5 border border-white/5 text-slate-400 text-xs">
                    Buyurtma faoliyati yakunlangan
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center p-10 py-20 bg-darkCard/30 border border-dashed border-white/5 rounded-2xl text-slate-500 text-center">
              <AlertCircle className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-sm font-semibold">Tafsilotlar</p>
              <p className="text-xs mt-1">Batafsil ma'lumot olish uchun ro'yxatdan buyurtmani tanlang</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
