import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ordersApi } from '../../services/ordersApi';
import type { Order, PaymentPart } from '../../services/ordersApi';
import { filialApi } from '../../services/filialApi';
import type { PartnerFilial } from '../../services/filialApi';
import { tablesApi } from '../../../tables/services/tablesApi';
import type { TableModel } from '../../../tables/services/tablesApi';
import { couriersApi } from '../../../staff/services/couriersApi';
import type { CourierModel } from '../../../staff/services/couriersApi';
import { printReceipt as printReceiptUtil, printPreCheck as printPreCheckUtil } from '../../utils/printing';
import { EditOrderModal } from '../EditOrderModal';
import { useToast } from '../../../../core/components/ToastProvider';
import { useConfirm } from '../../../../core/components/ConfirmProvider';
import { useRejectReason } from '../../../../core/components/RejectReasonProvider';
import { getPartner, isManager, isShop } from '../../../../core/lib/session';
import { getErrorMessage } from '../../../../core/lib/errors';
import { formatMoney } from '../../../../core/lib/format';
import { OrderDetailSheet } from './OrderDetailSheet';
import { PaymentSheet } from './PaymentSheet';
import type { PaymentMethod } from './PaymentSheet';
import { CourierPickerSheet } from './CourierPickerSheet';
import { WaiterPickSheet } from './WaiterPickSheet';
import type { WaiterPickMode } from './WaiterPickSheet';
import { needsWaiter } from '../../services/ordersApi';
import { HANDED_NOTE, orderNo } from './actions';
import type { ActionContext, QueueAction } from './actions';

interface Options {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  /** Ro'yxatni serverdan jim yangilash */
  refresh: () => void;
  now: number;
  skipPreparing: boolean;
  fastMode?: boolean;
  /** Xodim buyurtmaga tegdi (yangi belgisini olib tashlash uchun) */
  onTouched?: (uuid: string) => void;
}

/**
 * Buyurtma bilan ishlash — bitta joyda: holat tugmalari, to'lov, kuryer, tahrir, chek va
 * tafsilot oynasi. Buyurtmalar navbati ham, Sotuv sahifasi ham shuni ishlatadi — ikki xil
 * mantiq yuritilmaydi.
 */
