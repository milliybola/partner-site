import React from 'react';
import { Ban, Bike, CreditCard, FileText, MapPin, MessageSquare, Pencil, Phone, Printer, Store, User, Utensils } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { Badge, Button, Sheet } from '../../../../core/ui';
import { formatDateTime, formatMoney, formatPhone } from '../../../../core/lib/format';
import { deliveryTypeLabel, paymentLabel, statusLabel, statusTone } from '../../utils/status';
import { getQueueActions, HANDED_NOTE, isFinal, isHandedToCourier, itemName, itemPrice, orderNo } from './actions';
import type { ActionContext, QueueAction } from './actions';
import { ElapsedChip } from './OrderCard';
import { DeliveryAddressSection, LocationBadge } from './DeliveryAddressSection';
import { FilialTag } from './FilialTag';

const SOURCE_LABEL: Record<string, string> = {
  WAITER: 'Ofitsiant',
  QR: 'Stol QR (mijoz)',
  CUSTOMER: 'Mijoz (ilova)',
  PARTNER: 'Kassa',
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2">
    <span className="w-8 h-8 rounded-xl bg-field text-muted flex items-center justify-center shrink-0">{icon}</span>
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="text-[14px] font-semibold text-ink break-words">{children}</div>
    </div>
  </div>
);

interface Props {
  order: Order | null;
  now: number;
  ctx: ActionContext;
  busy: boolean;
  printing: boolean;
  onClose: () => void;
  onAction: (order: Order, a: QueueAction) => void;
  onEdit: (order: Order) => void;
  onPrintReceipt: (order: Order, withQr: boolean) => void;
  onPrintPreCheck: (order: Order) => void;
  onOrderPatched: (uuid: string, patch: Partial<Order>) => void;
}

