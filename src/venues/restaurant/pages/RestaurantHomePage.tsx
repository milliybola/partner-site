import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Banknote, ChefHat, PlusCircle, Receipt, ShoppingBag, Table, XCircle } from 'lucide-react';
import { Card, CardHeader, PageHeader, StatCard } from '../../../core/ui';
import { formatMoney } from '../../../core/lib/format';
import { getPartner, getDisplayName } from '../../../core/lib/session';
import { tablesApi } from '../../../features/tables/services/tablesApi';
import type { TableModel } from '../../../features/tables/services/tablesApi';
import { useLiveOrders } from '../../shared/useLiveOrders';
import { useTodayStats } from '../../shared/useTodayStats';
import { LiveTile, QuickAction } from '../../shared/HomeParts';

/** Restoran bosh sahifasi: oshxona navbati, zal (stollar band/bo'sh) va bugungi savdo. */
const RestaurantHomePage: React.FC = () => {
  const { orders } = useLiveOrders();
  const { stats, loading } = useTodayStats();
  const [tables, setTables] = useState<TableModel[] | null>(null);

  useEffect(() => {
    tablesApi.getTables().then(setTables).catch(() => setTables(null));
  }, []);

  const live = useMemo(() => {
    const n = (statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).length;
    return { fresh: n(['PENDING', 'SEARCHING_COURIER']), cooking: n(['ACCEPTED', 'PREPARING']), ready: n(['READY_FOR_PICKUP']) };
  }, [orders]);

  const active = tables?.filter((t) => t.is_active !== false) ?? [];
  const occupied = active.filter((t) => t.status === 'OCCUPIED').length;
  const reserved = active.filter((t) => t.status === 'RESERVED').length;

  return (
    <div className="pb-8 space-y-5">
      <PageHeader title={getDisplayName(getPartner())} subtitle="Restoran · bugungi ko'rinish" />

      <div className="grid grid-cols-3 gap-3">
        <LiveTile label="Yangi" value={live.fresh} to="/kitchen" tone="gold" pulse={live.fresh > 0} />
        <LiveTile label="Tayyorlanmoqda" value={live.cooking} to="/kitchen" tone="warning" />
        <LiveTile label="Tayyor" value={live.ready} to="/orders" tone="success" />
      </div>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bugungi buyurtmalar" value={loading ? '…' : stats?.orders ?? '—'} icon={<ShoppingBag className="w-4 h-4" />} />
        <StatCard label="Bugungi tushum" value={loading ? '…' : stats ? formatMoney(stats.revenue) : '—'} icon={<Banknote className="w-4 h-4" />} tone="gold" />
        <StatCard label="O'rtacha chek" value={loading ? '…' : stats?.avgCheck !== undefined ? formatMoney(stats.avgCheck) : '—'} icon={<Receipt className="w-4 h-4" />} tone="info" />
        <StatCard label="Bekor qilingan" value={loading ? '…' : stats?.cancelled ?? '—'} icon={<XCircle className="w-4 h-4" />} tone="danger" />
      </div>

      <Card>
        <CardHeader
          title="Zal"
          subtitle={tables ? `${occupied} band · ${reserved} bron · ${active.length - occupied - reserved} bo'sh` : "Stollar ma'lumoti yuklanmadi"}
          action={<Link to="/tables" className="text-[13px] font-bold text-brand">Stollar →</Link>}
          icon={<Table className="w-4 h-4" />}
        />
        {active.length === 0 ? (
          <p className="text-[14px] text-muted">Stollar hali qo'shilmagan.</p>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {active.map((t) => (
              <Link
                key={t.uuid}
                to="/tables"
                title={`Stol ${t.table_number} · ${t.capacity} o'rin`}
                className={`h-11 rounded-xl flex items-center justify-center text-[14px] font-black ${
                  t.status === 'OCCUPIED' ? 'bg-danger-soft text-danger-ink' : t.status === 'RESERVED' ? 'bg-gold-soft text-gold-ink' : 'bg-brand-soft text-brand'
                }`}
              >
                {t.table_number}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction to="/new-order" label="Yangi buyurtma" hint="Zal / olib ketish / yetkazish" icon={PlusCircle} />
        <QuickAction to="/kitchen" label="Oshxona ekrani" hint="Tayyorlash navbati" icon={ChefHat} />
        <QuickAction to="/tables" label="Stollar" hint="Zal va ofitsiantlar" icon={Table} />
        <QuickAction to="/catalog" label="Menyu" hint="Taomlar va narxlar" icon={BookOpen} />
      </div>
    </div>
  );
};

export default RestaurantHomePage;
