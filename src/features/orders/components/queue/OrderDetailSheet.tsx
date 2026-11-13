import React, { useState } from 'react';
import { BadgePercent, Ban, Bike, CreditCard, FileText, Hash, Lock, MapPin, UserRound, MessageSquare, Pencil, Phone, Printer, Store, User, Utensils } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { t } from '../../../../core/i18n';
import { isAwaitingQrConfirm, opensNewBill } from '../../services/ordersApi';
import { Badge, Button, Sheet } from '../../../../core/ui';
import { formatDateTime, formatMoney, formatPhone } from '../../../../core/lib/format';
import { deliveryTypeLabel, paymentLabel, statusLabel, statusTone } from '../../utils/status';
import { getQueueActions, HANDED_NOTE, isCancelManagerOnly, isFinal, isHandedToCourier, itemName, itemPrice, orderNo } from './actions';
import type { ActionContext, QueueAction } from './actions';
import { ElapsedChip } from './OrderCard';
import { DeliveryAddressSection, LocationBadge } from './DeliveryAddressSection';
import { FilialTag } from './FilialTag';
import { DiscountSheet, discountableOrder, useCanDiscount } from '../DiscountSheet';

const SOURCE_LABEL: Record<string, string> = {
  WAITER: t('role.waiter'),
  QR: t('detail.srcQr'),
  CUSTOMER: t('detail.srcCustomer'),
  PARTNER: t('detail.srcPos'),
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
  /** Stol buyurtmasi: ofitsiant biriktirish / almashtirish */
  onPickWaiter?: (order: Order) => void;
}

