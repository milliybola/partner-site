import { useEffect, useState } from 'react';
import apiClient from '../../core/api/client';
import { ENDPOINTS } from '../../core/config/constants';

export interface TodayStats {
  orders: number;
  delivered: number;
  cancelled: number | undefined;
  revenue: number;
  avgCheck: number | undefined;
}

/** Bugungi ko'rsatkichlar (`partner/statistics/` → today). Yuklanmasa `null` — bosh sahifa baribir ishlaydi. */
export function useTodayStats() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiClient
      .get(ENDPOINTS.DASHBOARD.STATS)
      .then((res) => {
        const data = res.data?.data ?? res.data;
        const t = data?.today ?? {};
        if (!alive) return;
        setStats({
          orders: Number(t.orders_count ?? t.total_orders ?? 0),
          delivered: Number(t.delivered ?? 0),
          cancelled: t.cancelled === undefined ? undefined : Number(t.cancelled),
          revenue: Number(t.revenue ?? t.total_revenue ?? 0),
          avgCheck: t.average_check === undefined ? undefined : Number(t.average_check),
        });
      })
      .catch(() => alive && setStats(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { stats, loading };
}
