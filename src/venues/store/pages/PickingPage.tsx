import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Check, ClipboardCheck, ScanBarcode, ShoppingBag } from 'lucide-react';
import type { Order } from '../../../features/orders/services/ordersApi';
import { ElapsedChip } from '../../../features/orders/components/queue/OrderCard';
import { itemName, orderNo } from '../../../features/orders/components/queue/actions';
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, SkeletonList } from '../../../core/ui';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useToast } from '../../../core/components/ToastProvider';
import { formatMoney, parseDate } from '../../../core/lib/format';
import { useLiveOrders } from '../../shared/useLiveOrders';

/** Buyurtma qatori — yig'ish uchun kerakli maydonlar (backend OrderItemReadSerializer) */
interface PickItem {
  uuid: string;
  quantity: number | string;
  unit?: 'PIECE' | 'KG';
  packaging_name?: string;
  free_quantity?: number | string;
  options?: { name: string }[];
  product?: { name?: string; barcode?: string; brand?: string; images?: { image: string; is_main?: boolean }[] } | null;
}

const QUEUE_STATUSES = ['PENDING', 'SEARCHING_COURIER', 'ACCEPTED', 'PREPARING'];
const storageKey = (uuid: string) => `milliygo_picking_${uuid}`;

const loadChecked = (uuid: string): Set<string> => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(storageKey(uuid)) || '[]'));
  } catch {
    return new Set();
  }
};

const saveChecked = (uuid: string, set: Set<string>) => {
  try {
    localStorage.setItem(storageKey(uuid), JSON.stringify([...set]));
  } catch {
    /* xotira mavjud emas — faqat shu sessiyada saqlanadi */
  }
};

const qtyLabel = (it: PickItem) => {
  const q = Number(it.quantity);
  const free = Number(it.free_quantity || 0);
  const base = it.unit === 'KG' ? `${Number(q.toFixed(3))} kg` : `${Math.round(q)} ${it.packaging_name ? it.packaging_name.toLowerCase() : 'dona'}`;
  return free > 0 ? `${base} + ${free} bepul` : base;
};

