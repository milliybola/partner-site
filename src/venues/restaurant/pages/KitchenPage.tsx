import React, { useEffect, useMemo, useState } from 'react';
import { Bike, ChefHat, Flame, ShoppingBag, StickyNote, Utensils, Wifi, WifiOff } from 'lucide-react';
import type { Order } from '../../../features/orders/services/ordersApi';
import { ElapsedChip } from '../../../features/orders/components/queue/OrderCard';
import { itemName, orderNo } from '../../../features/orders/components/queue/actions';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SkeletonList, Tabs } from '../../../core/ui';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { parseDate } from '../../../core/lib/format';
import { useLiveOrders } from '../../shared/useLiveOrders';

type Column = 'NEW' | 'COOKING' | 'READY';

const COLUMNS: { key: Column; label: string; statuses: string[]; tone: 'gold' | 'warning' | 'success' }[] = [
  { key: 'NEW', label: 'Yangi', statuses: ['PENDING', 'SEARCHING_COURIER'], tone: 'gold' },
  { key: 'COOKING', label: 'Tayyorlanmoqda', statuses: ['ACCEPTED', 'PREPARING'], tone: 'warning' },
  { key: 'READY', label: 'Tayyor', statuses: ['READY_FOR_PICKUP'], tone: 'success' },
];

const TypeChip: React.FC<{ order: Order }> = ({ order }) => {
  if (order.delivery_type === 'DINE_IN')
    return (
      <Badge tone="info">
        <Utensils className="w-3.5 h-3.5" />
        {order.table_number ? `Stol ${order.table_number}` : 'Zalda'}
      </Badge>
    );
  if (order.delivery_type === 'PICKUP')
    return (
      <Badge tone="neutral">
        <ShoppingBag className="w-3.5 h-3.5" />
        Olib ketish
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <Bike className="w-3.5 h-3.5" />
      Yetkazish
    </Badge>
  );
};

const Ticket: React.FC<{
  order: Order;
  now: number;
  fresh: boolean;
  busy: boolean;
  onAdvance?: () => void;
  advanceLabel?: string;
  onReject?: () => void;
}> = ({ order, now, fresh, busy, onAdvance, advanceLabel, onReject }) => (
  <article className={`bg-surface rounded-2xl border p-4 space-y-3 ${fresh ? 'animate-new-order border-brand-bright' : 'border-edge'}`}>
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[18px] font-black text-ink tracking-tightest">{orderNo(order)}</span>
        <TypeChip order={order} />
      </div>
      <ElapsedChip createdAt={order.created_at} now={now} />
    </header>

    <ul className="space-y-1.5">
      {order.items.map((it, i) => {
        const options: { name: string }[] = (it as { options?: { name: string }[] }).options ?? [];
        return (
          <li key={it.uuid ?? i} className="flex items-start gap-3">
            <span className="min-w-[34px] h-8 px-1.5 rounded-lg bg-field text-ink text-[16px] font-black flex items-center justify-center tabular-nums">
              {Number(it.quantity)}×
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="text-[16px] font-bold text-ink leading-snug">{itemName(it)}</div>
              {options.length > 0 && <div className="text-[13px] text-muted">{options.map((o) => o.name).join(', ')}</div>}
            </div>
          </li>
        );
      })}
    </ul>

    {order.description && (
      <div className="flex items-start gap-2 rounded-xl bg-warning-soft text-warning-ink px-3 py-2 text-[14px] font-semibold">
        <StickyNote className="w-4 h-4 mt-0.5 shrink-0" />
        {order.description}
      </div>
    )}

    {(onAdvance || onReject) && (
      <div className="flex gap-2 pt-1">
        {onReject && (
          <Button variant="danger-soft" size="lg" disabled={busy} onClick={onReject}>
            Rad etish
          </Button>
        )}
        {onAdvance && (
          <Button variant="primary" size="lg" block loading={busy} onClick={onAdvance}>
            {advanceLabel}
          </Button>
        )}
      </div>
    )}
  </article>
);

