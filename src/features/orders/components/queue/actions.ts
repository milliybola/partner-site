import type { Order } from '../../services/ordersApi';
import { t } from '../../../../core/i18n';

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
  /**
   * To'langan buyurtmani bekor qila oladimi (menejer/ega — ha, kassir — yo'q; backend 403 PAID_CANCEL_MANAGER_ONLY).
   * Berilmasa — ha (tugma ko'rsatiladi, server baribir tekshiradi).
   */
  canCancelPaid?: boolean;
  /**
   * Platforma 2-bosqichdami (POS). false — 1-bosqich: mijoz cheki/pre-chek yo'q, tahrirda faqat taomni olib tashlash
   * (Q51, Q54). Berilmasa — ha.
   */
  pos?: boolean;
}

/** Bekor qilish tugmasi; to'langan buyurtmada kassirga ko'rsatilmaydi */
const cancelAction = (order: Order, ctx: ActionContext): QueueAction | undefined =>
  order.is_paid && ctx.canCancelPaid === false ? undefined : { kind: 'cancel', label: t('act.cancel'), tone: 'danger' };

/** Kassir to'langan buyurtmani ko'ryapti: bekor qilish tugmasi yashirilgan (izoh ko'rsatish uchun) */
export const isCancelManagerOnly = (order: Order, ctx: ActionContext) =>
  !!order.is_paid && ctx.canCancelPaid === false && getQueueActions(order, { ...ctx, canCancelPaid: true }).danger?.kind === 'cancel';

export const isPendingLike = (s: string) => s === 'PENDING' || s === 'SEARCHING_COURIER';
/** Kuryer buyurtmani olgan: holatni endi kuryer boshqaradi. */
export const isHandedToCourier = (o: Pick<Order, 'status' | 'courier' | 'courier_phone'>) =>
  (o.status === 'PICKED_UP' || o.status === 'ON_THE_WAY') && !!(o.courier || o.courier_phone);

export const HANDED_NOTE = t('act.handedNote');

export const isFinal = (s: string) => ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'].includes(s);

export const getQueueActions = (order: Order, rawCtx: ActionContext): { primary?: QueueAction; secondary: QueueAction[]; danger?: QueueAction } => {
  const delivery = order.delivery_type === 'DELIVERY';
  // Oldindan to'langan (o'z-o'ziga xizmat zali, onlayn to'lov) — berishda to'lov qayta so'ralmaydi
  const handOver = (unpaidLabel: string): QueueAction =>
    order.is_paid ? { kind: 'complete', label: t('act.handOver'), tone: 'primary' } : { kind: 'pay_and_complete', label: unpaidLabel, tone: 'primary' };
  const ctx = rawCtx.fastMode ? { ...rawCtx, skipPreparing: true } : rawCtx;
  const secondary: QueueAction[] = [];
  if (isHandedToCourier(order)) return { secondary: [] };
  if (delivery && ctx.hasOwnCouriers && ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'].includes(order.status)) {
    secondary.push({ kind: 'assign_courier', label: t('act.assignCourier'), tone: 'secondary' });
  }
  switch (order.status) {
    case 'PENDING':
    case 'SEARCHING_COURIER':
      if (delivery && ctx.hasOwnCouriers) secondary.push({ kind: 'assign_courier', label: t('act.assignCourier'), tone: 'secondary' });
      return {
        primary: {
          kind: 'accept',
          // Stol QR buyurtmasini tasdiqlagan xodim buyurtmaning ofitsianti bo'ladi
          label: order.order_source === 'QR' ? t('act.confirm') : t('act.accept'),
          tone: 'primary',
        },
        secondary,
        danger: { kind: 'reject', label: t('act.reject'), tone: 'danger' },
      };
    case 'ACCEPTED':
    case 'PREPARING':
      // O'z-o'ziga xizmat zali: mijoz raqam bilan chaqiriladi — «Tayyor» kassir/oshxona tomonidan belgilanadi.
      // Mijoz kassa oldida kutib turgan bo'lsa — darhol «Mijozga berish» (to'lov oldindan olingan).
      if (order.hall_uuid) {
        return {
          primary: { kind: 'mark_ready', label: t('act.ready'), tone: 'primary' },
          secondary: [handOver(t('act.payAndHandOver')), ...(order.status === 'PREPARING' ? [{ kind: 'back_to_accepted' as const, label: t('act.backToAccepted'), tone: 'secondary' as const }] : [])]
            .map((a) => ({ ...a, tone: 'secondary' as const })),
          danger: order.status === 'ACCEPTED' ? cancelAction(order, ctx) : undefined,
        };
      }
      if (ctx.fastMode && !delivery) {
        // Tayyor bo'lishini kutib status almashtirilmaydi: berildi/to'landi — yakunlandi.
        // Ilovadan olib ketish buyurtmasida «Tayyor» mijozga xabar yuboradi — ixtiyoriy.
        if (order.order_source === 'CUSTOMER' && order.delivery_type === 'PICKUP') {
          secondary.push({ kind: 'mark_ready', label: t('act.readyNotify'), tone: 'secondary' });
        }
        return {
          primary: handOver(order.delivery_type === 'DINE_IN' ? t('act.payAndComplete') : t('act.handOver')),
          secondary,
          danger: order.status === 'ACCEPTED' ? cancelAction(order, ctx) : undefined,
        };
      }
      if (order.status === 'PREPARING') {
        return {
          primary: { kind: 'mark_ready', label: t('act.ready'), tone: 'primary' },
          secondary: [{ kind: 'back_to_accepted', label: t('act.backToAccepted'), tone: 'secondary' }],
        };
      }
      return {
        primary: ctx.skipPreparing
          ? { kind: 'mark_ready', label: t('act.ready'), tone: 'primary' }
          : { kind: 'start_preparing', label: ctx.shop ? t('act.startPicking') : t('act.startPreparing'), tone: 'primary' },
        secondary,
        danger: cancelAction(order, ctx),
      };
    case 'READY_FOR_PICKUP':
      // Yetkazib berishda «Tayyor»dan keyingi holatni faqat kuryer o'zgartiradi (olib ketdi → yo'lda → yetkazildi)
      if (delivery) return { secondary };
      return {
        primary: handOver(order.delivery_type === 'DINE_IN' ? t('act.payAndComplete') : t('act.handOver')),
        secondary: [
          ctx.skipPreparing
            ? { kind: 'back_to_accepted', label: t('act.backToAccepted'), tone: 'secondary' }
            : { kind: 'back_to_preparing', label: ctx.shop ? t('act.backToPicking') : t('act.backToPreparing'), tone: 'secondary' },
        ],
      };
    case 'ON_THE_WAY':
      return {
        primary: { kind: 'complete', label: t('act.complete'), tone: 'primary' },
        secondary: [{ kind: 'back_to_ready', label: t('act.backToReady'), tone: 'secondary' }],
      };
    default:
      return { secondary: [] };
  }
};

export const orderNo = (o: Pick<Order, 'order_number' | 'id'>) => o.order_number || `#${o.id}`;

export const itemName = (item: any) => item?.product_name || item?.name || item?.product?.name || "Noma'lum mahsulot";
export const itemPrice = (item: any) => Number(item?.price_at_time_of_order || item?.product?.price || 0);
