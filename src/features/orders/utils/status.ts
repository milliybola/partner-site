import type { BadgeTone } from '../../../core/ui';
import { t } from '../../../core/i18n';

/**
 * Single source of truth for order status labels / colors / grouping.
 * Groups map to the brief's queue tabs:
 *   Yangi / Tayyorlanmoqda / Tayyor / Yo'lda / Yakunlangan
 */
export type OrderStatus =
  | 'PENDING'
  | 'SEARCHING_COURIER'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'ON_THE_WAY'
  | 'COMPLETED'
  | 'DELIVERED'
  | 'CANCELLED';

export type QueueGroup = 'NEW' | 'PREPARING' | 'READY' | 'ON_THE_WAY' | 'DONE';

export const STATUS_META: Record<string, { label: string; tone: BadgeTone; group: QueueGroup }> = {
  PENDING: { label: t('status.new'), tone: 'gold', group: 'NEW' },
  SEARCHING_COURIER: { label: t('status.searchingCourier'), tone: 'gold', group: 'NEW' },
  ACCEPTED: { label: t('status.accepted'), tone: 'info', group: 'PREPARING' },
  PREPARING: { label: t('status.preparing'), tone: 'warning', group: 'PREPARING' },
  READY_FOR_PICKUP: { label: t('status.ready'), tone: 'success', group: 'READY' },
  PICKED_UP: { label: t('status.pickedUp'), tone: 'info', group: 'ON_THE_WAY' },
  ON_THE_WAY: { label: t('status.onTheWay'), tone: 'info', group: 'ON_THE_WAY' },
  COMPLETED: { label: t('status.completed'), tone: 'neutral', group: 'DONE' },
  DELIVERED: { label: t('status.delivered'), tone: 'neutral', group: 'DONE' },
  REJECTED: { label: t('status.rejected'), tone: 'danger', group: 'DONE' },
  CANCELLED: { label: t('status.cancelled'), tone: 'danger', group: 'DONE' },
};

export const QUEUE_GROUPS: { key: QueueGroup; label: string; statuses: string[] }[] = [
  { key: 'NEW', label: t('status.new'), statuses: ['PENDING', 'SEARCHING_COURIER'] },
  { key: 'PREPARING', label: t('status.preparing'), statuses: ['ACCEPTED', 'PREPARING'] },
  { key: 'READY', label: t('status.ready'), statuses: ['READY_FOR_PICKUP'] },
  { key: 'ON_THE_WAY', label: t('status.onTheWay'), statuses: ['PICKED_UP', 'ON_THE_WAY'] },
  { key: 'DONE', label: t('status.completed'), statuses: ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'] },
];

export const statusLabel = (s?: string) => (s && STATUS_META[s]?.label) || s || '—';
export const statusTone = (s?: string): BadgeTone => (s && STATUS_META[s]?.tone) || 'neutral';
export const statusGroup = (s?: string): QueueGroup => (s && STATUS_META[s]?.group) || 'DONE';

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  DELIVERY: t('type.delivery'),
  PICKUP: t('type.pickup'),
  DINE_IN: t('type.dineIn'),
};

export const PAYMENT_LABEL: Record<string, string> = {
  CASH: t('pay.cash'),
  CARD: t('pay.card'),
  CLICK: 'Click',
  PAYME: 'Payme',
  UZCARD: 'Uzcard',
  HUMO: 'Humo',
};

export const paymentLabel = (m?: string | null) => (m && PAYMENT_LABEL[m.toUpperCase()]) || m || '—';
export const deliveryTypeLabel = (t?: string | null) => (t && DELIVERY_TYPE_LABEL[t]) || t || '—';
