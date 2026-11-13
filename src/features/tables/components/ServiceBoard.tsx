import React from 'react';
import { Clock, MapPin, Phone, Plus, ShoppingBag, Truck, User } from 'lucide-react';
import { EmptyState } from '../../../core/ui';
import { formatMoney, minutesSince } from '../../../core/lib/format';
import { orderNo } from '../../orders/components/queue/actions';
import type { Order } from '../../orders/services/ordersApi';
import { statusGroup, statusLabel } from '../../orders/utils/status';
import type { QueueGroup } from '../../orders/utils/status';
import { courierColor, orderCourierKey } from '../lib/courierColors';
import { t } from '../../../core/i18n';

/** DINE_IN — o'z-o'ziga xizmat zali (stolsiz zal buyurtmalari) */
export type ServiceKind = 'PICKUP' | 'DELIVERY' | 'DINE_IN';

/** Holat guruhi bo'yicha karta rangi: yangi — sariq, tayyorlanmoqda — yashil, tayyor — ko'k, yo'lda — to'q */
const TONE: Record<QueueGroup, { tile: string; text: string; sub: string; strip: string }> = {
  NEW: { tile: 'bg-warning border-warning', text: 'text-ink', sub: 'text-ink/75', strip: 'bg-black/10 text-ink' },
  PREPARING: { tile: 'bg-brand-bright border-brand-bright', text: 'text-white', sub: 'text-white/85', strip: 'bg-black/15 text-white' },
  READY: { tile: 'bg-info border-info', text: 'text-white', sub: 'text-white/85', strip: 'bg-black/15 text-white' },
  ON_THE_WAY: { tile: 'bg-ink border-ink', text: 'text-white', sub: 'text-white/80', strip: 'bg-white/15 text-white' },
  DONE: { tile: 'bg-surface border-edge', text: 'text-ink', sub: 'text-muted', strip: 'bg-field text-ink' },
};

const courierName = (o: Order) => o.courier?.full_name || [o.courier?.first_name, o.courier?.last_name].filter(Boolean).join(' ') || '';

/** Kartadagi tezkor amal (o'z-o'ziga xizmat): «Tayyor» yoki «Berildi» */
export type QuickAction = 'ready' | 'handover';
const quickActionOf = (o: Order): QuickAction | null => {
  if (!o.hall_uuid) return null;
  if (o.status === 'ACCEPTED' || o.status === 'PREPARING') return 'ready';
  if (o.status === 'READY_FOR_PICKUP') return 'handover'; // to'lanmagan bo'lsa — avval to'lov oynasi
  return null;
};

