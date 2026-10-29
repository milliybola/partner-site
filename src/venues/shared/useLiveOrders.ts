import { useCallback, useEffect, useRef, useState } from 'react';
import { ordersApi } from '../../features/orders/services/ordersApi';
import type { Order } from '../../features/orders/services/ordersApi';
import { useRealtime } from '../../core/realtime/RealtimeProvider';
import type { RealtimeEvent } from '../../core/realtime/RealtimeProvider';
import { useToast } from '../../core/components/ToastProvider';
import { getErrorMessage } from '../../core/lib/errors';

const POLL_CONNECTED_MS = 60_000;
const POLL_OFFLINE_MS = 20_000;

/**
 * Jonli buyurtmalar: yuklash + realtime xabarlarda yangilash + (aloqa uzilsa tezroq) polling.
 * Oshxona ekrani, yig'ish va bosh sahifalar bir xil mantiqdan foydalanadi.
 */
export function useLiveOrders() {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [freshUuids, setFreshUuids] = useState<Set<string>>(new Set());
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (initial = false) => {
    try {
      const data = await ordersApi.getOrders();
      if (!aliveRef.current) return;
      setOrders(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      // Jim yangilashda oxirgi yaxshi ro'yxat ko'rinishda qoladi
      if (aliveRef.current && initial) setError(getErrorMessage(err, "Buyurtmalarni yuklab bo'lmadi."));
    } finally {
      if (aliveRef.current && initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      if (e.type === 'new_order_alert') {
        const uuid = e.order_data?.uuid;
        if (uuid) setFreshUuids((s) => new Set(s).add(uuid));
        void refresh();
      } else if (e.type === 'order_status_update') {
        void refresh();
      }
    },
    [refresh],
  );
  const { isConnected } = useRealtime(onEvent);

  useEffect(() => {
    const t = setInterval(() => void refresh(), isConnected ? POLL_CONNECTED_MS : POLL_OFFLINE_MS);
    return () => clearInterval(t);
  }, [isConnected, refresh]);

  /** Holatni o'zgartiradi (optimistik); xatoda avvalgi ro'yxat qaytariladi. */
  const setStatus = useCallback(
    async (order: Order, next: Order['status'], message?: string, reason?: string): Promise<boolean> => {
      const previous = orders;
      setBusyUuid(order.uuid);
      setFreshUuids((s) => {
        if (!s.has(order.uuid)) return s;
        const n = new Set(s);
        n.delete(order.uuid);
        return n;
      });
      setOrders((prev) => prev.map((o) => (o.uuid === order.uuid ? { ...o, status: next, ...(reason ? { reject_reason: reason } : {}) } : o)));
      try {
        await ordersApi.updateOrderStatus(order.uuid, next, reason);
        if (message) toast.success(message);
        void refresh();
        return true;
      } catch (err) {
        setOrders(previous);
        toast.error(getErrorMessage(err, "Buyurtma holatini yangilab bo'lmadi."));
        return false;
      } finally {
        setBusyUuid(null);
      }
    },
    [orders, refresh, toast],
  );

  return { orders, loading, error, refresh: () => refresh(true), busyUuid, freshUuids, isConnected, setStatus };
}
