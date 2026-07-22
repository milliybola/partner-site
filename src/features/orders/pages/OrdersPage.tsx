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
  AlertCircle,
  Bell,
  RefreshCw,
  GripVertical,
  LayoutGrid,
  List,
  Printer,
  FileText,
  User,
  Truck,
  Utensils,
  Pencil
} from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import type { Order } from '../services/ordersApi';
import { printReceipt as printReceiptUtil, printPreCheck as printPreCheckUtil } from '../utils/printing';
import { useWebSocket } from '../../../core/hooks/useWebSocket';
import { filialApi } from '../services/filialApi';
import type { PartnerFilial } from '../services/filialApi';
import { tablesApi } from '../../tables/services/tablesApi';
import type { TableModel } from '../../tables/services/tablesApi';
import { STORAGE_KEYS } from '../../../core/config/constants';
import confetti from 'canvas-confetti';
import { EditOrderModal } from '../components/EditOrderModal';
import { useToast } from '../../../core/components/ToastProvider';

// Kanban Board Column Configurations (explicit class names for Tailwind compilation safety)
const KANBAN_COLUMNS: {
  status: Order['status'];
  label: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  hoverStyle: string;
  validBorder: string;
}[] = [
    {
      status: 'PENDING',
      label: "Milliy Go (Kuryer)",
      headerText: "text-amber-400 border-amber-500/20",
      badgeBg: "bg-amber-500/10",
      badgeText: "text-amber-400",
      hoverStyle: "border-amber-500 bg-brand/5 ring-amber-500/20",
      validBorder: "border-amber-500/40 border-dashed"
    },
    {
      status: 'ACCEPTED',
      label: "Qabul qilindi",
      headerText: "text-blue-400 border-blue-500/20",
      badgeBg: "bg-blue-500/10",
      badgeText: "text-blue-400",
      hoverStyle: "border-blue-500 bg-brand/5 ring-blue-500/20",
      validBorder: "border-blue-500/40 border-dashed"
    },
    {
      status: 'PREPARING',
      label: "Tayyorlanmoqda",
      headerText: "text-purple-400 border-purple-500/20",
      badgeBg: "bg-purple-500/10",
      badgeText: "text-purple-400",
      hoverStyle: "border-purple-500 bg-brand/5 ring-purple-500/20",
      validBorder: "border-purple-500/40 border-dashed"
    },
    {
      status: 'READY_FOR_PICKUP',
      label: "Tayyor",
      headerText: "text-emerald-400 border-emerald-500/20",
      badgeBg: "bg-emerald-500/10",
      badgeText: "text-emerald-400",
      hoverStyle: "border-emerald-500 bg-brand/5 ring-emerald-500/20",
      validBorder: "border-emerald-500/40 border-dashed"
    },
    {
      status: 'DELIVERING',
      label: "Yo'lda",
      headerText: "text-sky-400 border-sky-500/20",
      badgeBg: "bg-sky-500/10",
      badgeText: "text-sky-400",
      hoverStyle: "border-sky-500 bg-brand/5 ring-sky-500/20",
      validBorder: "border-sky-500/40 border-dashed"
    },
    {
      status: 'COMPLETED',
      label: "Tugallandi",
      headerText: "text-green-400 border-green-500/20",
      badgeBg: "bg-green-500/10",
      badgeText: "text-green-400",
      hoverStyle: "border-green-500 bg-brand/5 ring-green-500/20",
      validBorder: "border-green-500/40 border-dashed"
    }
  ];

const getValidTargets = (status: Order['status']): Order['status'][] => {
  switch (status) {
    case 'PENDING':
    case 'SEARCHING_COURIER':
      return [];
    case 'ACCEPTED':
      return ['PREPARING', 'CANCELLED'];
    case 'PREPARING':
      return ['ACCEPTED', 'READY_FOR_PICKUP'];
    case 'READY_FOR_PICKUP':
      return ['PREPARING'];
    case 'DELIVERING':
      return ['READY_FOR_PICKUP', 'COMPLETED'];
    default:
      return [];
  }
};