const OrderTile: React.FC<{
  order: Order; kind: ServiceKind; now: number; onOpen: () => void; focusKey: string; onFocus: (k: string) => void;
  onQuick?: (a: QuickAction) => void; busy?: boolean;
}> = ({ order, kind, now, onOpen, focusKey, onFocus, onQuick, busy }) => {
  const quick = onQuick ? quickActionOf(order) : null;
  const tone = TONE[statusGroup(order.status)];
  const mins = minutesSince(order.created_at, now);
  const who = order.contact_name || order.contact_phone;
  const courier = kind === 'DELIVERY' ? courierName(order) : '';
  const ck = kind === 'DELIVERY' ? orderCourierKey(order) : '';
  const color = courierColor(ck);
  const dim = !!focusKey && focusKey !== ck;
  const lit = !!focusKey && focusKey === ck;
  return (
    <div
      onMouseEnter={() => ck && onFocus(ck)}
      onMouseLeave={() => onFocus('')}
      style={ck ? { boxShadow: lit ? `0 0 0 3px ${color}` : undefined } : undefined}
      className={`relative rounded-xl border-2 min-h-[140px] flex flex-col overflow-hidden transition hover:shadow-card ${dim ? 'opacity-40' : ''} ${tone.tile}`}
    >
    <button type="button" onClick={onOpen} className="flex-1 w-full flex flex-col text-left cursor-pointer active:scale-[0.98] transition">
      {ck && <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} aria-hidden />}
      <span className="flex-1 w-full p-2.5 flex flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          {order.call_number ? (
            <span className={`flex flex-col leading-none ${tone.text}`}>
              <span className="text-[28px] font-black tracking-tightest tabular-nums">№ {order.call_number}</span>
              <span className="mt-1 text-[11px] font-bold opacity-80">{orderNo(order)}</span>
            </span>
          ) : (
            <span className={`text-[18px] font-black tracking-tightest leading-none break-all ${tone.text}`}>{orderNo(order)}</span>
          )}
          <span className={`text-[15px] font-black tabular-nums leading-none whitespace-nowrap ${tone.text}`}>{formatMoney(order.total_price)}</span>
        </span>
        <span className={`mt-auto flex flex-col gap-0.5 text-[12px] font-semibold ${tone.sub}`}>
          {who && (
            <span className="inline-flex items-center gap-1 truncate">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{who}</span>
            </span>
          )}
          {kind === 'DELIVERY' && order.address && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{order.address}</span>
            </span>
          )}
          {kind === 'DELIVERY' && (
            <span className="inline-flex items-center gap-1 truncate">
              {courier ? (
                <span className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-md bg-white text-ink font-extrabold">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{courier}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-danger text-white font-extrabold">
                  <Phone className="w-3.5 h-3.5 shrink-0" /> {t('card.noCourier')}
                </span>
              )}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 tabular-nums ${mins >= 60 ? 'font-black underline decoration-2' : ''}`}>
            <Clock className="w-3.5 h-3.5" />
            {mins >= 60 ? t('time.hm', { h: Math.floor(mins / 60), m: mins % 60 }) : t('card.min', { n: mins })}
          </span>
        </span>
      </span>
      {!quick && (
        <span className={`w-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${tone.strip}`}>
          {statusLabel(order.status)}
          {!order.is_paid ? '' : ` · ${t('board.paidLower')}`}
        </span>
      )}
    </button>
    {quick && (
      <span className={`w-full flex items-center gap-2 pl-2.5 pr-1 py-1 ${tone.strip}`}>
        <span className="flex-1 min-w-0 truncate text-[11px] font-extrabold tracking-wide">{statusLabel(order.status)}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onQuick?.(quick)}
          className="shrink-0 h-8 px-3 rounded-lg bg-white text-ink text-[13px] font-black shadow-sm hover:bg-white/90 active:scale-95 transition disabled:opacity-60 cursor-pointer"
        >
          {busy ? '…' : quick === 'ready' ? t('act.ready') : t('act.handOver')}
        </button>
      </span>
    )}
    </div>
  );
};

/** Saqlab turilgan (hali yuborilmagan, to'lanmagan) savat — o'z-o'ziga xizmat zalida */
export interface HeldCart {
  key: string;
  title: string;
  count: number;
  subtotal: number;
  savedAt: number;
}

const HeldTile: React.FC<{ cart: HeldCart; now: number; onOpen: () => void }> = ({ cart, now, onOpen }) => {
  const mins = Math.max(0, Math.floor((now - cart.savedAt) / 60000));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative rounded-xl border-2 border-dashed border-warning bg-warning-soft min-h-[140px] flex flex-col overflow-hidden text-left transition hover:shadow-card active:scale-[0.98] cursor-pointer"
    >
      <span className="flex-1 w-full p-2.5 flex flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-[16px] font-black tracking-tightest leading-tight text-ink break-words">{cart.title}</span>
          <span className="text-[15px] font-black tabular-nums leading-none whitespace-nowrap text-ink">{formatMoney(cart.subtotal)}</span>
        </span>
        <span className="mt-auto flex flex-col gap-0.5 text-[12px] font-semibold text-warning-ink">
          <span className="inline-flex items-center gap-1">
            <ShoppingBag className="w-3.5 h-3.5" /> {t('board.itemsCount', { n: cart.count })}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="w-3.5 h-3.5" /> {mins < 1 ? t('card.now') : t('time.ago', { n: mins })}
          </span>
        </span>
      </span>
      <span className="w-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide bg-black/10 text-ink">{t('board.heldUnpaid')}</span>
    </button>
  );
};

/** Saboy (olib ketish) va Dostavka (yetkazish): faol buyurtmalar kartalari + «yangi buyurtma» kartasi */
export const ServiceBoard: React.FC<{
  kind: ServiceKind;
  orders: Order[];
  now: number;
  loading: boolean;
  onNew: () => void;
  onOpen: (uuid: string) => void;
  /** Buyurtmalar ostida qo'shimcha blok (Dostavka uchun kuryerlar) */
  extra?: React.ReactNode;
  focusKey?: string;
  onFocus?: (k: string) => void;
  /** Sarlavha (o'z-o'ziga xizmat zalida — zal nomi) */
  title?: string;
  /** Bo'sh holat matnini ko'rsatmaslik (bir sahifada bir nechta doska bo'lsa) */
  compact?: boolean;
  /** O'z-o'ziga xizmat: saqlab turilgan savatlar (bosilsa — davom ettiriladi) */
  held?: HeldCart[];
  onResume?: (key: string) => void;
  /** O'z-o'ziga xizmat: kartadagi «Tayyor» / «Berildi» tugmasi */
  onQuick?: (order: Order, a: QuickAction) => void;
  busyUuid?: string | null;
}> = ({ kind, orders, now, loading, onNew, onOpen, extra, focusKey = '', onFocus = () => {}, title: titleProp, compact, held = [], onResume, onQuick, busyUuid }) => {
  const title = titleProp || (kind === 'PICKUP' ? t('type.pickup') : kind === 'DELIVERY' ? t('type.delivery') : t('board.hall'));
  const newLabel = t('board.newOrder');
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={onNew}
          className="rounded-xl border-2 border-dashed border-edge-strong bg-surface min-h-[140px] flex flex-col items-center justify-center gap-2 text-muted hover:text-brand hover:border-brand/50 transition cursor-pointer"
        >
          <span className="w-10 h-10 rounded-xl border-2 border-dashed border-current flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </span>
          <span className="text-[13px] font-extrabold">{newLabel}</span>
        </button>
        {held.map((c) => (
          <HeldTile key={c.key} cart={c} now={now} onOpen={() => onResume?.(c.key)} />
        ))}
        {orders.map((o) => (
          <OrderTile key={o.uuid} order={o} kind={kind} now={now} onOpen={() => onOpen(o.uuid)} focusKey={focusKey} onFocus={onFocus}
            onQuick={onQuick ? (a) => onQuick(o, a) : undefined} busy={busyUuid === o.uuid} />
        ))}
      </div>
      {!loading && !compact && orders.length === 0 && held.length === 0 && (
        <EmptyState
          className="py-10"
          title={kind === 'DINE_IN' ? t('board.emptyHall', { n: title }) : kind === 'PICKUP' ? t('board.emptyPickup') : t('board.emptyDelivery')}
          description={
            kind === 'DINE_IN'
              ? t('board.emptyHallHint')
              : t('board.emptyHint')
          }
        />
      )}
      {extra}
    </div>
  );
};
