import React from 'react';
import { Bike, Check, ChevronRight, Clock, MapPin, ShoppingBag, User, Utensils, X } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { Badge, Button } from '../../../../core/ui';
import { formatMoney, formatTime, minutesSince } from '../../../../core/lib/format';
import { deliveryTypeLabel, statusLabel, statusTone } from '../../utils/status';
import { getQueueActions, isFinal, isHandedToCourier, isPendingLike, itemName, orderNo } from './actions';
import type { ActionContext, QueueAction } from './actions';
import { LocationBadge } from './DeliveryAddressSection';
import { FilialTag } from './FilialTag';

const TypeIcon: React.FC<{ type?: string }> = ({ type }) =>
  type === 'DINE_IN' ? <Utensils className="w-3.5 h-3.5" /> : type === 'PICKUP' ? <ShoppingBag className="w-3.5 h-3.5" /> : <Bike className="w-3.5 h-3.5" />;

/** Waiting time chip — turns amber after 15 min and red after 30 min for active orders. */
export const ElapsedChip: React.FC<{ createdAt: string; now: number; final?: boolean }> = ({ createdAt, now, final }) => {
  const min = minutesSince(createdAt, now);
  if (final) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted tabular-nums">
        <Clock className="w-3.5 h-3.5" /> {formatTime(createdAt)}
      </span>
    );
  }
  const tone = min >= 30 ? 'bg-danger-soft text-danger-ink' : min >= 15 ? 'bg-warning-soft text-warning-ink' : 'bg-field text-muted';
  return (
    <span title={`Qabul qilingan vaqt: ${formatTime(createdAt)}`} className={`inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[12px] font-bold tabular-nums ${tone}`}>
      <Clock className="w-3.5 h-3.5" />
      {min < 1 ? 'hozir' : min < 60 ? `${min} daq` : `${Math.floor(min / 60)} soat ${min % 60} daq`}
    </span>
  );
};

interface OrderCardProps {
  order: Order;
  now: number;
  ctx: ActionContext;
  highlighted?: boolean;
  busy?: boolean;
  dense?: boolean;
  showStatus?: boolean;
  onOpen: () => void;
  onAction: (a: QueueAction) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, now, ctx, highlighted, busy, dense, showStatus, onOpen, onAction }) => {
  const { primary, danger } = getQueueActions(order, ctx);
  const items = order.items || [];
  const pending = isPendingLike(order.status);
  const final = isFinal(order.status);
  const preview = items.slice(0, dense ? 2 : 3);
  const more = items.length - preview.length;

  return (
    <article
      className={`bg-surface rounded-2xl border transition-shadow ${
        pending ? 'border-gold/60' : 'border-edge'
      } ${highlighted ? 'animate-new-order border-brand-bright' : ''} hover:shadow-card`}
    >
      <button type="button" onClick={onOpen} className="w-full text-left p-3.5 pb-3 cursor-pointer" aria-label={`Buyurtma ${orderNo(order)} tafsilotlari`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[15px] font-black text-ink tracking-tightest truncate">{orderNo(order)}</span>
            {highlighted && <Badge tone="brand">Yangi</Badge>}
          </div>
          <ElapsedChip createdAt={order.created_at} now={now} final={final} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={order.delivery_type === 'DELIVERY' ? 'info' : order.delivery_type === 'DINE_IN' ? 'success' : 'gold'}>
            <TypeIcon type={order.delivery_type} />
            {order.delivery_type === 'DINE_IN' && order.table_number ? `${order.table_number}-stol` : deliveryTypeLabel(order.delivery_type)}
          </Badge>
          {order.order_source === 'QR' && <Badge tone="gold">Stol QR</Badge>}
          {showStatus && <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>}
          {order.is_paid && <Badge tone="success">To'langan</Badge>}
          <FilialTag order={order} />
        </div>

        {preview.length > 0 && (
          <ul className="mt-2.5 space-y-0.5 text-[13px] text-ink">
            {preview.map((it, i) => (
              <li key={it.uuid || i} className="flex gap-1.5 min-w-0">
                <span className="font-bold tabular-nums shrink-0">{it.quantity}×</span>
                <span className="truncate">{itemName(it)}</span>
              </li>
            ))}
            {more > 0 && <li className="text-muted text-[12px]">yana {more} ta mahsulot</li>}
          </ul>
        )}

        {!dense && order.delivery_type === 'DELIVERY' && <div className="mt-2"><LocationBadge order={order} /></div>}

        {!dense && (order.contact_name || (order.delivery_type === 'DELIVERY' && order.address)) && (
          <div className="mt-2 space-y-0.5 text-[12px] text-muted">
            {order.contact_name && (
              <p className="flex items-center gap-1 truncate">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{order.contact_name}</span>
              </p>
            )}
            {order.delivery_type === 'DELIVERY' && order.address && (
              <p className="flex items-center gap-1 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{order.address}</span>
              </p>
            )}
          </div>
        )}

        {order.reject_reason && (order.status === 'REJECTED' || order.status === 'CANCELLED') && (
          <p className="mt-2 text-[12px] font-semibold text-danger-ink bg-danger-soft rounded-lg px-2 py-1 line-clamp-2">
            Sabab: {order.reject_reason}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[17px] font-black text-ink tracking-tightest tabular-nums">{formatMoney(order.total_price)}</span>
          <ChevronRight className="w-4 h-4 text-subtle" />
        </div>
      </button>

      {!primary && !danger && isHandedToCourier(order) && (
        <p className="px-3.5 pb-3.5 text-[12px] font-semibold text-muted">Kuryerda — holatni kuryer boshqaradi</p>
      )}

      {(primary || danger) && (
        <div className="px-3.5 pb-3.5">
          {pending ? (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              {danger && (
                <Button
                  variant="danger-soft"
                  size="lg"
                  disabled={busy}
                  onClick={() => onAction(danger)}
                  icon={<X className="w-5 h-5" />}
                  aria-label="Rad etish"
                  className="px-4"
                >
                  <span className={dense ? 'sr-only' : ''}>Rad etish</span>
                </Button>
              )}
              {primary && (
                <Button variant="success" size="lg" block loading={busy} onClick={() => onAction(primary)} icon={<Check className="w-5 h-5" />}>
                  Qabul qilish
                </Button>
              )}
            </div>
          ) : (
            primary && (
              <Button variant="primary" size="lg" block loading={busy} onClick={() => onAction(primary)}>
                {primary.label}
              </Button>
            )
          )}
        </div>
      )}
    </article>
  );
};