// Kanban Board Card Component
interface KanbanCardProps {
  order: Order;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onOpenPayment?: (order: Order) => void;
  isSelected: boolean;
  formatUzS: (amount: number | string | null | undefined) => string;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  onDragStart,
  onDragEnd,
  onClick,
  onOpenPayment,
  isSelected,
  formatUzS
}) => {
  const isDraggable = order.status !== 'PENDING' && order.status !== 'SEARCHING_COURIER' && order.status !== 'COMPLETED' && order.status !== 'DELIVERED';

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      className={`p-4 rounded-xl border text-left transition-all duration-200 group hover:shadow-lg hover:-translate-y-0.5 ${isDraggable
        ? 'cursor-grab active:cursor-grabbing'
        : 'cursor-default'
        } ${isSelected
          ? 'bg-brand/10 border-brand shadow-md shadow-brand/5'
          : 'bg-darkCard border-edge hover:border-edge-strong'
        }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-400 transition-colors shrink-0">
            {order.order_number || `#${order.id}`}
          </span>
          {order.delivery_type === 'DELIVERY' && (
            <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              Kuryer
            </span>
          )}
          {order.delivery_type === 'PICKUP' && (
            <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              Olib ketish
            </span>
          )}
          {order.delivery_type === 'DINE_IN' && (
            <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              {order.table_number ? `${order.table_number}-stol` : 'Stolda'}
            </span>
          )}
        </div>
        {isDraggable && (
          <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
        )}
      </div>

      <h4 className="font-bold text-ink text-sm tracking-tight">{formatUzS(order.total_price)}</h4>

      <div className="mt-2.5 space-y-1 text-[11px] text-slate-400">
        <p className="flex items-center gap-1 truncate">
          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="truncate">{order.address}</span>
        </p>
        <p className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>{order.created_at.split(',')[1] || order.created_at}</span>
        </p>
      </div>

      <div className="mt-3 pt-2 border-t border-edge space-y-2">
        {/* Row: item count + Batafsil */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
            {(order.items || []).length} ta xil
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="text-[10px] font-bold text-brand group-hover:translate-x-0.5 transition-transform cursor-pointer"
          >
            Batafsil →
          </button>
        </div>
        {/* Full-width To'lov button */}
        {order.status === 'READY_FOR_PICKUP' && (order.delivery_type === 'PICKUP' || order.delivery_type === 'DINE_IN') && onOpenPayment && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenPayment(order);
            }}
            className="w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[11px] transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <CreditCard className="w-3 h-3" />
            To'lov qilish
          </button>
        )}
      </div>
    </div>
  );
};