/** Do'kon: buyurtmani yig'ish (picking) — mahsulotma-mahsulot belgilash, shtrix-kod skaneri, "tayyor" faqat hammasi yig'ilgach. */
const PickingPage: React.FC = () => {
  const { orders, loading, error, refresh, busyUuid, freshUuids, setStatus } = useLiveOrders();
  const confirm = useConfirm();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [checkedByOrder, setCheckedByOrder] = useState<Record<string, Set<string>>>({});
  const [scan, setScan] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(() => {
    const ts = (o: Order) => parseDate(o.created_at)?.getTime() ?? 0;
    return orders.filter((o) => QUEUE_STATUSES.includes(o.status)).sort((a, b) => ts(a) - ts(b));
  }, [orders]);

  // Tanlangan buyurtma navbatdan chiqib ketsa (tayyor/rad etildi) — birinchisiga o'tadi
  const order = queue.find((o) => o.uuid === selected) ?? queue[0] ?? null;
  const items = useMemo(() => (order?.items ?? []) as unknown as PickItem[], [order]);

  // Belgilar buyurtma bo'yicha saqlanadi (sahifa yangilansa ham qoladi)
  const checked = (order && checkedByOrder[order.uuid]) || (order ? loadChecked(order.uuid) : new Set<string>());

  const toggle = (uuid: string) => {
    if (!order) return;
    const next = new Set(checked);
    if (next.has(uuid)) next.delete(uuid);
    else next.add(uuid);
    saveChecked(order.uuid, next);
    setCheckedByOrder((prev) => ({ ...prev, [order.uuid]: next }));
  };

  const done = items.filter((i) => checked.has(i.uuid)).length;
  const all = items.length > 0 && done === items.length;

  const onScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    setScan('');
    if (!code || !order) return;
    const matches = items.filter((i) => i.product?.barcode && i.product.barcode === code);
    if (!matches.length) {
      toast.error(`«${code}» bu buyurtmada yo'q`);
      return;
    }
    const next = matches.find((i) => !checked.has(i.uuid));
    if (!next) {
      toast.info(`${itemName(matches[0].product ? { product: matches[0].product } : matches[0])} allaqachon yig'ilgan`);
      return;
    }
    toggle(next.uuid);
  };

  const finish = async () => {
    if (!order) return;
    if (!all && !(await confirm(`${items.length - done} ta mahsulot yig'ilmagan. Baribir tayyor deb belgilaysizmi?`, { confirmText: 'Ha, tayyor' }))) return;
    if (await setStatus(order, 'READY_FOR_PICKUP', `${orderNo(order)} yig'ildi`)) {
      try {
        localStorage.removeItem(storageKey(order.uuid));
      } catch {
        /* ignore */
      }
    }
  };

  const reject = async () => {
    if (order && (await confirm(`${orderNo(order)} buyurtmani rad etasizmi?`, { danger: true, confirmText: 'Rad etish' }))) {
      await setStatus(order, 'REJECTED', 'Buyurtma rad etildi');
    }
  };

  const pending = order && (order.status === 'PENDING' || order.status === 'SEARCHING_COURIER');

  return (
    <div className="pb-8">
      <PageHeader title="Yig'ish" subtitle={queue.length ? `${queue.length} ta buyurtma navbatda` : "Navbat bo'sh"} />

      {loading ? (
        <SkeletonList rows={3} className="mt-3" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !order ? (
        <EmptyState
          icon={<ClipboardCheck className="w-7 h-7" />}
          title="Yig'ish uchun buyurtma yo'q"
          description="Yangi buyurtma kelganda shu yerda paydo bo'ladi."
        />
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[300px_1fr] items-start">
          {/* ---- Navbat ---- */}
          <aside className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible no-scrollbar -mx-1 px-1">
            {queue.map((o) => {
              const active = o.uuid === order.uuid;
              const n = loadChecked(o.uuid).size;
              return (
                <button
                  key={o.uuid}
                  type="button"
                  onClick={() => setSelected(o.uuid)}
                  className={`shrink-0 w-[220px] lg:w-full text-left rounded-2xl border p-3 transition cursor-pointer ${
                    active ? 'border-brand bg-brand-soft' : freshUuids.has(o.uuid) ? 'border-brand-bright animate-new-order bg-surface' : 'border-edge bg-surface hover:border-edge-strong'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-ink">{orderNo(o)}</span>
                    <ElapsedChip createdAt={o.created_at} now={now} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                    {o.delivery_type === 'DELIVERY' ? <Bike className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                    {o.items.length} ta mahsulot
                    {o.status === 'PREPARING' && <span className="ml-auto font-bold text-brand">{n}/{o.items.length}</span>}
                    {(o.status === 'PENDING' || o.status === 'SEARCHING_COURIER') && <Badge tone="gold" className="ml-auto">Yangi</Badge>}
                  </div>
                </button>
              );
            })}
          </aside>

          {/* ---- Tanlangan buyurtma ---- */}
          <section className="space-y-3">
            <div className="bg-surface border border-edge rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[20px] font-black text-ink tracking-tightest">{orderNo(order)}</div>
                  <div className="text-[13px] text-muted">
                    {order.contact_name || 'Mijoz'} · {formatMoney(order.total_price)}
                  </div>
                </div>
                <ElapsedChip createdAt={order.created_at} now={now} />
              </div>
              {order.description && <div className="mt-3 rounded-xl bg-warning-soft text-warning-ink px-3 py-2 text-[14px] font-semibold">{order.description}</div>}

              {!pending && (
                <>
                  <div className="mt-4 h-2 rounded-full bg-field overflow-hidden">
                    <div className="h-full bg-brand-bright transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-1.5 text-[13px] text-muted">{done} / {items.length} yig'ildi</div>
                </>
              )}
            </div>

            {!pending && (
              <form onSubmit={onScan}>
                <Input
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  leftIcon={<ScanBarcode className="w-4 h-4" />}
                  placeholder="Shtrix-kodni skanerlang va Enter bosing"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </form>
            )}

            <ul className="space-y-2">
              {items.map((it) => {
                const on = checked.has(it.uuid);
                const img = it.product?.images?.find((i) => i.is_main)?.image || it.product?.images?.[0]?.image;
                return (
                  <li key={it.uuid}>
                    <button
                      type="button"
                      disabled={!!pending}
                      onClick={() => toggle(it.uuid)}
                      className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition cursor-pointer disabled:cursor-default ${
                        on ? 'bg-brand-soft border-brand/30' : 'bg-surface border-edge'
                      }`}
                    >
                      {!pending && (
                        <span className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center shrink-0 ${on ? 'bg-brand border-brand text-white' : 'border-edge-strong'}`}>
                          {on && <Check className="w-5 h-5" />}
                        </span>
                      )}
                      {img ? <img src={img} alt="" className="w-12 h-12 rounded-xl object-cover bg-field shrink-0" /> : <div className="w-12 h-12 rounded-xl bg-field shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className={`text-[15px] font-bold truncate ${on ? 'text-muted line-through' : 'text-ink'}`}>{it.product?.name || itemName(it)}</div>
                        <div className="text-[12px] text-muted truncate">
                          {[it.product?.brand, it.product?.barcode && `#${it.product.barcode}`, it.options?.map((o) => o.name).join(', ')].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-[17px] font-black text-ink tabular-nums shrink-0">{qtyLabel(it)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex gap-2 sticky bottom-[calc(var(--tabbar-h,0px)+var(--safe-bottom,0px)+8px)] md:static">
              {pending ? (
                <>
                  <Button variant="danger-soft" size="xl" disabled={busyUuid === order.uuid} onClick={reject}>Rad etish</Button>
                  <Button size="xl" block loading={busyUuid === order.uuid} onClick={() => setStatus(order, 'ACCEPTED')}>Qabul qilish</Button>
                </>
              ) : order.status === 'ACCEPTED' ? (
                <Button size="xl" block loading={busyUuid === order.uuid} onClick={() => setStatus(order, 'PREPARING')}>Yig'ishni boshlash</Button>
              ) : (
                <Button size="xl" block variant={all ? 'success' : 'primary'} loading={busyUuid === order.uuid} onClick={finish}>
                  {all ? "Hammasi yig'ildi — tayyor" : `Tayyor (${done}/${items.length})`}
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default PickingPage;
