import type { Order } from '../../services/ordersApi';

/**
 * Status workflow for the order queue — one place that decides which buttons a
 * card / detail sheet shows, so the phone list, desktop columns and the detail
 * sheet never disagree.
 */
export type QueueActionKind =
  | 'accept'
  | 'reject'
  | 'assign_courier'
  | 'start_preparing'
  | 'mark_ready'
  | 'back_to_accepted'
  | 'back_to_preparing'
  | 'back_to_ready'
  | 'pay_and_complete'
  | 'complete'
  | 'cancel';

export interface QueueAction {
  kind: QueueActionKind;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
}

export interface ActionContext {
  skipPreparing: boolean;
  /** Tez rejim (kichik kafe): olib ketish/zal buyurtmasi qabul qilingach — bitta tugma bilan beriladi */
  fastMode?: boolean;
  hasOwnCouriers: boolean;
  shop: boolean;
}

export const isPendingLike = (s: string) => s === 'PENDING' || s === 'SEARCHING_COURIER';
/** Kuryer buyurtmani olgan: holatni endi kuryer boshqaradi. */
export const isHandedToCourier = (o: Pick<Order, 'status' | 'courier' | 'courier_phone'>) =>
  (o.status === 'PICKED_UP' || o.status === 'ON_THE_WAY') && !!(o.courier || o.courier_phone);

export const HANDED_NOTE = 'Buyurtma kuryerga topshirilgan — holatni endi kuryer boshqaradi.';

export const isFinal = (s: string) => ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'].includes(s);

export const getQueueActions = (order: Order, rawCtx: ActionContext): { primary?: QueueAction; secondary: QueueAction[]; danger?: QueueAction } => {
  const delivery = order.delivery_type === 'DELIVERY';
  const ctx = rawCtx.fastMode ? { ...rawCtx, skipPreparing: true } : rawCtx;
  const secondary: QueueAction[] = [];
  if (isHandedToCourier(order)) return { secondary: [] };
  if (delivery && ctx.hasOwnCouriers && ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'].includes(order.status)) {
    secondary.push({ kind: 'assign_courier', label: 'Kuryer biriktirish', tone: 'secondary' });
  }
  switch (order.status) {
    case 'PENDING':
    case 'SEARCHING_COURIER':
      if (delivery && ctx.hasOwnCouriers) secondary.push({ kind: 'assign_courier', label: 'Kuryer biriktirish', tone: 'secondary' });
      return {
        primary: {
          kind: 'accept',
          // Stol QR buyurtmasini tasdiqlagan xodim buyurtmaning ofitsianti bo'ladi
          label: order.order_source === 'QR' ? 'Tasdiqlash' : 'Qabul qilish',
          tone: 'primary',
        },
        secondary,
        danger: { kind: 'reject', label: 'Rad etish', tone: 'danger' },
      };
    case 'ACCEPTED':
    case 'PREPARING':
      if (ctx.fastMode && !delivery) {
        // Tayyor bo'lishini kutib status almashtirilmaydi: berildi/to'landi — yakunlandi.
        // Ilovadan olib ketish buyurtmasida «Tayyor» mijozga xabar yuboradi — ixtiyoriy.
        if (order.order_source === 'CUSTOMER' && order.delivery_type === 'PICKUP') {
          secondary.push({ kind: 'mark_ready', label: 'Tayyor (mijozga xabar)', tone: 'secondary' });
        }
        return {
          primary: { kind: 'pay_and_complete', label: order.delivery_type === 'DINE_IN' ? "To'lov va yakunlash" : 'Mijozga berish', tone: 'primary' },
          secondary,
          danger: order.status === 'ACCEPTED' ? { kind: 'cancel', label: 'Bekor qilish', tone: 'danger' } : undefined,
        };
      }
      if (order.status === 'PREPARING') {
        return {
          primary: { kind: 'mark_ready', label: 'Tayyor', tone: 'primary' },
          secondary: [{ kind: 'back_to_accepted', label: '"Qabul qilindi"ga qaytarish', tone: 'secondary' }],
        };
      }
      return {
        primary: ctx.skipPreparing
          ? { kind: 'mark_ready', label: 'Tayyor', tone: 'primary' }
          : { kind: 'start_preparing', label: ctx.shop ? "Yig'ishni boshlash" : 'Tayyorlashni boshlash', tone: 'primary' },
        secondary,
        danger: { kind: 'cancel', label: 'Bekor qilish', tone: 'danger' },
      };
    case 'READY_FOR_PICKUP':
      return {
        primary: { kind: 'pay_and_complete', label: delivery ? "To'lov va yakunlash" : 'Mijozga berish', tone: 'primary' },
        secondary: [
          ctx.skipPreparing
            ? { kind: 'back_to_accepted', label: '"Qabul qilindi"ga qaytarish', tone: 'secondary' }
            : { kind: 'back_to_preparing', label: ctx.shop ? `"Yig'ilmoqda"ga qaytarish` : '"Tayyorlanmoqda"ga qaytarish', tone: 'secondary' },
        ],
      };
    case 'ON_THE_WAY':
      return {
        primary: { kind: 'complete', label: 'Yakunlash', tone: 'primary' },
        secondary: [{ kind: 'back_to_ready', label: '"Tayyor"ga qaytarish', tone: 'secondary' }],
      };
    default:
      return { secondary: [] };
  }
};

export const orderNo = (o: Pick<Order, 'order_number' | 'id'>) => o.order_number || `#${o.id}`;

export const itemName = (item: any) => item?.product_name || item?.name || item?.product?.name || "Noma'lum mahsulot";
export const itemPrice = (item: any) => Number(item?.price_at_time_of_order || item?.product?.price || 0);