export function useOrderActions({ orders, setOrders, refresh, now, skipPreparing, fastMode, onTouched }: Options) {
  const toast = useToast();
  const confirm = useConfirm();
  const askRejectReason = useRejectReason();
  const partner = getPartner();
  const manager = isManager(partner);
  const shop = isShop(partner);
  const partnerUuid = partner?.uuid;

  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  /** Stol buyurtmasi: QR tasdiqlash / «Tayyor» / almashtirishda ofitsiant tanlanadi */
  const [waiterPick, setWaiterPick] = useState<{ order: Order; mode: WaiterPickMode } | null>(null);
  const pickWaiter = (order: Order, mode: WaiterPickMode) => {
    touch(order.uuid);
    setWaiterPick({ order, mode });
  };
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [printingUuid, setPrintingUuid] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [courierOrder, setCourierOrder] = useState<Order | null>(null);
  /** «Tayyor» bosilganda kuryer yo'q edi: kuryer biriktirilgach buyurtma tayyor deb belgilanadi */
  const readyAfterAssign = useRef(false);
  const [couriers, setCouriers] = useState<CourierModel[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [assigningCourierUuid, setAssigningCourierUuid] = useState<string | null>(null);
  const [filials, setFilials] = useState<PartnerFilial[]>([]);
  const [tables, setTables] = useState<TableModel[]>([]);

  useEffect(() => {
    couriersApi
      .getCouriers()
      .then(setCouriers)
      .catch(() => setCouriers([]));
    if (!shop) {
      tablesApi
        .getTables()
        .then(setTables)
        .catch(() => setTables([]));
    }
    if (!manager) {
      filialApi
        .getFilials()
        .then(setFilials)
        .catch(() => setFilials([]));
    }
  }, [manager, shop]);

  const ctx: ActionContext = { skipPreparing, fastMode, hasOwnCouriers: couriers.length > 0, shop };
  const touch = (uuid: string) => onTouched?.(uuid);
  const selectedOrder = selectedUuid ? orders.find((o) => o.uuid === selectedUuid) || null : null;

  const freeTableForOrder = useCallback(
    (order: Order | undefined | null) => {
      if (!order || order.delivery_type !== 'DINE_IN' || !order.table_number) return;
      const table = tables.find((t) => t.table_number === order.table_number);
      if (!table) return;
      tablesApi.updateTableStatus(table.uuid, 'AVAILABLE').catch((err) => console.error('Failed to free table:', err));
    },
    [tables],
  );

  const handlePrintReceipt = async (orderUuid: string, withQr: boolean) => {
    setPrintingUuid(orderUuid);
    try {
      await printReceiptUtil(orderUuid, withQr);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Chekni chop etishda xatolik yuz berdi.'));
    } finally {
      setPrintingUuid(null);
    }
  };

  const handlePrintPreCheck = async (order: Order) => {
    try {
      await printPreCheckUtil(order);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Pre-chekni chop etishda xatolik yuz berdi.'));
    }
  };

  const autoPrintEnabled = () => {
    try {
      return localStorage.getItem('milliygo_auto_print') === 'true';
    } catch {
      return false;
    }
  };

  // 409 HANDED_TO_COURIER: kuryer buyurtmani olgan — xabar ko'rsatib, ro'yxatni yangilaymiz.
  const reportActionError = (err: unknown, fallback: string) => {
    const e = err as { response?: { status?: number; data?: { code?: string; message?: string } } };
    if (e?.response?.status === 409 && e.response.data?.code === 'HANDED_TO_COURIER') {
      toast.error(e.response.data.message || HANDED_NOTE);
      setCourierOrder(null);
      refresh();
      return;
    }
    toast.error(getErrorMessage(err, fallback));
  };

  const updateStatus = async (order: Order, nextStatus: Order['status'], successMsg?: string, reason?: string) => {
    const previous = orders;
    setBusyUuid(order.uuid);
    touch(order.uuid);
    // Optimistic: the card moves columns immediately.
    setOrders((prev) => prev.map((o) => (o.uuid === order.uuid ? { ...o, status: nextStatus, ...(reason ? { reject_reason: reason } : {}) } : o)));
    try {
      await ordersApi.updateOrderStatus(order.uuid, nextStatus, reason);
      if (successMsg) toast.success(successMsg);
      if (nextStatus === 'READY_FOR_PICKUP' && order.delivery_type === 'DELIVERY' && autoPrintEnabled()) {
        handlePrintReceipt(order.uuid, true);
      }
      refresh();
    } catch (err) {
      setOrders(previous);
      reportActionError(err, 'Buyurtma holatini yangilashda xatolik yuz berdi.');
    } finally {
      setBusyUuid(null);
    }
  };

  const acceptOrder = (order: Order) => {
    if (order.partner_uuid && partnerUuid && order.partner_uuid !== partnerUuid) {
      toast.error('Bu buyurtma sizning muassasangizga tegishli emas.');
      return;
    }
    if (order.order_source === 'QR') {
      pickWaiter(order, 'qr');
      return;
    }
    updateStatus(order, 'ACCEPTED', `${orderNo(order)} qabul qilindi`);
  };

  const openCourierPicker = (order: Order, thenReady = false) => {
    readyAfterAssign.current = thenReady;
    setCourierOrder(order);
    setLoadingCouriers(true);
    couriersApi
      .getCouriers()
      .then(setCouriers)
      .catch((err) => toast.error(getErrorMessage(err, "Kuryerlar ro'yxatini yuklashda xatolik yuz berdi.")))
      .finally(() => setLoadingCouriers(false));
  };

  const assignCourier = async (courierUuid: string) => {
    if (!courierOrder) return;
    setAssigningCourierUuid(courierUuid);
    try {
      await ordersApi.assignOwnCourier(courierOrder.uuid, courierUuid);
      touch(courierOrder.uuid);
      setOrders((prev) => prev.map((o) => (o.uuid === courierOrder.uuid ? { ...o, status: 'ACCEPTED' } : o)));
      toast.success('Kuryer biriktirildi, buyurtma qabul qilindi.');
      const goReady = readyAfterAssign.current;
      readyAfterAssign.current = false;
      setCourierOrder(null);
      if (goReady) void updateStatus({ ...courierOrder, status: 'ACCEPTED' }, 'READY_FOR_PICKUP', `${orderNo(courierOrder)} tayyor`);
      else refresh();
    } catch (err) {
      reportActionError(err, 'Kuryerni biriktirishda xatolik yuz berdi.');
    } finally {
      setAssigningCourierUuid(null);
    }
  };

  const completeOrder = async (order: Order) => {
    setBusyUuid(order.uuid);
    try {
      await ordersApi.completeOrder(order.uuid);
      freeTableForOrder(order);
      setSelectedUuid(null);
      toast.success(order.call_number ? `№ ${order.call_number} mijozga berildi` : `${orderNo(order)} yakunlandi`);
      if (!order.hall_uuid) handlePrintReceipt(order.uuid, true); // o'z-o'ziga xizmat: chek to'lovda (yaratishda) chiqqan
      refresh();
    } catch (err) {
      reportActionError(err, 'Buyurtmani yakunlashda xatolik yuz berdi.');
    } finally {
      setBusyUuid(null);
    }
  };

  const submitPayment = async (method: PaymentMethod, splitCount: number, payments?: PaymentPart[]) => {
    if (!paymentOrder) return;
    setPaymentSaving(true);
    try {
      // To'lov va yakunlash — bitta so'rovda (eski serverda mark-paid bilan to'ldiriladi); aralash — qismlar bilan
      await ordersApi.completeWithPayment(paymentOrder.uuid, method, splitCount, payments);
      freeTableForOrder(paymentOrder);
      toast.success(`${orderNo(paymentOrder)} to'landi va yakunlandi`);
      handlePrintReceipt(paymentOrder.uuid, true);
      if (selectedUuid === paymentOrder.uuid) setSelectedUuid(null);
      setPaymentOrder(null);
      refresh();
    } catch (err) {
      reportActionError(err, "To'lov ma'lumotlarini saqlashda xatolik yuz berdi.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const runAction = async (order: Order, a: QueueAction) => {
    switch (a.kind) {
      case 'accept':
        acceptOrder(order);
        return;
      case 'reject': {
        const reason = await askRejectReason({ orderLabel: orderNo(order) });
        if (reason) updateStatus(order, 'REJECTED', `${orderNo(order)} rad etildi`, reason);
        return;
      }
      case 'cancel': {
        const msg = order.is_paid
          ? `${order.call_number ? `№ ${order.call_number} (${orderNo(order)})` : orderNo(order)} buyurtmasi to'langan. Bekor qilsangiz, ${formatMoney(order.total_price)} mijozga qaytarilishi kerak.`
          : `${orderNo(order)} buyurtmasini bekor qilasizmi?`;
        const ok = await confirm(msg, {
          title: 'Buyurtmani bekor qilish',
          danger: true,
          confirmText: 'Bekor qilish',
          cancelText: 'Orqaga',
        });
        if (ok) updateStatus(order, 'CANCELLED', `${orderNo(order)} bekor qilindi`);
        return;
      }
      case 'assign_courier':
        openCourierPicker(order);
        return;
      case 'start_preparing':
        updateStatus(order, 'PREPARING');
        return;
      case 'mark_ready':
        // Yetkazib berishda kuryer yo'q: xato o'rniga kuryer biriktirish oynasi ochiladi
        if (order.delivery_type === 'DELIVERY' && !order.courier && !order.courier_phone && ctx.hasOwnCouriers) {
          openCourierPicker(order, true);
          return;
        }
        // Stol: ovqatni kim olib boradi — ofitsiant tanlanadi (o'zi ochgan ofitsiant bo'lsa — darhol, unga push boradi)
        if (needsWaiter(order)) {
          pickWaiter(order, 'ready');
          return;
        }
        updateStatus(order, 'READY_FOR_PICKUP', order.call_number ? `№ ${order.call_number} tayyor — mijozni chaqiring` : `${orderNo(order)} tayyor`);
        return;
      case 'back_to_accepted':
        updateStatus(order, 'ACCEPTED');
        return;
      case 'back_to_preparing':
        updateStatus(order, 'PREPARING');
        return;
      case 'back_to_ready':
        updateStatus(order, 'READY_FOR_PICKUP');
        return;
      case 'pay_and_complete':
        setPaymentOrder(order);
        return;
      case 'complete':
        completeOrder(order);
        return;
    }
  };

  const openOrder = (uuid: string) => {
    setSelectedUuid(uuid);
    touch(uuid);
  };

  const sheets = (
    <>
      <OrderDetailSheet
        order={selectedOrder}
        now={now}
        ctx={ctx}
        busy={!!selectedOrder && busyUuid === selectedOrder.uuid}
        printing={!!selectedOrder && printingUuid === selectedOrder.uuid}
        onClose={() => setSelectedUuid(null)}
        onAction={(o, a) => {
          // Status changes keep the sheet open so the user sees the new status;
          // flows that open another sheet close this one.
          if (a.kind === 'pay_and_complete' || a.kind === 'assign_courier') setSelectedUuid(null);
          runAction(o, a);
        }}
        onEdit={(o) => setEditingOrder(o)}
        onPrintReceipt={(o, qr) => handlePrintReceipt(o.uuid, qr)}
        onPrintPreCheck={handlePrintPreCheck}
        onOrderPatched={(uuid, patch) => setOrders((prev) => prev.map((o) => (o.uuid === uuid ? { ...o, ...patch } : o)))}
        onPickWaiter={(o) => pickWaiter(o, 'assign')}
      />

      <WaiterPickSheet
        target={
          waiterPick
            ? {
                uuid: waiterPick.order.uuid,
                mode: waiterPick.mode,
                currentWaiterUuid: waiterPick.order.waiter_role === 'waiter' ? waiterPick.order.waiter_uuid : null,
                label: waiterPick.order.table_number ? `${waiterPick.order.table_number}-stol` : orderNo(waiterPick.order),
              }
            : null
        }
        onClose={() => setWaiterPick(null)}
        onDone={() => {
          setWaiterPick(null);
          refresh();
        }}
      />

      <PaymentSheet order={paymentOrder} saving={paymentSaving} onClose={() => !paymentSaving && setPaymentOrder(null)} onSubmit={submitPayment} />

      <CourierPickerSheet
        order={courierOrder}
        couriers={couriers}
        filials={filials}
        loading={loadingCouriers}
        assigningUuid={assigningCourierUuid}
        onClose={() => !assigningCourierUuid && setCourierOrder(null)}
        onAssign={assignCourier}
      />

      {editingOrder && (
        <EditOrderModal
          orderUuid={editingOrder.uuid}
          orderNumber={orderNo(editingOrder)}
          onClose={(changed) => {
            setEditingOrder(null);
            if (changed) refresh();
          }}
        />
      )}
    </>
  );

  return { ctx, busyUuid, runAction, openOrder, pickWaiter, sheets };
}
