import React from 'react';
import { Bike, Clock, MapPin, Navigation, Phone, Plus, User } from 'lucide-react';
import { EmptyState } from '../../../core/ui';
import { formatMoney, formatPhone, minutesSince } from '../../../core/lib/format';
import { orderNo } from '../../orders/components/queue/actions';
import type { Order } from '../../orders/services/ordersApi';
import { statusGroup, statusLabel } from '../../orders/utils/status';
import type { QueueGroup } from '../../orders/utils/status';
import type { CourierModel } from '../../staff/services/couriersApi';
import { courierColor, normPhone, orderCourierKey } from '../lib/courierColors';
import { t } from '../../../core/i18n';

/** Buyurtma holati chizig'i: yangi — sariq, tayyorlanmoqda — yashil, tayyor — ko'k, yo'lda — to'q */
const GROUP_CHIP: Record<QueueGroup, string> = {
  NEW: 'bg-warning text-ink',
  PREPARING: 'bg-brand-bright text-white',
  READY: 'bg-info text-white',
  ON_THE_WAY: 'bg-ink text-white',
  DONE: 'bg-field text-muted',
};

const STATUS_DOT: Record<string, string> = { online: '#16a34a', busy: '#f59e0b', offline: '#94a3b8' };
const STATUS_LABEL: Record<string, string> = { online: t('bar.online'), busy: t('courier.busy'), offline: t('courier.offline') };
const rank = (s?: string) => (s === 'online' ? 0 : s === 'busy' ? 1 : 2);

const toNum = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

/** Ikki nuqta orasidagi masofa (km) */
const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dp = rad(b.lat - a.lat);
  const dl = rad(b.lng - a.lng);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const mapUrl = (lat: number, lng: number) => `https://yandex.uz/maps/?pt=${lng},${lat}&z=16&l=map`;

const agoLabel = (iso: string | undefined, now: number) => {
  const ts = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(ts)) return { text: '', stale: true };
  const m = Math.max(0, Math.round((now - ts) / 60000));
  return { text: m < 1 ? t('card.now') : m < 60 ? t('time.ago', { n: m }) : t('time.hAgo', { n: Math.floor(m / 60) }), stale: m >= 5 };
};

const OrderCard: React.FC<{ order: Order; now: number; accent: string; onOpen: () => void; cta?: string; distanceKm?: number | null }> = ({ order, now, accent, onOpen, cta, distanceKm }) => {
  const mins = minutesSince(order.created_at, now);
  const who = order.contact_name || order.contact_phone;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl bg-surface border border-edge hover:shadow-card active:scale-[0.99] transition cursor-pointer overflow-hidden"
      style={{ borderLeft: `5px solid ${accent}` }}
    >
      <span className="block p-2.5 space-y-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-[16px] font-black tracking-tightest leading-none text-ink">{orderNo(order)}</span>
          <span className="text-[14px] font-black tabular-nums leading-none text-ink whitespace-nowrap">{formatMoney(order.total_price)}</span>
        </span>
        {who && (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-muted truncate">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{who}</span>
          </span>
        )}
        {order.address && (
          <span className="flex items-start gap-1 text-[12px] font-semibold text-muted">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{order.address}</span>
          </span>
        )}
        <span className="flex items-center justify-between gap-2 pt-0.5">
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${GROUP_CHIP[statusGroup(order.status)]}`}>{statusLabel(order.status)}</span>
          <span className={`inline-flex items-center gap-1 text-[12px] tabular-nums ${mins >= 60 ? 'font-black text-danger' : 'font-semibold text-muted'}`}>
            <Clock className="w-3.5 h-3.5" />
            {mins >= 60 ? t('time.hm', { h: Math.floor(mins / 60), m: mins % 60 }) : t('card.min', { n: mins })}
          </span>
        </span>
        {distanceKm != null && (
          <span className="flex items-center gap-1 text-[12px] font-extrabold text-ink">
            <Navigation className="w-3.5 h-3.5 shrink-0" /> {t('dispatch.distance', { n: distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km` })}
          </span>
        )}
        {cta && <span className="block text-center rounded-lg bg-brand text-white text-[12px] font-extrabold py-1.5">{cta}</span>}
      </span>
    </button>
  );
};

