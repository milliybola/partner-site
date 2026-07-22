import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  MapPin,
  Phone,
  CreditCard,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  DollarSign,
  SlidersHorizontal,
  Printer,
  User,
  Truck,
  Pencil
} from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { filialApi } from '../services/filialApi';
import type { PartnerFilial } from '../services/filialApi';
import { STORAGE_KEYS } from '../../../core/config/constants';
import { EditOrderModal } from '../components/EditOrderModal';
import { useToast } from '../../../core/components/ToastProvider';

const AllOrdersPage: React.FC = () => {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printingUuid, setPrintingUuid] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Filial / Role States
  const [userRole, setUserRole] = useState<'superadmin' | 'manager'>('superadmin');
  const [selectedFilialUuid, setSelectedFilialUuid] = useState<string>('');
  const [filials, setFilials] = useState<PartnerFilial[]>([]);

  const fetchOrders = useCallback(async (branchUuid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const activeBranchUuid = branchUuid !== undefined ? branchUuid : selectedFilialUuid;
      const data = await ordersApi.getOrders(activeBranchUuid || undefined);
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
  }, [selectedFilialUuid]);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.role === 'manager') {
        setUserRole('manager');
      } else {
        setUserRole('superadmin');
        filialApi.getFilials()
          .then(res => setFilials(res))
          .catch(err => console.error("Failed to fetch filials in AllOrdersPage:", err));
      }
    }
    fetchOrders();
  }, []);

  const handlePrintReceipt = useCallback(async (orderUuid: string) => {
    setPrintingUuid(orderUuid);
    try {
      const responseData = await ordersApi.getOrderReceipt(orderUuid);
      const receiptData = responseData.data || responseData;

      const itemsHtml = (receiptData.items || []).map((item: any) => {
        const productName = item.product_name || item.name || item.product?.name || "Noma'lum taom";
        const unitPrice = Number(item.unit_price || 0).toLocaleString('uz-UZ');
        const lineTotal = Number(item.line_total || 0).toLocaleString('uz-UZ');
        return `
          <div style="margin-bottom: 6px; font-size: 11px; font-weight: 500; color: #000;">
            <div style="display: flex; justify-content: space-between; font-weight: 700; color: #000;">
              <span>${productName}</span>
              <span>${lineTotal} UZS</span>
            </div>
            <div style="font-size: 10px; color: #000; font-weight: 500; margin-top: 1px;">
              ${unitPrice} UZS x ${item.quantity}
            </div>
          </div>
        `;
      }).join('');

      const formattedDate = receiptData.created_at || new Date().toLocaleString('uz-UZ');

      const receiptHtml = `
        <html>
          <head>
            <title>Chek #${receiptData.order_number}</title>
            <style>
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                width: 74mm;
                margin: 0 auto;
                padding: 8px 4px;
                color: #000;
                background: #fff;
                line-height: 1.35;
                font-weight: 500;
              }
              .text-center { text-align: center; }
              .bold { font-weight: 700; }
              .header { margin-bottom: 8px; }
              .header h2 { margin: 0 0 2px 0; font-size: 16px; font-weight: 700; letter-spacing: -0.3px; color: #000; }
              .header p { margin: 1px 0; font-size: 11px; color: #000; font-weight: 500; }
              .logo-box {
                border: 1px solid #000;
                display: inline-block;
                padding: 1px 6px;
                font-weight: 700;
                font-size: 12px;
                margin-bottom: 4px;
                letter-spacing: 1px;
                color: #000;
              }
              .divider { 
                border-top: 1px dashed #000; 
                margin: 8px 0; 
              }
              .info-row {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                margin-bottom: 4px;
                font-weight: 500;
                color: #000;
              }
              .info-label { color: #000; font-weight: 500; }
              .info-value { font-weight: 700; text-align: right; color: #000; }
              
              .items-header {
                display: flex;
                justify-content: space-between;
                font-weight: 700;
                font-size: 11px;
                border-bottom: 1px solid #000;
                padding-bottom: 3px;
                margin-bottom: 5px;
                color: #000;
              }
              
              .totals-section {
                margin-top: 6px;
              }
              .totals-row {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                margin-bottom: 4px;
                font-weight: 500;
                color: #000;
              }
              .grand-total-row {
                display: flex;
                justify-content: space-between;
                font-size: 14px;
                font-weight: 700;
                border-top: 1px solid #000;
                border-bottom: 1px solid #000;
                padding: 5px 0;
                margin: 8px 0;
                color: #000;
              }
              .footer {
                margin-top: 15px;
                font-size: 10px;
                text-align: center;
                color: #000;
                font-weight: 500;
              }
              .barcode {
                font-family: 'Courier New', Courier, monospace;
                font-size: 12px;
                margin-top: 6px;
                letter-spacing: 2px;
                font-weight: 700;
                color: #000;
              }
            </style>
          </head>
          <body>
            <div class="header text-center" style="display: flex; flex-direction: column; align-items: center; margin-bottom: 6px;">
              <div style="display: flex; flex-direction: row; align-items: center; gap: 6px; margin-bottom: 2px;">
                <img src="${window.location.origin}/logo_bw.png" alt="MilliyGo Logo" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;" />
                <div style="font-size: 14px; font-weight: 700; letter-spacing: 1px; color: #000;">MILLIYGO</div>
              </div>
              <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #000; text-transform: uppercase;">${receiptData.partner_name || ''}</h2>
              <div style="font-size: 10px; color: #000; font-weight: 500; margin-top: 2px; line-height: 1.2; text-align: center;">
                <p style="margin: 1px 0;">${[receiptData.partner_address, receiptData.partner_phone].filter(Boolean).join(' | ')}</p>
              </div>
            </div>

            <div class="divider"></div>

            <div class="info-row">
              <span class="info-label">Buyurtma:</span>
              <span class="info-value bold">${receiptData.order_number}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Sana:</span>
              <span class="info-value">${formattedDate}</span>
            </div>
            ${receiptData.contact_name ? `
            <div class="info-row">
              <span class="info-label">Mijoz:</span>
              <span class="info-value">${receiptData.contact_name}</span>
            </div>` : ''}
            ${receiptData.contact_phone ? `
            <div class="info-row">
              <span class="info-label">Tel:</span>
              <span class="info-value">${receiptData.contact_phone}</span>
            </div>` : ''}
            ${receiptData.address ? `
            <div class="info-row">
              <span class="info-label">Manzil:</span>
              <span class="info-value">${receiptData.address}</span>
            </div>` : ''}
            ${receiptData.delivery_type_display ? `
            <div class="info-row">
              <span class="info-label">Turi:</span>
              <span class="info-value">${receiptData.delivery_type_display}</span>
            </div>` : ''}
            ${receiptData.table_number ? `
            <div class="info-row">
              <span class="info-label">Stol:</span>
              <span class="info-value bold">${receiptData.table_number}-stol</span>
            </div>` : ''}


            <div class="divider"></div>

            <div class="items-header">
              <span>MAHSULOT</span>
              <span>SUMMA</span>
            </div>
            
            ${itemsHtml}

            <div class="divider"></div>

            <div class="totals-section">
              <div class="totals-row">
                <span class="info-label">Summa:</span>
                <span class="info-value">${Number(receiptData.subtotal).toLocaleString('uz-UZ')} UZS</span>
              </div>
              <div class="totals-row">
                <span class="info-label">Yetkazib berish:</span>
                <span class="info-value">${Number(receiptData.delivery_fee || 0).toLocaleString('uz-UZ')} UZS</span>
              </div>
              
              <div class="grand-total-row">
                <span>JAMI:</span>
                <span>${Number(receiptData.total_price).toLocaleString('uz-UZ')} UZS</span>
              </div>
              
              <div class="info-row" style="margin-top: 4px;">
                <span class="info-label">To'lov turi:</span>
                <span class="info-value bold">${receiptData.payment_method_display || receiptData.payment_method || ''}</span>
              </div>
             
              ${receiptData.description ? `
              <div class="info-row" style="margin-top: 3px;">
                <span class="info-label">Izoh:</span>
                <span class="info-value">${receiptData.description}</span>
              </div>` : ''}
            </div>

            <div class="footer">
              <p class="bold" style="font-size: 11px; margin-bottom: 2px;">XARIDINGIZ UCHUN RAHMAT!</p>
              <p style="margin: 0; font-weight: 700;">MilliyGo | milliyapp.uz</p>
              
            </div>

            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() {
                  window.frameElement.remove();
                }, 1000);
              };
            </script>
          </body>
        </html>
      `;

      const printCopies = parseInt(localStorage.getItem('milliygo_print_copies') || '1', 10) || 1;
      
      for (let i = 0; i < printCopies; i++) {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(receiptHtml);
          doc.close();
        }
      }

    } catch (err: any) {
      console.error("Chek chop etishda xatolik:", err);
      toast.error("Chek ma'lumotlarini yuklashda xatolik yuz berdi.");
    } finally {
      setPrintingUuid(null);
    }
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

  const getPaymentBadge = (method: string | undefined) => {
    if (!method) {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/10">Noma'lum</span>;
    }
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
      // Search matches ID, Order Number, Phone or Address
      const matchesSearch =
        order.id.toString().includes(searchQuery) ||
        (order.order_number && order.order_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
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
        return Number(b.total_price) - Number(a.total_price);
      }
      if (sortBy === 'price-asc') {
        return Number(a.total_price) - Number(b.total_price);
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
    .reduce((sum, o) => sum + Number(o.total_price), 0);

  return (
    <div className="space-y-8 font-Outfit">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-2">
            Barcha buyurtmalar <ShoppingBag className="w-7 h-7 text-brand" />
          </h1>
          <p className="text-slate-400">Buyurtmalar to'liq tarixi, qidiruv va batafsil hisobotlari</p>
        </div>

        <button
          onClick={() => fetchOrders()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-overlay border border-edge-strong hover:bg-overlay-strong hover:text-ink transition text-slate-300 text-sm cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Yangilash</span>
        </button>
      </div>

      {/* KPI Counters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-edge relative overflow-hidden group hover:border-brand/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-brand/10 text-brand"><ShoppingBag className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Jami</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Jami buyurtmalar</p>
          <h3 className="text-2xl font-bold text-ink mt-1">{totalCount} ta</h3>
        </div>

        {/* Active Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-edge relative overflow-hidden group hover:border-blue-500/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400"><Clock className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-blue-400 uppercase">Faol</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Jarayondagilar</p>
          <h3 className="text-2xl font-bold text-ink mt-1">{activeCount} ta</h3>
        </div>

        {/* Completed Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-edge relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-emerald-400 uppercase">Yakunlandi</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Yetkazib berildi</p>
          <h3 className="text-2xl font-bold text-emerald-400 mt-1">{completedCount} ta</h3>
        </div>

        {/* Cancelled/Rejected Orders */}
        <div className="p-5 rounded-2xl bg-darkCard border border-edge relative overflow-hidden group hover:border-rose-500/20 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400"><XCircle className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-rose-400 uppercase">Bekor qilingan</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Rad/Bekor bo'lganlar</p>
          <h3 className="text-2xl font-bold text-ink mt-1">{cancelledCount} ta</h3>
        </div>

        {/* Completed revenue */}
        <div className="p-5 rounded-2xl bg-darkCard border border-edge relative overflow-hidden group hover:border-amber-500/20 transition-all duration-300 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400"><DollarSign className="w-5 h-5" /></span>
            <span className="text-[10px] font-bold text-amber-400 uppercase">Kirim</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">Yakunlangan savdo summasi</p>
          <h3 className="text-xl font-bold text-amber-400 mt-1 truncate">{formatUzS(totalRevenue)}</h3>
        </div>
      </div>

      {/* Advanced Filter and Search Bar */}
      <div className="p-5 rounded-2xl bg-darkCard border border-edge flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-xl">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
            <Search className="w-4.5 h-4.5" />
          </span>
          <input
            type="text"
            placeholder="Buyurtma raqami, manzil yoki telefon orqali qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border border-edge hover:border-edge-strong focus:border-brand rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-ink placeholder-slate-500 focus:outline-none transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div className="flex items-center gap-2 bg-slate-900/50 border border-edge px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-ink font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-ink">Barcha holatlar</option>
              <option value="PENDING_GROUP" className="bg-slate-900 text-ink">Yangi (Pending / Kuryer kutilmoqda)</option>
              <option value="ACTIVE_GROUP" className="bg-slate-900 text-ink">Faol jarayondagilar (Yo'lda/Tayyorlanayotgan)</option>
              <option value="HISTORY_GROUP" className="bg-slate-900 text-ink">Yakunlanganlar / Rad qilinganlar</option>
              <option value="COMPLETED" className="bg-slate-900 text-ink">Yetkazib berilganlar</option>
              <option value="CANCELLED" className="bg-slate-900 text-ink">Bekor qilinganlar</option>
              <option value="REJECTED" className="bg-slate-900 text-ink">Rad etilganlar</option>
            </select>
          </div>

          {/* Payment filter */}
          <div className="flex items-center gap-2 bg-slate-900/50 border border-edge px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-transparent text-ink font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-ink">Barcha to'lovlar</option>
              <option value="CASH" className="bg-slate-900 text-ink">CASH</option>
              <option value="CLICK" className="bg-slate-900 text-ink">CLICK</option>
              <option value="PAYME" className="bg-slate-900 text-ink">Payme</option>
              <option value="UZCARD" className="bg-slate-900 text-ink">Uzcard</option>
            </select>
          </div>

          {/* Sort selection */}
          <div className="flex items-center gap-2 bg-slate-900/50 border border-edge px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-ink font-bold focus:outline-none cursor-pointer"
            >
              <option value="newest" className="bg-slate-900 text-ink">Yangi buyurtmalar birinchi</option>
              <option value="oldest" className="bg-slate-900 text-ink">Eski buyurtmalar birinchi</option>
              <option value="price-desc" className="bg-slate-900 text-ink">Summa: Kamayuvchi</option>
              <option value="price-asc" className="bg-slate-900 text-ink">Summa: O'suvchi</option>
            </select>
          </div>

          {/* Branch filter (Superadmin only) */}
          {userRole === 'superadmin' && filials.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-900/50 border border-edge px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 focus-within:border-brand transition">
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 text-brand" />
              <select
                value={selectedFilialUuid}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedFilialUuid(val);
                  fetchOrders(val);
                }}
                className="bg-transparent text-ink font-bold focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-ink">Barcha filiallar</option>
                {filials.map(filial => (
                  <option key={filial.uuid} value={filial.uuid} className="bg-slate-900 text-ink">
                    {filial.filial_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Table view of Orders */}
      <div className="p-6 rounded-2xl bg-darkCard border border-edge flex flex-col shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
            <p className="text-slate-400 font-semibold text-sm">Buyurtmalar ro'yxati yuklanmoqda...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 animate-pulse mb-3" />
            <h4 className="font-bold text-ink text-base">Ma'lumot yuklashda xatolik</h4>
            <p className="text-xs max-w-sm mt-1 mb-4">{error}</p>
            <button
              onClick={() => fetchOrders()}
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
                <tr className="border-b border-edge text-slate-500 text-xs uppercase tracking-wider font-bold">
                  <th className="pb-3.5 pl-2">ID</th>
                  <th className="pb-3.5">Sana / Vaqt</th>
                  <th className="pb-3.5">Telefon</th>
                  <th className="pb-3.5">Manzil</th>
                  <th className="pb-3.5 text-center">To'lov</th>
                  <th className="pb-3.5 text-center">Holat</th>
                  <th className="pb-3.5 text-right pr-2">Jami</th>
                  <th className="pb-3.5 text-center pr-2">Chek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge text-slate-300">
                {filteredAndSortedOrders.map((order) => (
                  <tr
                    key={order.uuid}
                    onClick={() => setSelectedOrder(order)}
                    className="hover:bg-overlay transition-colors cursor-pointer"
                  >
                    <td className="py-4 pl-2">
                      <span className="font-bold text-ink text-xs block">{order.order_number || `#${order.id}`}</span>
                      {order.delivery_type === 'DELIVERY' && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20 mt-1 inline-block">
                          Kuryer
                        </span>
                      )}
                      {order.delivery_type === 'PICKUP' && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-1 inline-block">
                          Olib ketish
                        </span>
                      )}
                      {order.delivery_type === 'DINE_IN' && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-1 inline-block">
                          {order.table_number ? `${order.table_number}-stol` : 'Stolda'}
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-xs font-semibold text-slate-400">{order.created_at}</td>
                    <td className="py-4 font-semibold text-slate-300 text-xs">{formatPhone(order.contact_phone)}</td>
                    <td className="py-4 text-xs max-w-[200px] truncate" title={order.address}>{order.address}</td>
                    <td className="py-4 text-center">{getPaymentBadge(order.payment)}</td>
                    <td className="py-4 text-center">{getStatusBadge(order.status)}</td>
                    <td className="py-4 text-right pr-2 font-bold text-ink text-xs">{formatUzS(order.total_price)}</td>
                    <td className="py-4 text-center pr-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintReceipt(order.uuid);
                        }}
                        disabled={printingUuid === order.uuid}
                        className="p-2 rounded-lg bg-overlay hover:bg-brand/10 border border-edge-strong hover:border-brand/20 text-slate-400 hover:text-brand transition cursor-pointer flex items-center justify-center mx-auto disabled:opacity-50"
                        title="Chekni chop etish"
                      >
                        {printingUuid === order.uuid ? (
                          <div className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                            Chekni chop etish
                          </div>
                        )}
                      </button>
                    </td>
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
                  className="p-4 rounded-xl border border-edge bg-slate-900/40 flex flex-col gap-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-ink text-xs">{order.order_number || `#${order.id}`}</span>
                      {order.delivery_type === 'DELIVERY' && (
                        <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/10">
                          Kuryer
                        </span>
                      )}
                      {order.delivery_type === 'PICKUP' && (
                        <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/10">
                          Olib ketish
                        </span>
                      )}
                      {order.delivery_type === 'DINE_IN' && (
                        <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                          {order.table_number ? `${order.table_number}-stol` : 'Stolda'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">{order.created_at.split(',')[1] || order.created_at}</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 truncate">{order.address}</p>
                    <p className="text-xs font-semibold text-slate-300 mt-1">{formatPhone(order.contact_phone)}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2.5 border-t border-edge">
                    <div className="flex items-center gap-1.5">
                      {getPaymentBadge(order.payment)}
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-xs">{formatUzS(order.total_price)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintReceipt(order.uuid);
                        }}
                        disabled={printingUuid === order.uuid}
                        className="p-1.5 rounded-lg bg-overlay border border-edge-strong text-slate-400 hover:text-ink transition cursor-pointer disabled:opacity-50"
                        title="Chekni chop etish"
                      >
                        {printingUuid === order.uuid ? (
                          <div className="w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                        ) : (
                          <Printer className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
            <ShoppingBag className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
            <h3 className="font-bold text-ink mb-1">Buyurtmalar topilmadi</h3>
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
            className="w-full max-w-lg bg-darkCard border border-edge-strong rounded-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto text-left space-y-6 animate-[slideUp_0.3s_ease-out]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-ink">Buyurtma {selectedOrder.order_number || `#${selectedOrder.id}`} Tafsilotlari</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedOrder.created_at}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingOrder(selectedOrder)}
                  className="px-3 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 text-brand border border-brand/20 transition cursor-pointer text-xs font-bold flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Tahrirlash
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-3 py-1.5 rounded-lg bg-overlay text-slate-400 hover:text-ink transition cursor-pointer text-xs font-bold"
                >
                  Yopish
                </button>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Joriy Holat:</span>
              {getStatusBadge(selectedOrder.status)}
            </div>

            {/* Dishes list items */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Buyurtma qilingan taomlar</h4>
              <div className="divide-y divide-edge max-h-60 overflow-y-auto pr-1">
                {(selectedOrder.items || []).map((item, idx) => {
                  const productName = item?.product_name || item?.name || item?.product?.name || "Noma'lum taom";
                  const productPrice = Number(item?.price_at_time_of_order || item?.product?.price || 0);
                  const quantity = item?.quantity || 0;
                  return (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-ink">{productName}</p>
                        <p className="text-xs text-slate-500">{formatUzS(productPrice)} x {quantity}</p>
                      </div>
                      <span className="font-semibold text-slate-300 shrink-0">
                        {formatUzS(productPrice * quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pricing Details */}
            <div className="pt-4 border-t border-edge space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Kuryer yetkazib berish xizmati</span>
                <span>{formatUzS(selectedOrder.delivery_fee)}</span>
              </div>
              <div className="flex justify-between font-bold text-ink text-base pt-1">
                <span>Jami to'lov summasi</span>
                <span className="text-emerald-400">{formatUzS(selectedOrder.total_price)}</span>
              </div>
            </div>

            {/* Client address details */}
            <div className="p-4 rounded-xl bg-slate-900 border border-edge space-y-3 text-xs">
              {selectedOrder.contact_name && (
                <p className="flex items-center gap-2 text-slate-300">
                  <User className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>Mijoz:</strong> {selectedOrder.contact_name}</span>
                </p>
              )}
              <p className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <span>
                  <strong>Manzil:</strong> {selectedOrder.address}
                  {selectedOrder.distance ? ` (${selectedOrder.distance} km)` : ''}
                </span>
              </p>
              {selectedOrder.contact_phone && (
                <p className="flex items-center gap-2 text-slate-300">
                  <Phone className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>Telefon:</strong> {formatPhone(selectedOrder.contact_phone)}</span>
                </p>
              )}
              {selectedOrder.courier_phone && (
                <p className="flex items-center gap-2 text-slate-300">
                  <Truck className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>Kuryer telefoni:</strong> {formatPhone(selectedOrder.courier_phone)}</span>
                </p>
              )}
              {selectedOrder.table_number && (
                <p className="flex items-center gap-2 text-slate-300">
                  <span className="w-4 h-4 text-brand shrink-0 flex items-center justify-center font-bold text-[10px]">T</span>
                  <span><strong>Stol raqami:</strong> {selectedOrder.table_number}-stol</span>
                </p>
              )}
              {selectedOrder.order_source && (
                <p className="flex items-center gap-2 text-slate-300">
                  <span className="w-4 h-4 text-brand shrink-0 flex items-center justify-center font-bold text-[10px]">S</span>
                  <span>
                    <strong>Manba:</strong>{' '}
                    {selectedOrder.order_source === 'WAITER' ? 'Ofitsiant' :
                     selectedOrder.order_source === 'CUSTOMER' ? 'Mijoz (App)' :
                     selectedOrder.order_source === 'PARTNER' ? 'Hamkor (Kassa)' : selectedOrder.order_source}
                  </span>
                </p>
              )}
              <div className="flex items-center justify-between text-slate-300 border-t border-edge pt-2">
                <p className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-brand shrink-0" />
                  <span>
                    <strong>To'lov turi:</strong> {selectedOrder.payment_method_display || selectedOrder.payment_method || selectedOrder.payment}
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedOrder.is_paid 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' 
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                  }`}>
                    {selectedOrder.is_paid ? "To'langan" : "To'lanmagan"}
                  </span>
                </div>
              </div>
              {selectedOrder.description && selectedOrder.description !== "Izoh yo'q" && (
                <div className="border-t border-edge pt-2 text-slate-400 italic">
                  <strong>Izoh:</strong> {selectedOrder.description}
                </div>
              )}
            </div>
            {selectedOrder.status === 'READY_FOR_PICKUP' && (
              <div className="pt-2">
                <button
                  onClick={() => handlePrintReceipt(selectedOrder.uuid)}
                  disabled={printingUuid === selectedOrder.uuid}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 shadow-lg shadow-amber-500/10"
                >
                  {printingUuid === selectedOrder.uuid ? (
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  <span>Chekni chop etish</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Order Modal Dialog */}
      {editingOrder && (
        <EditOrderModal
          orderUuid={editingOrder.uuid}
          orderNumber={editingOrder.order_number || `#${editingOrder.id}`}
          onClose={async (refresh) => {
            setEditingOrder(null);
            if (refresh) {
              try {
                const data = await ordersApi.getOrders();
                setOrders(data);
                const fresh = data.find((o: Order) => o.uuid === editingOrder.uuid);
                if (fresh) {
                  setSelectedOrder(fresh);
                }
              } catch (err) {
                console.error("Failed to refresh orders after edit:", err);
              }
            }
          }}
        />
      )}
    </div>
  );
};

export default AllOrdersPage;