export const OrderDetailSheet: React.FC<Props> = ({ order, now, ctx, busy, printing, onClose, onAction, onEdit, onPrintReceipt, onPrintPreCheck, onOrderPatched }) => {
  if (!order) return null;
  const { primary, secondary, danger } = getQueueActions(order, ctx);
  const items = order.items || [];
  // Server hisoblagan qator summasi (aksiya, variant, kg/qadoq hisobga olingan); eski buyurtmada yo'q bo'lsa — narx × miqdor
  const lineTotal = (it: (typeof items)[number]) =>
    it.line_total !== undefined && it.line_total !== null && it.line_total !== '' ? Number(it.line_total) : itemPrice(it) * (Number(it.quantity) || 0);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const discount = Number(order.discount_amount) || 0;
  const final = isFinal(order.status);
  const hasComment = order.description && order.description !== "Izoh yo'q";

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2 flex-wrap">
          Buyurtma {orderNo(order)}
          <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
          <LocationBadge order={order} />
          <FilialTag order={order} />
        </span>
      }
      subtitle={
        <span className="inline-flex items-center gap-2">
          {formatDateTime(order.created_at)} <ElapsedChip createdAt={order.created_at} now={now} final={final} />
        </span>
      }
      headerAction={
        !final ? (
          <Button variant="secondary" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => onEdit(order)}>
            <span className="hidden xs:inline">Tahrirlash</span>
          </Button>
        ) : undefined
      }
      footer={
        primary || danger || secondary.length ? (
          <div className="w-full flex flex-col md:flex-row-reverse gap-2">
            {primary && (
              <Button size="xl" block className="md:w-auto md:flex-1" loading={busy} onClick={() => onAction(order, primary)}>
                {primary.label}
              </Button>
            )}
            {secondary.map((a) => (
              <Button key={a.kind} variant="outline" size="lg" block className="md:w-auto" disabled={busy} onClick={() => onAction(order, a)}>
                {a.label}
              </Button>
            ))}
            {danger && (
              <Button variant="danger-soft" size="lg" block className="md:w-auto" disabled={busy} onClick={() => onAction(order, danger)}>
                {danger.label}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {order.reject_reason && (order.status === 'REJECTED' || order.status === 'CANCELLED') && (
          <div className="rounded-2xl bg-danger-soft text-danger-ink px-4 py-3 flex gap-2.5">
            <Ban className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-wider opacity-80">
                {order.status === 'REJECTED' ? 'Rad etish sababi' : 'Bekor qilish sababi'}
              </div>
              <p className="text-[14px] font-semibold break-words">{order.reject_reason}</p>
            </div>
          </div>
        )}
        {isHandedToCourier(order) && (
          <div className="rounded-2xl bg-info-soft text-info px-4 py-3 flex gap-2.5">
            <Bike className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-[14px] font-semibold">{HANDED_NOTE}</p>
          </div>
        )}
        {/* Items */}
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-1">Tarkib · {items.length} xil</h3>
          <div className="divide-y divide-edge">
            {items.map((it, i) => {
              const price = itemPrice(it);
              const qty = Number(it.quantity) || 0;
              const free = Number(it.free_quantity) || 0;
              const itemDiscount = Number(it.discount_amount) || 0;
              const options = it.options ?? [];
              const qtyText = it.unit === 'KG' ? `${Number(qty.toFixed(3))} kg` : `${qty}×`;
              return (
                <div key={it.uuid || i} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex gap-2">
                    <span className="min-w-[32px] h-7 px-1.5 rounded-lg bg-field text-ink text-[13px] font-extrabold flex items-center justify-center tabular-nums whitespace-nowrap">
                      {qtyText}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink">
                        {itemName(it)}
                        {it.packaging_name && <span className="text-muted font-medium"> · {it.packaging_name}</span>}
                      </p>
                      {options.length > 0 && (
                        <p className="text-[12px] text-muted">
                          {options.map((o) => (Number(o.price_delta) > 0 ? `${o.name} (+${formatMoney(o.price_delta, false)})` : o.name)).join(', ')}
                        </p>
                      )}
                      <p className="text-[12px] text-muted tabular-nums">{formatMoney(price)}</p>
                      {(free > 0 || it.promotion_label) && (
                        <p className="text-[12px] font-bold text-brand">
                          {it.promotion_label || 'Aksiya'}{free > 0 && `: ${free} ta bepul`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-[14px] font-bold text-ink tabular-nums">{formatMoney(lineTotal(it))}</span>
                    {itemDiscount > 0 && <span className="block text-[12px] text-brand tabular-nums">−{formatMoney(itemDiscount)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-3 border-t border-edge space-y-1.5 text-[14px]">
            <div className="flex justify-between text-muted">
              <span>Mahsulotlar</span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-brand">
                <span>Chegirma / aksiya</span>
                <span className="tabular-nums">−{formatMoney(discount)}</span>
              </div>
            )}
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between text-muted">
                <span>Yetkazib berish</span>
                <span className="tabular-nums">{formatMoney(order.delivery_fee)}</span>
              </div>
            )}
            {Number(order.service_charge_amount) > 0 && (
              <div className="flex justify-between text-muted">
                <span>Xizmat haqi{Number(order.service_charge_percent) > 0 ? ` (${order.service_charge_percent}%)` : ''}</span>
                <span className="tabular-nums">{formatMoney(order.service_charge_amount!)}</span>
              </div>
            )}
            <div className="flex justify-between text-[17px] font-black text-ink pt-1">
              <span>Jami</span>
              <span className="tabular-nums">{formatMoney(order.total_price)}</span>
            </div>
          </div>
        </section>

        {hasComment && (
          <div className="rounded-2xl bg-gold-soft text-gold-ink px-4 py-3 flex gap-2.5">
            <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-[14px] font-semibold">{order.description}</p>
          </div>
        )}

        {order.delivery_type === 'DELIVERY' && !final && <DeliveryAddressSection key={order.uuid} order={order} onPatched={onOrderPatched} />}

        {/* Customer & delivery */}
        <section className="rounded-2xl border border-edge px-3 py-1 divide-y divide-edge">
          <InfoRow icon={order.delivery_type === 'DINE_IN' ? <Utensils className="w-4 h-4" /> : <Bike className="w-4 h-4" />} label="Turi">
            {deliveryTypeLabel(order.delivery_type)}
            {order.table_number ? ` · ${order.table_number}-stol` : ''}
          </InfoRow>
          {order.contact_name && (
            <InfoRow icon={<User className="w-4 h-4" />} label="Mijoz">
              {order.contact_name}
            </InfoRow>
          )}
          {order.contact_phone && (
            <InfoRow icon={<Phone className="w-4 h-4" />} label="Telefon">
              <a href={`tel:${order.contact_phone}`} className="text-brand hover:underline">
                {formatPhone(order.contact_phone)}
              </a>
            </InfoRow>
          )}
          {order.delivery_type === 'DELIVERY' && order.address && (
            <InfoRow icon={<MapPin className="w-4 h-4" />} label="Manzil">
              {order.address}
              {order.distance ? <span className="text-muted font-medium"> · {order.distance} km</span> : null}
            </InfoRow>
          )}
          {(order.courier_phone || order.courier?.phone) && (
            <InfoRow icon={<Bike className="w-4 h-4" />} label="Kuryer">
              {order.courier?.full_name || [order.courier?.first_name, order.courier?.last_name].filter(Boolean).join(' ')}{' '}
              <a href={`tel:${order.courier_phone || order.courier?.phone}`} className="text-brand hover:underline">
                {formatPhone(order.courier_phone || order.courier?.phone || '')}
              </a>
            </InfoRow>
          )}
          <InfoRow icon={<CreditCard className="w-4 h-4" />} label="To'lov">
            <span className="inline-flex items-center gap-2">
              {order.payment_method_display || paymentLabel(order.payment_method || order.payment)}
              <Badge tone={order.is_paid ? 'success' : 'warning'}>{order.is_paid ? "To'langan" : "To'lanmagan"}</Badge>
            </span>
          </InfoRow>
          {order.order_source && (
            <InfoRow icon={<Store className="w-4 h-4" />} label="Manba">
              {order.order_source_display || SOURCE_LABEL[order.order_source] || order.order_source}
            </InfoRow>
          )}
        </section>

        {/* Printing */}
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-2">Chop etish</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" className="flex-col !h-auto py-3 text-[12px]" onClick={() => onPrintPreCheck(order)} icon={<FileText className="w-5 h-5" />}>
              Pre-chek
            </Button>
            <Button variant="secondary" size="lg" className="flex-col !h-auto py-3 text-[12px]" loading={printing} onClick={() => onPrintReceipt(order, false)} icon={<Printer className="w-5 h-5" />}>
              Chek
            </Button>
          </div>
        </section>
      </div>
    </Sheet>
  );
};