const Lane: React.FC<{ header: React.ReactNode; accent: string; tint?: string; children: React.ReactNode }> = ({ header, accent, tint, children }) => (
  <section className="w-[300px] shrink-0 rounded-2xl border border-edge bg-field/60 overflow-hidden flex flex-col" style={{ borderTop: `4px solid ${accent}` }}>
    <header className={`px-3 py-2.5 ${tint || 'bg-surface'}`}>{header}</header>
    <div className="p-2 space-y-2 flex-1">{children}</div>
  </section>
);

const EmptyLane: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-xl border-2 border-dashed border-edge-strong py-6 text-center text-[12px] font-bold text-subtle">{text}</div>
);

/**
 * Dostavka: kuryerlar bo'yicha ustunlar. Har bir kuryer — alohida ustun, uning buyurtmalari shu ustun ichida,
 * birinchi ustun — kuryeri hali biriktirilmagan buyurtmalar. Kim qaysi buyurtmani olib ketayotgani darrov ko'rinadi.
 */
export const DispatchBoard: React.FC<{
  orders: Order[];
  couriers: CourierModel[];
  now: number;
  loading: boolean;
  onNew: () => void;
  onOpen: (uuid: string) => void;
  /** Kuryeri yo'q buyurtmaga shu yerning o'zida kuryer biriktirish */
  onAssign: (order: Order) => void;
}> = ({ orders, couriers, now, loading, onNew, onOpen, onAssign }) => {
  const active = couriers.filter((c) => c.is_active !== false);
  const known = new Set(active.map((c) => normPhone(c.phone)));

  const unassigned = orders.filter((o) => !orderCourierKey(o));
  const byKey = (key: string) => orders.filter((o) => orderCourierKey(o) === key);

  // Ro'yxatda yo'q kuryerlar (masalan, umumiy havzadan) — buyurtmasi bo'lsa ustun ochiladi
  const strangers = new Map<string, { name: string; phone: string }>();
  orders.forEach((o) => {
    const k = orderCourierKey(o);
    if (k && !known.has(k) && !strangers.has(k)) {
      strangers.set(k, {
        name: o.courier?.full_name || [o.courier?.first_name, o.courier?.last_name].filter(Boolean).join(' ') || t('detail.courier'),
        phone: o.courier_phone || o.courier?.phone || '',
      });
    }
  });

  const working = [...active]
    .filter((c) => c.status === 'online' || c.status === 'busy' || byKey(normPhone(c.phone)).length > 0)
    .sort((a, b) => rank(a.status) - rank(b.status) || (a.first_name || '').localeCompare(b.first_name || ''));
  const resting = active.filter((c) => !working.includes(c));

  return (
    <div className="mt-2 space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-3 items-start">
        {/* 1-ustun: kuryer biriktirilmagan */}
        <Lane
          accent="#dc2626"
          tint="bg-danger/10"
          header={
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[15px] font-black text-ink tracking-tightest">{t('dispatch.unassigned')}</div>
                <div className="text-[12px] font-semibold text-muted">{t('dispatch.unassignedHint')}</div>
              </div>
              <span className="min-w-[30px] h-[30px] px-2 rounded-full bg-danger text-white text-[15px] font-black flex items-center justify-center tabular-nums">{unassigned.length}</span>
            </div>
          }
        >
          <button
            type="button"
            onClick={onNew}
            className="w-full rounded-xl border-2 border-dashed border-edge-strong bg-surface py-3 flex items-center justify-center gap-2 text-muted hover:text-brand hover:border-brand/50 transition cursor-pointer text-[13px] font-extrabold"
          >
            <Plus className="w-4 h-4" /> {t('board.newOrder')}
          </button>
          {unassigned.map((o) => (
            <OrderCard key={o.uuid} order={o} now={now} accent="#dc2626" cta={t('act.assignCourier')} onOpen={() => onAssign(o)} />
          ))}
          {!loading && unassigned.length === 0 && <EmptyLane text={t('dispatch.allAssigned')} />}
        </Lane>

        {/* Kuryer ustunlari */}
        {working.map((c) => {
          const key = normPhone(c.phone);
          const color = courierColor(key);
          const mine = byKey(key);
          const load = c.active_orders ?? mine.length;
          const limit = c.max_active_orders ?? 1;
          const st = c.status || 'offline';
          const plate = [c.vehicle_info?.brand, c.vehicle_info?.license_plate].filter(Boolean).join(' · ');
          const loc = c.last_location;
          const ago = agoLabel(loc?.updated_at, now);
          const here = loc ? { lat: toNum(loc.latitude), lng: toNum(loc.longitude) } : null;
          const hasPoint = !!here && here.lat != null && here.lng != null;
          return (
            <Lane
              key={c.uuid}
              accent={color}
              header={
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: STATUS_DOT[st] || STATUS_DOT.offline }} title={STATUS_LABEL[st]} />
                      <span className="text-[15px] font-black text-ink tracking-tightest truncate">{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone}</span>
                    </div>
                    <span className="text-[14px] font-black tabular-nums text-ink">
                      {load}/{limit}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] font-semibold text-muted">
                    <span className="inline-flex items-center gap-1 truncate">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      {formatPhone(c.phone)}
                    </span>
                    {plate && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <Bike className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{plate}</span>
                      </span>
                    )}
                  </div>
                  {hasPoint ? (
                    <a
                      href={mapUrl(here!.lat as number, here!.lng as number)}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12px] font-extrabold ${ago.stale ? 'bg-warning/20 text-ink' : 'bg-brand/10 text-brand'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Navigation className="w-3.5 h-3.5" /> {t('dispatch.onMap')}
                      </span>
                      <span className="font-semibold">{ago.text}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-1 rounded-lg bg-field px-2 py-1.5 text-[12px] font-bold text-muted">
                      <Navigation className="w-3.5 h-3.5" /> {t('dispatch.noLocation')}
                    </div>
                  )}
                  <div className="h-1.5 rounded-full bg-field overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (load / Math.max(1, limit)) * 100)}%`, background: color }} />
                  </div>
                </div>
              }
            >
              {mine.map((o) => {
                const dl = toNum(o.latitude);
                const dg = toNum(o.longitude);
                const dist = hasPoint && dl != null && dg != null ? haversineKm({ lat: here!.lat as number, lng: here!.lng as number }, { lat: dl, lng: dg }) : null;
                return <OrderCard key={o.uuid} order={o} now={now} accent={color} distanceKm={dist} onOpen={() => onOpen(o.uuid)} />;
              })}
              {mine.length === 0 && <EmptyLane text={st === 'online' ? t('dispatch.idle') : t('dispatch.noOrders')} />}
            </Lane>
          );
        })}

        {[...strangers.entries()].map(([key, s]) => {
          const color = courierColor(key);
          return (
            <Lane
              key={key}
              accent={color}
              header={
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-black text-ink tracking-tightest truncate">{s.name}</div>
                    {s.phone && <div className="text-[12px] font-semibold text-muted">{formatPhone(s.phone)}</div>}
                  </div>
                  <span className="text-[14px] font-black tabular-nums text-ink">{byKey(key).length}</span>
                </div>
              }
            >
              {byKey(key).map((o) => (
                <OrderCard key={o.uuid} order={o} now={now} accent={color} onOpen={() => onOpen(o.uuid)} />
              ))}
            </Lane>
          );
        })}
      </div>

      {resting.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{t('dispatch.offlineCouriers')}</span>
          {resting.map((c) => (
            <span key={c.uuid} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-field text-[12px] font-bold text-muted">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_DOT.offline }} />
              {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone}
            </span>
          ))}
        </div>
      )}
      {!loading && active.length === 0 && orders.length === 0 && (
        <EmptyState className="py-8" title={t('board.emptyDelivery')} description={t('dispatch.emptyHint')} />
      )}
    </div>
  );
};