/** Restoran: oshxona (KDS) ekrani — navbat Yangi → Tayyorlanmoqda → Tayyor, katta shrift va katta tugmalar. */
const KitchenPage: React.FC = () => {
  const { orders, loading, error, refresh, busyUuid, freshUuids, isConnected, setStatus } = useLiveOrders();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Column>('NEW');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const grouped = useMemo(() => {
    const ts = (o: Order) => parseDate(o.created_at)?.getTime() ?? 0;
    return Object.fromEntries(
      COLUMNS.map((c) => [c.key, orders.filter((o) => c.statuses.includes(o.status)).sort((a, b) => ts(a) - ts(b))]),
    ) as Record<Column, Order[]>;
  }, [orders]);

  const reject = async (o: Order) => {
    if (await confirm(`${orderNo(o)} buyurtmani rad etasizmi?`, { danger: true, confirmText: 'Rad etish' })) {
      await setStatus(o, 'REJECTED', 'Buyurtma rad etildi');
    }
  };

  const renderTicket = (col: Column, o: Order) => {
    const common = { order: o, now, fresh: freshUuids.has(o.uuid), busy: busyUuid === o.uuid };
    if (col === 'NEW')
      return <Ticket key={o.uuid} {...common} advanceLabel="Qabul qilish" onAdvance={() => setStatus(o, 'ACCEPTED')} onReject={() => reject(o)} />;
    if (col === 'COOKING')
      return o.status === 'PREPARING' ? (
        <Ticket key={o.uuid} {...common} advanceLabel="Tayyor" onAdvance={() => setStatus(o, 'READY_FOR_PICKUP', `${orderNo(o)} tayyor`)} />
      ) : (
        <Ticket key={o.uuid} {...common} advanceLabel="Tayyorlashni boshlash" onAdvance={() => setStatus(o, 'PREPARING')} />
      );
    return <Ticket key={o.uuid} {...common} />;
  };

  const activeCount = grouped.NEW.length + grouped.COOKING.length + grouped.READY.length;

  return (
    <div className="pb-6">
      <PageHeader
        title="Oshxona ekrani"
        subtitle={`${grouped.NEW.length} yangi · ${grouped.COOKING.length} tayyorlanmoqda · ${grouped.READY.length} tayyor`}
        actions={
          <span
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-bold ${
              isConnected ? 'bg-brand-soft text-brand' : 'bg-warning-soft text-warning-ink'
            }`}
          >
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? 'Jonli' : 'Aloqa uzilgan'}
          </span>
        }
      >
        <div className="md:hidden">
          <Tabs value={tab} onChange={setTab} options={COLUMNS.map((c) => ({ value: c.key, label: c.label, count: grouped[c.key].length }))} />
        </div>
      </PageHeader>

      {loading ? (
        <SkeletonList rows={3} className="mt-4" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : activeCount === 0 ? (
        <EmptyState
          icon={<ChefHat className="w-7 h-7" />}
          title="Hozircha buyurtma yo'q"
          description="Yangi buyurtma kelganda shu yerda va ovoz bilan paydo bo'ladi."
        />
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-3 items-start">
          {COLUMNS.map((c) => (
            <section key={c.key} className={`${tab === c.key ? 'block' : 'hidden'} md:block space-y-3`}>
              <h2 className="hidden md:flex items-center gap-2 text-[15px] font-extrabold text-ink">
                {c.key === 'COOKING' && <Flame className="w-4 h-4 text-warning" />}
                {c.label}
                <Badge tone={c.tone}>{grouped[c.key].length}</Badge>
              </h2>
              {grouped[c.key].length === 0 ? (
                <div className="rounded-2xl border border-dashed border-edge-strong py-8 text-center text-[14px] text-muted">Bo'sh</div>
              ) : (
                grouped[c.key].map((o) => renderTicket(c.key, o))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default KitchenPage;