const OrdersPage: React.FC = () => {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs & Views States
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'active' | 'history'>('pending');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'ALL' | 'DELIVERY' | 'PICKUP' | 'DINE_IN'>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printingUuid, setPrintingUuid] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Drag & Drop States
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [isDragOverBottomZone, setIsDragOverBottomZone] = useState<'complete' | 'reject' | null>(null);

  // Real-time toast alerts
  const [newOrderToast, setNewOrderToast] = useState<{
    show: boolean;
    message: string;
    orderUuid: string;
    price: string | number;
  } | null>(null);

  const [statusUpdateToast, setStatusUpdateToast] = useState<{
    show: boolean;
    message: string;
    orderUuid: string;
    statusDisplay?: string;
  } | null>(null);

  // Payment Modal State
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CLICK' | 'PAYME' | 'UZCARD'>('CASH');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [partnerUuid, setPartnerUuid] = useState<string | undefined>(undefined);
  const [userFilialUuid, setUserFilialUuid] = useState<string | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);

  // Filial / Role States
  const [userRole, setUserRole] = useState<'superadmin' | 'manager'>('superadmin');
  const [selectedFilialUuid, setSelectedFilialUuid] = useState<string>('');
  const [filials, setFilials] = useState<PartnerFilial[]>([]);

  // Tables (used to free up a table's status once its dine-in order is paid)
  const [tables, setTables] = useState<TableModel[]>([]);

  useEffect(() => {
    tablesApi.getTables()
      .then(res => setTables(res))
      .catch(err => console.error("Failed to fetch tables in OrdersPage:", err));
  }, []);

  // Mark the table for a dine-in order as free again once the order is paid/completed
  const freeTableForOrder = useCallback((order: Order | undefined | null) => {
    if (!order || order.delivery_type !== 'DINE_IN' || !order.table_number) return;
    const table = tables.find((t) => t.table_number === order.table_number);
    if (!table) return;
    tablesApi.updateTableStatus(table.uuid, 'AVAILABLE').catch((err) => {
      console.error("Failed to free table after order completion:", err);
    });
  }, [tables]);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      const parsed = JSON.parse(data);
      setPartnerUuid(parsed.uuid);

      // Determine filial UUID from partner data
      const extractedFilialUuid = parsed.current_filial?.uuid ||
        parsed.home_filial?.uuid ||
        parsed.current_filial_uuid ||
        parsed.home_filial_uuid;
      setUserFilialUuid(extractedFilialUuid);

      if (parsed.role === 'manager') {
        setUserRole('manager');
      } else {
        setUserRole('superadmin');
        filialApi.getFilials()
          .then(res => setFilials(res))
          .catch(err => console.error("Failed to fetch filials in OrdersPage:", err));
      }
    }
    setToken(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN));
  }, []);

  const fetchOrders = useCallback(async (showLoading = true, branchUuid?: string) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const activeBranchUuid = branchUuid !== undefined ? branchUuid : selectedFilialUuid;
      const data = await ordersApi.getOrders(activeBranchUuid || undefined);
      setOrders(data);
    } catch (err: any) {
      console.error("Failed to load orders from API:", err);
      setError(
        err.response?.data?.message ||
        err.message ||
        "Buyurtmalarni yuklashda xatolik yuz berdi. Internet aloqasini tekshiring."
      );
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handlePrintReceipt = useCallback(async (orderUuid: string) => {
    setPrintingUuid(orderUuid);
    try {
      await printReceiptUtil(orderUuid);
    } catch (err: any) {
      console.error("Chek chop etishda xatolik:", err);
      toast.error("Chek ma'lumotlarini yuklashda xatolik yuz berdi.");
    } finally {
      setPrintingUuid(null);
    }
  }, []);

  // Pre-check (Preliminary receipt) — simple format matching the image
  const handlePrintPreCheck = useCallback((order: Order) => {
    printPreCheckUtil(order);
  }, []);

  // Handle incoming Websocket order alerts
  const handleNewOrderAlert = useCallback((event: any) => {
    const orderData = event.order_data;
    if (!orderData) return;

    if (event.type === 'new_order_alert') {
      // Visual Slide-in toast
      setNewOrderToast({
        show: true,
        message: event.message || 'Yangi buyurtma keldi!',
        orderUuid: orderData.uuid,
        price: orderData.total_price
      });

      // Auto-clear toast after 8 seconds
      setTimeout(() => {
        setNewOrderToast((current) => current?.orderUuid === orderData.uuid ? null : current);
      }, 8000);
    } else if (event.type === 'order_status_update') {
      // Visual Slide-in status update toast
      setStatusUpdateToast({
        show: true,
        message: event.message || `Buyurtma holati: ${orderData.status_display || orderData.status}`,
        orderUuid: orderData.uuid,
        statusDisplay: orderData.status_display || orderData.status
      });

      // Auto-clear toast after 8 seconds
      setTimeout(() => {
        setStatusUpdateToast((current) => current?.orderUuid === orderData.uuid ? null : current);
      }, 8000);
    }

    // Refresh orders list silently
    fetchOrders(false);
  }, [fetchOrders]);

  // Set up WebSocket Hook
  const { isConnected } = useWebSocket(
    partnerUuid,
    token,
    handleNewOrderAlert,
    userFilialUuid
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
      if (nextStatus === 'READY_FOR_PICKUP') {
        const targetOrder = orders.find((o) => o.uuid === orderUuid);
        if (targetOrder && targetOrder.delivery_type === 'DELIVERY') {
          if (localStorage.getItem('milliygo_auto_print') === 'true') {
            handlePrintReceipt(orderUuid);
          }
        }
      }
      if (nextStatus === 'COMPLETED') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
    } catch (err) {
      toast.error("Buyurtma holatini yangilashda xatolik yuz berdi.");
    }
  };

  const handleCompleteOrder = async (orderUuid: string) => {
    try {
      await ordersApi.completeOrder(orderUuid);
      // Refresh list
      fetchOrders(false);
      // Update drawer if open
      if (selectedOrder && selectedOrder.uuid === orderUuid) {
        setSelectedOrder(null);
      }

      // Free up the dine-in table now that the order is settled
      freeTableForOrder(orders.find((o) => o.uuid === orderUuid));

      // Auto-print receipt on completion
      handlePrintReceipt(orderUuid);

      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error("Failed to complete order:", err);
      toast.error(err.response?.data?.message || err.message || "Buyurtmani yakunlashda xatolik yuz berdi.");
    }
  };

  // Open payment modal: pre-fill with current order payment info
  const handleOpenPaymentModal = (order: Order) => {
    setPaymentModalOrder(order);
    setPaymentMethod((order.payment_method as any) || 'CASH');
  };

  // Save payment info then complete the order
  const handleSubmitPayment = async () => {
    if (!paymentModalOrder) return;
    setPaymentSaving(true);
    try {
      // 1. To'lov usulini belgilab, to'langan deb qayd etish
      await ordersApi.markOrderPaid(paymentModalOrder.uuid, {
        payment_method: paymentMethod,
        is_paid: true,
      });
      // 2. Buyurtmani COMPLETED statusga o'tkazish
      await ordersApi.completeOrder(paymentModalOrder.uuid);

      // Free up the dine-in table now that payment is confirmed
      freeTableForOrder(paymentModalOrder);

      setPaymentModalOrder(null);
      if (selectedOrder && selectedOrder.uuid === paymentModalOrder.uuid) {
        setSelectedOrder(null);
      }
      fetchOrders(false);
      handlePrintReceipt(paymentModalOrder.uuid);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error('Payment submit failed:', err);
      toast.error(err.response?.data?.message || err.message || "To'lov ma'lumotlarini saqlashda xatolik yuz berdi.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const getFilteredOrdersByDeliveryType = useCallback((orderList: Order[]) => {
    if (orderTypeFilter === 'ALL') return orderList;
    return orderList.filter((o) => o.delivery_type === orderTypeFilter);
  }, [orderTypeFilter]);

  const getFilteredOrders = () => {
    const typeFiltered = getFilteredOrdersByDeliveryType(orders);
    switch (activeTab) {
      case 'pending':
        return typeFiltered.filter((o) => o.status === 'PENDING' || o.status === 'SEARCHING_COURIER');
      case 'active':
        return typeFiltered.filter((o) => ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING'].includes(o.status));
      case 'history':
        return typeFiltered.filter((o) => ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'].includes(o.status));
      case 'all':
      default:
        return typeFiltered;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">Kutilmoqda</span>;
      case 'SEARCHING_COURIER':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">Kuryer qidirilmoqda</span>;
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

  const formatUzS = (amount: number | string | null | undefined) => {
    const num = Number(amount);
    if (isNaN(num)) {
      return "0 UZS";
    }
    return num.toLocaleString('uz-UZ') + " UZS";
  };

  const typeFilteredOrders = getFilteredOrdersByDeliveryType(orders);
  const filteredOrders = getFilteredOrders();
  const pendingCount = typeFilteredOrders.filter((o) => o.status === 'PENDING' || o.status === 'SEARCHING_COURIER').length;
  const activeCount = typeFilteredOrders.filter((o) => ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING'].includes(o.status)).length;

  return (
    <div className="space-y-3 font-Outfit relative min-h-[80vh]">
      {/* Toast Alert popup*/}
      {newOrderToast && (
        <div className="fixed top-24 right-6 z-50 w-full max-w-sm p-4 rounded-xl bg-brand text-white shadow-2xl border border-edge-strong flex gap-3 animate-[slide-in_0.3s_ease-out]">
          <span className="p-2.5 rounded-lg bg-overlay-strong text-ink shrink-0 self-start">
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
                className="px-3 py-1.5 rounded-lg bg-transparent hover:bg-overlay-strong text-ink font-semibold text-xs transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Toast popup */}
      {statusUpdateToast && (
        <div className="fixed top-24 right-6 z-50 w-full max-w-sm p-4 rounded-xl bg-slate-800 text-ink shadow-2xl border border-edge-strong flex gap-3 animate-[slide-in_0.3s_ease-out]">
          <span className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400 shrink-0 self-start">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </span>
          <div className="flex-1">
            <h4 className="font-bold text-base">Buyurtma holati yangilandi</h4>
            <p className="text-xs text-slate-350 mt-0.5">{statusUpdateToast.message}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  const targetOrd = orders.find((o) => o.uuid === statusUpdateToast.orderUuid);
                  if (targetOrd) setSelectedOrder(targetOrd);
                  setStatusUpdateToast(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
              >
                Ko'rish
              </button>
              <button
                onClick={() => setStatusUpdateToast(null)}
                className="px-3 py-1.5 rounded-lg bg-transparent hover:bg-overlay-strong text-ink font-semibold text-xs transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
  

      {/* Order Type Filter Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

        <div className="flex flex-wrap items-center gap-2 p-1 bg-overlay rounded-2xl border border-edge-strong w-fit">
          <button
            onClick={() => setOrderTypeFilter('ALL')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer border ${orderTypeFilter === 'ALL'
                ? 'bg-brand text-white border-brand shadow-lg shadow-brand/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-overlay border-transparent'
              }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Barchasi ({orders.length})</span>
          </button>
          <button
            onClick={() => setOrderTypeFilter('DELIVERY')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer border ${orderTypeFilter === 'DELIVERY'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-lg shadow-blue-500/5'
                : 'text-slate-400 hover:text-slate-200 hover:bg-overlay border-transparent'
              }`}
          >
            <Truck className="w-4 h-4" />
            <span>Yetkazib berish ({orders.filter(o => o.delivery_type === 'DELIVERY').length})</span>
          </button>
          <button
            onClick={() => setOrderTypeFilter('PICKUP')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer border ${orderTypeFilter === 'PICKUP'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/5'
                : 'text-slate-400 hover:text-slate-200 hover:bg-overlay border-transparent'
              }`}
          >
            <Clock className="w-4 h-4" />
            <span>Olib ketish ({orders.filter(o => o.delivery_type === 'PICKUP').length})</span>
          </button>
          <button
            onClick={() => setOrderTypeFilter('DINE_IN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer border ${orderTypeFilter === 'DINE_IN'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                : 'text-slate-400 hover:text-slate-200 hover:bg-overlay border-transparent'
              }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Stollar ({orders.filter(o => o.delivery_type === 'DINE_IN').length})</span>
          </button>
        </div>
         <div className="flex flex-wrap items-center gap-3">
          {/* WebSocket indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-overlay border border-edge-strong text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-300">{isConnected ? 'WS Bog\'langan' : 'WS Ajralgan'}</span>
          </div>

          {/* Branch filter (Superadmin only) */}
          {userRole === 'superadmin' && filials.length > 0 && (
            <div className="flex items-center gap-1 bg-overlay border border-edge-strong rounded-xl px-2 shrink-0">
              <span className="text-[10px] uppercase font-bold text-slate-500 pl-1">Filial:</span>
              <select
                value={selectedFilialUuid}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedFilialUuid(val);
                  fetchOrders(true, val);
                }}
                className="bg-transparent border-0 text-xs font-bold text-brand focus:ring-0 cursor-pointer pr-8 py-1.5 focus:outline-none"
              >
                <option value="" className="bg-darkCard text-slate-300">Barchasi</option>
                {filials.map(filial => (
                  <option key={filial.uuid} value={filial.uuid} className="bg-darkCard text-ink">
                    {filial.filial_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* View Toggle */}
          <div className="flex bg-overlay p-1 rounded-xl border border-edge-strong shrink-0">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'kanban'
                ? 'bg-brand text-white shadow-lg shadow-brand/10'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'list'
                ? 'bg-brand text-white shadow-lg shadow-brand/10'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Ro'yxat</span>
            </button>
          </div>
        </div>
      </div>


      {/* Main content container (full width) */}
      <div className="w-full space-y-6">
        {viewMode === 'list' ? (
          <>
            {/* Filter Tabs (Only shown in List view) */}
            <div className="flex items-center border-b border-edge gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${activeTab === 'pending' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
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
                className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${activeTab === 'active' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
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
                className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${activeTab === 'history' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <span>Tarix</span>
                {activeTab === 'history' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
              </button>

              <button
                onClick={() => setActiveTab('all')}
                className={`px-5 py-3 font-semibold text-sm transition relative whitespace-nowrap cursor-pointer ${activeTab === 'all' ? 'text-brand' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <span>Barchasi</span>
                {activeTab === 'all' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
              </button>
            </div>

            {/* List View Cards */}
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-3 border-brand/20 border-t-brand rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
                <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
                <h4 className="font-bold text-ink text-base mb-1">Xatolik yuz berdi</h4>
                <p className="text-sm max-w-sm mb-4 text-slate-400">{error}</p>
                <button
                  onClick={() => fetchOrders()}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center mx-auto"
                >
                  <RefreshCw className="w-4 h-4 animate-[spin_4s_linear_infinite]" />
                  <span>Qayta urinish</span>
                </button>
              </div>
            ) : filteredOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders.map((order) => (
                  <div
                    key={order.uuid}
                    onClick={() => setSelectedOrder(order)}
                    className={`p-5 rounded-2xl border text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${selectedOrder?.uuid === order.uuid
                      ? 'bg-brand/5 border-brand'
                      : 'bg-darkCard border-edge hover:border-edge-strong'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">{order.order_number || `#${order.id}`}</span>
                        {order.delivery_type === 'DELIVERY' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Yetkazib berish
                          </span>
                        )}
                        {order.delivery_type === 'PICKUP' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Olib ketish
                          </span>
                        )}
                        {order.delivery_type === 'DINE_IN' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Stolda {order.table_number ? `(${order.table_number}-stol)` : ''}
                          </span>
                        )}
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <h4 className="font-bold text-ink text-lg">{formatUzS(order.total_price)}</h4>

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

                    <div className="mt-4 pt-3 border-t border-edge flex items-center justify-between">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {(order.items || []).length} ta xil taom
                      </span>
                      {order.status === 'READY_FOR_PICKUP' && (order.delivery_type === 'PICKUP' || order.delivery_type === 'DINE_IN') ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteOrder(order.uuid);
                          }}
                          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition cursor-pointer"
                        >
                          Mijozga berish
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-brand">Batafsil →</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-darkCard/50 border border-dashed border-edge rounded-2xl">
                <ShoppingBag className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
                <h3 className="font-bold text-ink mb-1">Buyurtmalar mavjud emas</h3>
                <p className="text-sm px-6 text-center">Ushbu filtr bo'yicha hech qanday buyurtma topilmadi</p>
              </div>
            )}
          </>
        ) : (
          /* Kanban Board View */
          <div className="flex gap-4 overflow-x-auto pb-4 pt-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-thin">
            {loading ? (
              <div className="flex-1 flex justify-center items-center py-20">
                <div className="w-8 h-8 border-3 border-brand/20 border-t-brand rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
                <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
                <h4 className="font-bold text-ink text-base mb-1">Xatolik yuz berdi</h4>
                <p className="text-sm max-w-sm mb-4 text-slate-400">{error}</p>
                <button
                  onClick={() => fetchOrders()}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center"
                >
                  <RefreshCw className="w-4 h-4 animate-[spin_4s_linear_infinite]" />
                  <span>Qayta urinish</span>
                </button>
              </div>
            ) : (
              KANBAN_COLUMNS.map((col) => {
                const colOrders = getFilteredOrdersByDeliveryType(orders).filter(o =>
                  col.status === 'PENDING'
                    ? (o.status === 'PENDING' || o.status === 'SEARCHING_COURIER')
                    : col.status === 'COMPLETED'
                      ? (o.status === 'COMPLETED' || o.status === 'DELIVERED')
                      : o.status === col.status
                );
                const isValidDropTarget = draggedOrder && getValidTargets(draggedOrder.status).includes(col.status);
                const isHovered = dragOverCol === col.status;

                return (
                  <div
                    key={col.status}
                    onDragOver={(e) => {
                      if (isValidDropTarget) {
                        e.preventDefault();
                      }
                    }}
                    onDragEnter={() => {
                      if (isValidDropTarget) {
                        setDragOverCol(col.status);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverCol === col.status) {
                        setDragOverCol(null);
                      }
                    }}
                    onDrop={() => {
                      if (draggedOrder && isValidDropTarget) {
                        if (col.status === 'COMPLETED') {
                          handleCompleteOrder(draggedOrder.uuid);
                        } else {
                          handleUpdateStatus(draggedOrder.uuid, col.status);
                        }
                      }
                      setDragOverCol(null);
                    }}
                    className={`flex-1 min-w-[270px] max-w-[320px] flex flex-col h-[70vh] rounded-2xl border transition-all duration-300 ${isValidDropTarget
                      ? isHovered
                        ? `${col.hoverStyle} scale-[1.01] shadow-lg`
                        : `bg-slate-900/40 ${col.validBorder} animate-pulse`
                      : draggedOrder
                        ? 'opacity-30 border-edge bg-slate-900/10'
                        : 'border-edge bg-darkCard/50'
                      }`}
                  >
                    {/* Column Header */}
                    <div className={`p-4 rounded-t-2xl border-b flex items-center justify-between bg-darkCard ${col.headerText} font-bold text-sm tracking-wide`}>
                      <h3 className="truncate">{col.label}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${col.badgeBg} ${col.badgeText}`}>
                        {colOrders.length}
                      </span>
                    </div>

                    {/* Column Content */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                      {colOrders.length > 0 ? (
                        colOrders.map((order) => (
                          <KanbanCard
                            key={order.uuid}
                            order={order}
                            formatUzS={formatUzS}
                            onDragStart={() => {
                              setDraggedOrder(order);
                              setIsDragging(true);
                            }}
                            onDragEnd={() => {
                              setDraggedOrder(null);
                              setIsDragging(false);
                            }}
                            onClick={() => setSelectedOrder(order)}
                            onOpenPayment={handleOpenPaymentModal}
                            isSelected={selectedOrder?.uuid === order.uuid}
                          />
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                          <ShoppingBag className="w-10 h-10 stroke-[1.2] mb-2 text-slate-700" />
                          <p className="text-xs">Buyurtmalar yo'q</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Selected Order Detail Modal */}
      {selectedOrder && (
        <div
          onClick={() => setSelectedOrder(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-darkCard border border-edge-strong rounded-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto text-left space-y-6 animate-[slideUp_0.3s_ease-out]"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-ink">Buyurtma {selectedOrder.order_number || `#${selectedOrder.id}`}</h3>
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
                  className="p-2 rounded-lg bg-overlay text-slate-400 hover:text-ink transition cursor-pointer text-xs font-bold"
                >
                  Yopish
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Holat:</span>
              {getStatusBadge(selectedOrder.status)}
            </div>

            {/* Items List */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Taomlar ro'yxati</h4>
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

            {/* Price Breakdown */}
            <div className="pt-4 border-t border-edge space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Yetkazib berish</span>
                <span>{formatUzS(selectedOrder.delivery_fee)}</span>
              </div>
              <div className="flex justify-between font-bold text-ink text-base pt-1">
                <span>Jami summa</span>
                <span className="text-emerald-400">{formatUzS(selectedOrder.total_price)}</span>
              </div>
            </div>

            {/* Delivery and Customer details */}
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
                  <PhoneIcon className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>Telefon:</strong> {selectedOrder.contact_phone}</span>
                </p>
              )}
              {selectedOrder.courier_phone && (
                <p className="flex items-center gap-2 text-slate-300">
                  <Truck className="w-4 h-4 text-brand shrink-0" />
                  <span><strong>Kuryer telefoni:</strong> {selectedOrder.courier_phone}</span>
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
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedOrder.is_paid
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

            {/* Print buttons row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Pre-chek button */}
              <button
                onClick={() => handlePrintPreCheck(selectedOrder)}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-edge-strong text-ink font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-slate-300" />
                <span>Pre-chek</span>
              </button>

              {/* Full receipt button */}
              <button
                onClick={() => handlePrintReceipt(selectedOrder.uuid)}
                disabled={printingUuid === selectedOrder.uuid}
                className="py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 shadow-lg shadow-amber-500/10"
              >
                {printingUuid === selectedOrder.uuid ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                <span>Chek chop etish</span>
              </button>
            </div>

            {/* Context Actions based on status */}
            <div className="space-y-2.5">
              {(selectedOrder.status === 'PENDING' || selectedOrder.status === 'SEARCHING_COURIER') && (
                <div className="p-3 text-center rounded-xl bg-overlay border border-edge text-slate-400 text-xs">
                  Yangi buyurtmalarni faqat o'qish mumkin
                </div>
              )}

              {selectedOrder.status === 'ACCEPTED' && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.uuid, 'PREPARING');
                      setSelectedOrder(null);
                    }}
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Tayyorlashni boshlash
                  </button>
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.uuid, 'CANCELLED');
                      setSelectedOrder(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/10 transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    Bekor qilish
                  </button>
                </div>
              )}

              {selectedOrder.status === 'PREPARING' && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.uuid, 'READY_FOR_PICKUP');
                      setSelectedOrder(null);
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Tayyor deb belgilash
                  </button>
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.uuid, 'ACCEPTED');
                      setSelectedOrder(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-overlay hover:bg-overlay-strong text-slate-300 font-bold text-xs border border-edge-strong transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Orqaga qaytarish (Qabul qilindi)
                  </button>
                </div>
              )}

              {selectedOrder.status === 'READY_FOR_PICKUP' && (
                <div className="space-y-2">
                  {(selectedOrder.delivery_type === 'PICKUP' || selectedOrder.delivery_type === 'DINE_IN') && (
                    <button
                      onClick={() => {
                        handleOpenPaymentModal(selectedOrder);
                        setSelectedOrder(null);
                      }}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 shadow-lg shadow-emerald-600/10"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mijozga berish
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.uuid, 'PREPARING');
                      setSelectedOrder(null);
                    }}
                    className="w-full py-3 rounded-xl bg-overlay hover:bg-overlay-strong text-slate-300 font-bold text-xs border border-edge-strong transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Orqaga qaytarish (Tayyorlanmoqda)
                  </button>
                </div>
              )}

              {selectedOrder.status === 'DELIVERING' && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      handleCompleteOrder(selectedOrder.uuid);
                    }}
                    className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Tugallandi deb belgilash
                  </button>
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.uuid, 'READY_FOR_PICKUP');
                      setSelectedOrder(null);
                    }}
                    className="w-full py-3 rounded-xl bg-overlay hover:bg-overlay-strong text-slate-300 font-bold text-xs border border-edge-strong transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Orqaga qaytarish (Tayyor)
                  </button>
                </div>
              )}

              {['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'].includes(selectedOrder.status) && (
                <div className="p-3 text-center rounded-xl bg-overlay border border-edge text-slate-400 text-xs">
                  Buyurtma faoliyati yakunlangan
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Payment Modal ─────────────────────────────────────── */}
      {paymentModalOrder && (
        <div
          onClick={() => !paymentSaving && setPaymentModalOrder(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-darkCard border border-edge-strong rounded-2xl shadow-2xl flex flex-col animate-[slideUp_0.25s_ease-out] overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-edge flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-ink flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-400" />
                  To'lov
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {paymentModalOrder.order_number || `#${paymentModalOrder.id}`}
                  {paymentModalOrder.table_number ? ` · ${paymentModalOrder.table_number}-stol` : ''}
                </p>
              </div>
              <button
                onClick={() => !paymentSaving && setPaymentModalOrder(null)}
                disabled={paymentSaving}
                className="p-2 rounded-lg bg-overlay hover:bg-overlay-strong text-slate-400 hover:text-ink transition cursor-pointer disabled:opacity-40"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Total amount display */}
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between">
                <span className="text-sm text-slate-400">Jami summa</span>
                <span className="text-xl font-bold text-emerald-400">
                  {Number(paymentModalOrder.total_price).toLocaleString('uz-UZ')} UZS
                </span>
              </div>

              {/* Payment method selector */}
              <div className="space-y-3">
                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider block">
                  To'lov turi
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'CASH', label: 'Naqd pul', icon: '💵' },
                    { value: 'CLICK', label: 'Click', icon: '📱' },
                    { value: 'PAYME', label: 'Payme', icon: '💳' },
                    { value: 'UZCARD', label: 'Uzcard', icon: '🏦' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setPaymentMethod(opt.value)}
                      className={`py-5 px-4 rounded-xl border-2 font-bold text-base transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${paymentMethod === opt.value
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/10 scale-[1.02]'
                          : 'border-edge-strong bg-overlay text-slate-400 hover:border-edge-strong hover:text-slate-200'
                        }`}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-5 border-t border-edge grid grid-cols-2 gap-3">
              <button
                onClick={() => !paymentSaving && setPaymentModalOrder(null)}
                disabled={paymentSaving}
                className="py-3 rounded-xl bg-overlay hover:bg-overlay-strong text-slate-300 font-bold text-sm transition cursor-pointer border border-edge-strong disabled:opacity-40"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmitPayment}
                disabled={paymentSaving}
                className="py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paymentSaving ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {paymentSaving ? 'Saqlanmoqda...' : 'Tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Order Modal Dialog ─────────────────────────────── */}
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

      {/* Drag & Drop Bottom Zone (Sliding up when dragging is active) */}
      {isDragging && draggedOrder && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 flex gap-4 animate-[slideUp_0.3s_ease-out]">
          {/* Reject/Cancel zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDragEnter={() => setIsDragOverBottomZone('reject')}
            onDragLeave={() => setIsDragOverBottomZone(null)}
            onDrop={() => {
              const nextStatus = (draggedOrder.status === 'PENDING' || draggedOrder.status === 'SEARCHING_COURIER') ? 'REJECTED' : 'CANCELLED';
              handleUpdateStatus(draggedOrder.uuid, nextStatus);
              setIsDragOverBottomZone(null);
            }}
            className={`flex-1 py-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${isDragOverBottomZone === 'reject'
              ? 'bg-rose-500/20 border-rose-500 shadow-lg shadow-rose-500/10 scale-105'
              : 'bg-slate-950/95 border-rose-500/40 text-rose-400 border-dashed'
              }`}
          >
            <XCircle className="w-6 h-6 text-rose-400 animate-pulse" />
            <span className="text-xs font-bold text-ink">
              {(draggedOrder.status === 'PENDING' || draggedOrder.status === 'SEARCHING_COURIER') ? "Rad etish" : "Bekor qilish"}
            </span>
            <span className="text-[10px] text-slate-400">Bu yerga tashlang</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
