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
import { useShiftNotOpenPrompt } from '../../../../core/components/useShiftNotOpenPrompt';
import { useRejectReason } from '../../../../core/components/RejectReasonProvider';
import { getPartner, isCashier, isManager, isShop } from '../../../../core/lib/session';
import { t } from '../../../../core/i18n';
import { getErrorMessage } from '../../../../core/lib/errors';
import { formatMoney } from '../../../../core/lib/format';
import { OFFLINE_SHEET_EVENT, enqueuePayment, isNetworkError, isPaymentQueued } from '../../../../core/lib/offline';
import { OrderDetailSheet } from './OrderDetailSheet';
import { PaymentSheet } from './PaymentSheet';
import type { PaymentMethod } from './PaymentSheet';
import { CourierPickerSheet } from './CourierPickerSheet';
import { WaiterPickSheet } from './WaiterPickSheet';
import type { WaiterPickMode } from './WaiterPickSheet';
import { needsWaiter, opensNewBill } from '../../services/ordersApi';
import { usePlatformConfig } from '../../../../core/lib/platformStage';
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
  const promptShift = useShiftNotOpenPrompt();
  const askRejectReason = useRejectReason();
  const partner = getPartner();
  const manager = isManager(partner);
  const shop = isShop(partner);
  const partnerUuid = partner?.uuid;
  // 1-bosqich: zal/stol, mijoz cheki, taom qo'shish yo'q — ilova buyurtmasi smenasiz yakunlanadi
  const { pos: posStage } = usePlatformConfig();

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
    if (!shop && posStage) {
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
  }, [manager, shop, posStage]);

  // To'langan buyurtmani bekor qilish — faqat menejer/ega (kassirga tugma ko'rsatilmaydi)
  const ctx: ActionContext = { skipPreparing, fastMode, hasOwnCouriers: couriers.length > 0, shop, canCancelPaid: !isCashier(partner), pos: posStage };
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
    // Mijoz cheki — 2-bosqich (Q51): 1-bosqichda yakunlashdan keyin chek so'ralmaydi (server 403 bermasin)
    if (!posStage) return;
    setPrintingUuid(orderUuid);
    try {
      await printReceiptUtil(orderUuid, withQr);
    } catch (err) {
      toast.error(getErrorMessage(err, t('msg.printFail')));
    } finally {
      setPrintingUuid(null);
    }
  };

  const handlePrintPreCheck = async (order: Order) => {
    try {
      await printPreCheckUtil(order);
    } catch (err) {
      toast.error(getErrorMessage(err, t('msg.preCheckFail')));
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
    // D36: smena ochilmagan — to'lov yozilmadi, buyurtma o'zgarmadi; kassirga «Smenani ochish»
    if (promptShift(err)) return;
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
      reportActionError(err, t('msg.statusFail'));
    } finally {
      setBusyUuid(null);
    }
  };

  const acceptOrder = (order: Order) => {
    if (order.partner_uuid && partnerUuid && order.partner_uuid !== partnerUuid) {
      toast.error(t('msg.notYourOrder'));
      return;
    }
    if (order.order_source === 'QR') {
      pickWaiter(order, 'qr');
      return;
    }
    updateStatus(order, 'ACCEPTED', t('msg.accepted', { n: orderNo(order) }));
  };

  const openCourierPicker = (order: Order, thenReady = false) => {
    readyAfterAssign.current = thenReady;
    setCourierOrder(order);
    setLoadingCouriers(true);
    couriersApi
      .getCouriers()
      .then(setCouriers)
      .catch((err) => toast.error(getErrorMessage(err, t('msg.couriersFail'))))
      .finally(() => setLoadingCouriers(false));
  };

  const assignCourier = async (courierUuid: string) => {
    if (!courierOrder) return;
    setAssigningCourierUuid(courierUuid);
    try {
      await ordersApi.assignOwnCourier(courierOrder.uuid, courierUuid);
      touch(courierOrder.uuid);
      setOrders((prev) => prev.map((o) => (o.uuid === courierOrder.uuid ? { ...o, status: 'ACCEPTED' } : o)));
      toast.success(t('msg.courierAssigned'));
      const goReady = readyAfterAssign.current;
      readyAfterAssign.current = false;
      setCourierOrder(null);
      if (goReady) void updateStatus({ ...courierOrder, status: 'ACCEPTED' }, 'READY_FOR_PICKUP', t('msg.ready', { n: orderNo(courierOrder) }));
      else refresh();
    } catch (err) {
      reportActionError(err, t('msg.courierAssignFail'));
    } finally {
      setAssigningCourierUuid(null);
    }
  };

  /** To'lovi/yakunlanishi oflayn navbatda turgan buyurtma — qayta to'lov olinmaydi (pul ikki marta olinmasin) */
  const blockIfQueued = (order: Order) => {
    if (!isPaymentQueued(order.uuid)) return false;
    toast.error(t('msg.payQueuedNoRepeat', { n: orderNo(order) }));
    window.dispatchEvent(new Event(OFFLINE_SHEET_EVENT));
    return true;
  };

  /**
   * Internet yo'q: to'lov/yakunlash navbatga yoziladi, karta darhol «yakunlangan»ga o'tadi.
   * Internet qaytgach navbat o'zi yuboriladi (core/lib/offline.ts → sendPayment).
   */
  const queueOffline = (order: Order, pay: { collect: boolean; method: string; payments?: PaymentPart[]; splitCount?: number }) => {
    let added: boolean;
    try {
      added = enqueuePayment({
        label: order.table_number ? `${orderNo(order)} · ${t('table.n', { n: order.table_number })}` : orderNo(order),
        total: Number(order.total_price) || 0,
        payment: {
          order_uuid: order.uuid,
          collect: pay.collect,
          method: pay.method,
          ...(pay.payments && pay.payments.length > 1 ? { payments: pay.payments } : {}),
          ...(pay.splitCount && pay.splitCount > 1 ? { split_count: pay.splitCount } : {}),
          ...(order.hall_uuid ? { self_service: true } : {}),
        },
      });
    } catch (e) {
      toast.error(getErrorMessage(e, t('msg.paySaveFail')));
      return;
    }
    if (!added) {
      toast.error(t('msg.payAlreadyQueued', { n: orderNo(order) }));
      return;
    }
    setOrders((prev) =>
      prev.map((o) =>
        o.uuid === order.uuid
          ? { ...o, status: 'DELIVERED', ...(pay.collect ? { is_paid: true, payment_method: pay.method, payment_breakdown: pay.payments && pay.payments.length > 1 ? pay.payments : [] } : {}) }
          : o,
      ),
    );
    if (selectedUuid === order.uuid) setSelectedUuid(null);
    toast.success(
      pay.collect
        ? t('msg.payOfflineSaved', { n: orderNo(order) })
        : t('msg.completeOffline', { n: orderNo(order) }),
    );
  };

  const completeOrder = async (order: Order) => {
    if (blockIfQueued(order)) return;
    setBusyUuid(order.uuid);
    try {
      await ordersApi.completeOrder(order.uuid);
      freeTableForOrder(order);
      setSelectedUuid(null);
      toast.success(order.call_number ? t('msg.handedToCustomer', { n: order.call_number }) : t('msg.completed', { n: orderNo(order) }));
      if (!order.hall_uuid) handlePrintReceipt(order.uuid, true); // o'z-o'ziga xizmat: chek to'lovda (yaratishda) chiqqan
      refresh();
    } catch (err) {
      if (isNetworkError(err)) queueOffline(order, { collect: false, method: order.payment_method || 'CASH' });
      else reportActionError(err, t('msg.completeFail'));
    } finally {
      setBusyUuid(null);
    }
  };

  const submitPayment = async (method: PaymentMethod, splitCount: number, payments?: PaymentPart[]) => {
    if (!paymentOrder) return;
    if (blockIfQueued(paymentOrder)) {
      setPaymentOrder(null);
      return;
    }
    setPaymentSaving(true);
    try {
      // To'lov va yakunlash — bitta so'rovda (eski serverda mark-paid bilan to'ldiriladi); aralash — qismlar bilan
      await ordersApi.completeWithPayment(paymentOrder.uuid, method, splitCount, payments);
      freeTableForOrder(paymentOrder);
      toast.success(t('msg.paidCompleted', { n: orderNo(paymentOrder) }));
      handlePrintReceipt(paymentOrder.uuid, true);
      if (selectedUuid === paymentOrder.uuid) setSelectedUuid(null);
      setPaymentOrder(null);
      refresh();
    } catch (err) {
      if (isNetworkError(err)) {
        // Javob kelmadi: server to'lovni yozgan-yozmagani noma'lum — navbat yuborishda server holatini tekshiradi
        queueOffline(paymentOrder, { collect: true, method, payments, splitCount });
        setPaymentOrder(null);
      } else {
        // D36: smena ochilmagan — to'lov oynasi yopiladi (pul olinmadi), smena ochilgach qayta qabul qilinadi
        if (promptShift(err)) setPaymentOrder(null);
        else reportActionError(err, t('msg.paymentFail'));
      }
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
        if (reason) updateStatus(order, 'REJECTED', t('msg.rejected', { n: orderNo(order) }), reason);
        return;
      }
      case 'cancel': {
        const done = t('cancel.done', { n: orderNo(order) });
        if (!order.is_paid) {
          const ok = await confirm(t('cancel.ask', { n: orderNo(order) }), {
            title: t('cancel.title'),
            danger: true,
            confirmText: t('act.cancel'),
            cancelText: t('cancel.back'),
          });
          if (ok) updateStatus(order, 'CANCELLED', done);
          return;
        }
        // To'langan: faqat menejer/ega (server ham tekshiradi), sabab majburiy — bitta oynada tasdiq + sabab
        if (!ctx.canCancelPaid) {
          toast.error(t('err.paidCancelManagerOnly'));
          return;
        }
        const label = order.call_number ? `№ ${order.call_number} (${orderNo(order)})` : orderNo(order);
        const reason = await askRejectReason({
          orderLabel: label,
          title: t('cancel.paidTitle', { n: label }),
          hint: t('cancel.paidHint', { sum: formatMoney(order.total_price) }),
          presets: [t('cancel.reasonCustomer'), t('cancel.reasonMistake'), t('cancel.reasonOutOfStock'), t('cancel.reasonLongWait')],
          otherLabel: t('cancel.reasonOther'),
          placeholder: t('cancel.reasonPlaceholder'),
          confirmText: t('act.cancel'),
          backText: t('cancel.back'),
        });
        if (reason) updateStatus(order, 'CANCELLED', done, reason);
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
        updateStatus(order, 'READY_FOR_PICKUP', order.call_number ? t('msg.readyCall', { n: order.call_number }) : t('msg.ready', { n: orderNo(order) }));
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
        if (blockIfQueued(order)) return;
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
                label: waiterPick.order.table_number ? t('table.n', { n: waiterPick.order.table_number }) : orderNo(waiterPick.order),
              }
            : null
        }
        onClose={() => setWaiterPick(null)}
        onDone={() => {
          setWaiterPick(null);
          refresh();
        }}
      />

      <PaymentSheet simple={!posStage} order={paymentOrder} saving={paymentSaving} onClose={() => !paymentSaving && setPaymentOrder(null)} onSubmit={submitPayment} />

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
          removeOnly={!posStage}
          orderNumber={orderNo(editingOrder)}
          paidLock={editingOrder.is_paid ? (opensNewBill(editingOrder) ? 'newBill' : 'locked') : undefined}
          onClose={(changed, newBillUuid) => {
            setEditingOrder(null);
            if (changed) refresh();
            // To'langan buyurtmaga qo'shilgan taom — yangi hisob: ro'yxat yangilangach uning oynasi ochiladi
            if (newBillUuid) openOrder(newBillUuid);
          }}
        />
      )}
    </>
  );

  return { ctx, busyUuid, runAction, openOrder, pickWaiter, sheets };
}
