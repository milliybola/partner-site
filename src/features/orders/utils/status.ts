import type { BadgeTone } from '../../../core/ui';

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
  PENDING: { label: 'Yangi', tone: 'gold', group: 'NEW' },
  SEARCHING_COURIER: { label: 'Kuryer qidirilmoqda', tone: 'gold', group: 'NEW' },
  ACCEPTED: { label: 'Qabul qilindi', tone: 'info', group: 'PREPARING' },
  PREPARING: { label: 'Tayyorlanmoqda', tone: 'warning', group: 'PREPARING' },
  READY_FOR_PICKUP: { label: 'Tayyor', tone: 'success', group: 'READY' },
  PICKED_UP: { label: 'Kuryer oldi', tone: 'info', group: 'ON_THE_WAY' },
  ON_THE_WAY: { label: "Yo'lda", tone: 'info', group: 'ON_THE_WAY' },
  COMPLETED: { label: 'Yakunlangan', tone: 'neutral', group: 'DONE' },
  DELIVERED: { label: 'Yetkazildi', tone: 'neutral', group: 'DONE' },
  REJECTED: { label: 'Rad etilgan', tone: 'danger', group: 'DONE' },
  CANCELLED: { label: 'Bekor qilingan', tone: 'danger', group: 'DONE' },
};

export const QUEUE_GROUPS: { key: QueueGroup; label: string; statuses: string[] }[] = [
  { key: 'NEW', label: 'Yangi', statuses: ['PENDING', 'SEARCHING_COURIER'] },
  { key: 'PREPARING', label: 'Tayyorlanmoqda', statuses: ['ACCEPTED', 'PREPARING'] },
  { key: 'READY', label: 'Tayyor', statuses: ['READY_FOR_PICKUP'] },
  { key: 'ON_THE_WAY', label: "Yo'lda", statuses: ['PICKED_UP', 'ON_THE_WAY'] },
  { key: 'DONE', label: 'Yakunlangan', statuses: ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'] },
];

export const statusLabel = (s?: string) => (s && STATUS_META[s]?.label) || s || '—';
export const statusTone = (s?: string): BadgeTone => (s && STATUS_META[s]?.tone) || 'neutral';
export const statusGroup = (s?: string): QueueGroup => (s && STATUS_META[s]?.group) || 'DONE';

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  DELIVERY: 'Yetkazib berish',
  PICKUP: 'Olib ketish',
  DINE_IN: 'Zalda',
};

export const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  CLICK: 'Click',
  PAYME: 'Payme',
  UZCARD: 'Uzcard',
  HUMO: 'Humo',
};

export const paymentLabel = (m?: string | null) => (m && PAYMENT_LABEL[m.toUpperCase()]) || m || '—';
export const deliveryTypeLabel = (t?: string | null) => (t && DELIVERY_TYPE_LABEL[t]) || t || '—';