export const OrderDetailSheet: React.FC<Props> = ({ order, now, ctx, busy, printing, onClose, onAction, onEdit, onPrintReceipt, onPrintPreCheck, onOrderPatched, onPickWaiter }) => {
  const canDiscount = useCanDiscount();
  const [discountOpen, setDiscountOpen] = useState(false);
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
  // O'z-o'ziga xizmat: stol yo'q, mijoz raqam bilan chaqiriladi, pul oldindan olingan — tarkib qulf
  const selfService = !!order.hall_uuid;
  // To'langan buyurtma tarkibi qulf (server 409 ORDER_PAID); stol/olib ketishda yangi taom alohida hisobga yoziladi
  const locked = !!order.is_paid && !opensNewBill(order);
  // Kassir: to'langan buyurtmani bekor qilish tugmasi yashirilgan — sababini aytamiz
  const cancelManagerOnly = isCancelManagerOnly(order, ctx);
  const parts = order.payment_breakdown || [];
  // 1-bosqich: mijoz cheki va pre-chek yo'q (Q51); tahrir — faqat to'lanmagan buyurtmadan taomni olib tashlash (Q54)
  const posStage = ctx.pos !== false;
  const editable = !final && !locked && (posStage || !order.is_paid);
  // Qo'lda chegirma (A10): faqat menejer/rahbar, 2-bosqich, to'lanmagan va onlayn to'lovsiz buyurtma
  const manualDiscount = Math.round(Number(order.manual_discount_amount) || 0);
  const manualPercent = Number(order.manual_discount_percent) || 0;
  const showDiscountBtn = canDiscount && discountableOrder(order) && items.length > 0;

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2 flex-wrap">
          {order.call_number ? (
            <span className="h-8 px-2.5 rounded-lg bg-ink text-white text-[20px] font-black tabular-nums flex items-center" title={t('card.callNumber')}>
              № {order.call_number}
            </span>
          ) : null}
          {t('detail.title', { n: orderNo(order) })}
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
        editable ? (
          <Button variant="secondary" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => onEdit(order)}>
            <span className="hidden xs:inline">{t('detail.edit')}</span>
          </Button>
        ) : undefined
      }
      footer={
        primary || danger || secondary.length || cancelManagerOnly ? (
          <div className="w-full min-w-0 flex flex-col gap-2">
            {primary && (
              <Button size="xl" block loading={busy} onClick={() => onAction(order, primary)}>
                {primary.label}
              </Button>
            )}
            {(secondary.length > 0 || danger) && (
              <div className="flex flex-wrap gap-2">
                {secondary.map((a) => (
                  <Button key={a.kind} variant="outline" size="lg" className="flex-1 min-w-[150px]" disabled={busy} onClick={() => onAction(order, a)}>
                    {a.label}
                  </Button>
                ))}
                {danger && (
                  <Button variant="danger-soft" size="lg" className="flex-1 min-w-[150px]" disabled={busy} onClick={() => onAction(order, danger)}>
                    {danger.label}
                  </Button>
                )}
              </div>
            )}
            {cancelManagerOnly && (
              <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-muted">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                {t('cancel.managerOnlyHint')}
              </p>
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
                {order.status === 'REJECTED' ? t('detail.rejectReason') : t('detail.cancelReason')}
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
        {locked && !final && (
          <div className="rounded-2xl bg-info-soft text-info px-4 py-3 text-[13px] font-semibold">
            {t('detail.prepaidLocked')}
          </div>
        )}
        {/* Items */}
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-1">{t('detail.items', { n: items.length })}</h3>
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
                          {it.promotion_label || t('detail.promo')}{free > 0 && t('detail.freeQty', { n: free })}
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
              <span>{t('detail.products')}</span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-brand">
                <span>{t('detail.discount')}</span>
                <span className="tabular-nums">−{formatMoney(discount)}</span>
              </div>
            )}
            {manualDiscount > 0 && (
              <div className="flex justify-between gap-3 text-brand font-semibold">
                <span className="min-w-0">
                  {t('disc.line')}
                  {manualPercent > 0 ? ` (${Number(manualPercent.toFixed(2))}%)` : ''}
                  {order.manual_discount_reason && <span className="block text-[12px] font-medium text-muted break-words">{order.manual_discount_reason}{order.manual_discount_by ? ` · ${t('disc.by', { n: order.manual_discount_by })}` : ''}</span>}
                </span>
                <span className="tabular-nums shrink-0">−{formatMoney(manualDiscount)}</span>
              </div>
            )}
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between text-muted">
                <span>{t('type.delivery')}</span>
                <span className="tabular-nums">{formatMoney(order.delivery_fee)}</span>
              </div>
            )}
            {Number(order.service_charge_amount) > 0 && (
              <div className="flex justify-between text-muted">
                <span>{t('detail.serviceCharge')}{Number(order.service_charge_percent) > 0 ? ` (${order.service_charge_percent}%)` : ''}</span>
                <span className="tabular-nums">{formatMoney(order.service_charge_amount!)}</span>
              </div>
            )}
            <div className="flex justify-between text-[17px] font-black text-ink pt-1">
              <span>{t('common.total')}</span>
              <span className="tabular-nums">{formatMoney(order.total_price)}</span>
            </div>
            {showDiscountBtn && (
              <Button variant="outline" size="md" block className="mt-1" icon={<BadgePercent className="w-4 h-4" />} disabled={busy} onClick={() => setDiscountOpen(true)}>
                {manualDiscount > 0 ? t('disc.change') : t('disc.btn')}
              </Button>
            )}
          </div>
        </section>
        {showDiscountBtn && (
          <DiscountSheet
            open={discountOpen}
            onClose={() => setDiscountOpen(false)}
            orderUuid={order.uuid}
            label={order.table_number ? `${t('table.n', { n: order.table_number })} · #${orderNo(order)}` : `#${orderNo(order)}`}
            subtotal={subtotal}
            serviceChargePercent={Number(order.service_charge_percent) || 0}
            deliveryFee={Number(order.delivery_fee) || 0}
            current={manualDiscount > 0 ? { amount: manualDiscount, percent: manualPercent, reason: order.manual_discount_reason } : null}
            onDone={(res) => {
              if (!res) return;
              onOrderPatched(order.uuid, {
                total_price: res.total_price,
                service_charge_amount: res.service_charge_amount,
                service_charge_percent: res.service_charge_percent,
                manual_discount_amount: res.manual_discount_amount,
                manual_discount_percent: res.manual_discount_percent,
                manual_discount_reason: res.manual_discount_reason,
                manual_discount_by: res.manual_discount_by,
                manual_discount_at: res.manual_discount_at,
              });
            }}
          />
        )}

        {hasComment && (
          <div className="rounded-2xl bg-gold-soft text-gold-ink px-4 py-3 flex gap-2.5">
            <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-[14px] font-semibold">{order.description}</p>
          </div>
        )}

        {order.delivery_type === 'DELIVERY' && !final && <DeliveryAddressSection key={order.uuid} order={order} onPatched={onOrderPatched} />}

        {/* Customer & delivery */}
        <section className="rounded-2xl border border-edge px-3 py-1 divide-y divide-edge">
          <InfoRow icon={order.delivery_type === 'DINE_IN' ? <Utensils className="w-4 h-4" /> : <Bike className="w-4 h-4" />} label={t('detail.type')}>
            {selfService
              ? t('detail.selfService', { n: order.hall_name || order.table_number || t('detail.hall') })
              : `${deliveryTypeLabel(order.delivery_type)}${order.table_number ? ` · ${t('table.n', { n: order.table_number })}` : ''}`}
          </InfoRow>
          {order.call_number ? (
            <InfoRow icon={<Hash className="w-4 h-4" />} label={t('card.callNumber')}>
              № {order.call_number}
            </InfoRow>
          ) : null}
          {order.delivery_type === 'DINE_IN' && !selfService && order.table_number && (
            <InfoRow icon={<UserRound className="w-4 h-4" />} label={t('role.waiter')}>
              <span className="inline-flex items-center gap-2 flex-wrap">
                {order.waiter_role === 'waiter' ? order.waiter_name : <span className="text-warning-ink">{t('detail.notAssigned')}</span>}
                {onPickWaiter && !final && !isAwaitingQrConfirm(order) && (
                  <button type="button" onClick={() => onPickWaiter(order)} className="text-[13px] font-bold text-brand hover:underline cursor-pointer">
                    {order.waiter_role === 'waiter' ? t('detail.change') : t('detail.assign')}
                  </button>
                )}
              </span>
            </InfoRow>
          )}
          {order.contact_name && (
            <InfoRow icon={<User className="w-4 h-4" />} label={t('detail.customer')}>
              {order.contact_name}
            </InfoRow>
          )}
          {order.contact_phone && (
            <InfoRow icon={<Phone className="w-4 h-4" />} label={t('detail.phone')}>
              <a href={`tel:${order.contact_phone}`} className="text-brand hover:underline">
                {formatPhone(order.contact_phone)}
              </a>
            </InfoRow>
          )}
          {order.delivery_type === 'DELIVERY' && order.address && (
            <InfoRow icon={<MapPin className="w-4 h-4" />} label={t('detail.address')}>
              {order.address}
              {order.distance ? <span className="text-muted font-medium"> · {order.distance} km</span> : null}
            </InfoRow>
          )}
          {(order.courier_phone || order.courier?.phone) && (
            <InfoRow icon={<Bike className="w-4 h-4" />} label={t('detail.courier')}>
              {order.courier?.full_name || [order.courier?.first_name, order.courier?.last_name].filter(Boolean).join(' ')}{' '}
              <a href={`tel:${order.courier_phone || order.courier?.phone}`} className="text-brand hover:underline">
                {formatPhone(order.courier_phone || order.courier?.phone || '')}
              </a>
            </InfoRow>
          )}
          <InfoRow icon={<CreditCard className="w-4 h-4" />} label={t('detail.payment')}>
            <span className="inline-flex items-center gap-2 flex-wrap">
              {parts.length > 1
                ? parts.map((p) => `${paymentLabel(p.method)} ${formatMoney(p.amount)}`).join(' + ')
                : order.payment_method_display || paymentLabel(order.payment_method || order.payment)}
              <Badge tone={order.is_paid ? 'success' : 'warning'}>
                {order.is_paid ? (selfService ? t('detail.prepaid') : t('card.paid')) : t('detail.unpaid')}
              </Badge>
            </span>
          </InfoRow>
          {order.order_source && (
            <InfoRow icon={<Store className="w-4 h-4" />} label={t('detail.source')}>
              {order.order_source_display || SOURCE_LABEL[order.order_source] || order.order_source}
            </InfoRow>
          )}
        </section>

        {/* Printing */}
        {posStage && (
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-2">{t('detail.printing')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {!locked && (
              <Button variant="secondary" size="lg" className="flex-col !h-auto py-3 text-[12px]" onClick={() => onPrintPreCheck(order)} icon={<FileText className="w-5 h-5" />}>
                {t('detail.preCheck')}
              </Button>
            )}
            <Button variant="secondary" size="lg" className={`flex-col !h-auto py-3 text-[12px] ${locked ? 'col-span-2' : ''}`} loading={printing} onClick={() => onPrintReceipt(order, false)} icon={<Printer className="w-5 h-5" />}>
              {locked ? t('detail.reprint') : t('offline.receipt')}
            </Button>
          </div>
        </section>
        )}
      </div>
    </Sheet>
  );
};
