import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, Boxes, ClipboardCheck, PackageX, Receipt, ScanBarcode, ShoppingBag } from 'lucide-react';
import { Card, CardHeader, PageHeader, StatCard } from '../../../core/ui';
import { env } from '../../../core/config/env';
import { formatMoney } from '../../../core/lib/format';
import { getDisplayName, getPartner } from '../../../core/lib/session';
import { useLiveOrders } from '../../shared/useLiveOrders';
import { useTodayStats } from '../../shared/useTodayStats';
import { LiveTile, QuickAction } from '../../shared/HomeParts';
import { inventoryApi } from '../inventoryApi';
import type { InventoryList } from '../inventoryApi';

/** Do'kon bosh sahifasi: yig'ish navbati, ombor ogohlantirishlari (oz qoldi / tugagan) va bugungi savdo. */
const StoreHomePage: React.FC = () => {
  const { orders } = useLiveOrders();
  const { stats, loading } = useTodayStats();
  const [stock, setStock] = useState<InventoryList | null>(null);

  useEffect(() => {
    inventoryApi
      .list({ page_size: 5, ordering: 'quantity', state: 'out', threshold: env.lowStockThreshold })
      .then(setStock)
      .catch(() => setStock(null));
  }, []);

  const live = useMemo(() => {
    const n = (statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).length;
    return { fresh: n(['PENDING', 'SEARCHING_COURIER']), picking: n(['ACCEPTED', 'PREPARING']), ready: n(['READY_FOR_PICKUP']) };
  }, [orders]);

  const attention = (stock?.summary.low ?? 0) + (stock?.summary.out ?? 0);

  return (
    <div className="pb-8 space-y-5">
      <PageHeader title={getDisplayName(getPartner())} subtitle="Do'kon · bugungi ko'rinish" />

      <div className="grid grid-cols-3 gap-3">
        <LiveTile label="Yangi" value={live.fresh} to="/picking" tone="gold" pulse={live.fresh > 0} />
        <LiveTile label="Yig'ilmoqda" value={live.picking} to="/picking" tone="warning" />
        <LiveTile label="Tayyor" value={live.ready} to="/orders" tone="success" />
      </div>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bugungi buyurtmalar" value={loading ? '…' : stats?.orders ?? '—'} icon={<ShoppingBag className="w-4 h-4" />} />
        <StatCard label="Bugungi tushum" value={loading ? '…' : stats ? formatMoney(stats.revenue) : '—'} icon={<Banknote className="w-4 h-4" />} tone="gold" />
        <StatCard label="O'rtacha chek" value={loading ? '…' : stats?.avgCheck !== undefined ? formatMoney(stats.avgCheck) : '—'} icon={<Receipt className="w-4 h-4" />} tone="info" />
        <StatCard
          label="Omborda e'tibor"
          value={stock ? attention : '—'}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone={attention > 0 ? 'danger' : 'brand'}
          hint={stock ? `${stock.summary.out} tugagan · ${stock.summary.low} oz qoldi` : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title="Tugagan mahsulotlar"
          subtitle={stock ? `${stock.summary.out} ta mahsulot qolmagan` : 'Ombor ma\'lumoti yuklanmadi'}
          action={<Link to="/inventory" className="text-[13px] font-bold text-brand">Omborga →</Link>}
          icon={<PackageX className="w-4 h-4" />}
        />
        {!stock || stock.results.length === 0 ? (
          <p className="text-[14px] text-muted">{stock ? "Hammasi omborda bor." : "—"}</p>
        ) : (
          <ul className="divide-y divide-edge">
            {stock.results.map((r) => (
              <li key={r.uuid} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[14px] font-bold text-ink truncate">{r.name}</span>
                <Link to="/inventory" className="text-[13px] font-bold text-brand shrink-0">Kirim qilish</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction to="/new-order" label="Kassa" hint="Shtrix-kod bilan sotuv" icon={ScanBarcode} />
        <QuickAction to="/picking" label="Yig'ish" hint="Buyurtmalarni yig'ish" icon={ClipboardCheck} />
        <QuickAction to="/inventory" label="Ombor" hint="Qoldiq, kirim, chiqim" icon={Boxes} />
        <QuickAction to="/catalog" label="Mahsulotlar" hint="Narx, birlik, qadoq" icon={Boxes} />
      </div>
    </div>
  );
};

export default StoreHomePage;
