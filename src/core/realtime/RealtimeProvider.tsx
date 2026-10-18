import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { getFilialUuid, getPartner, getToken } from '../lib/session';
import { notify } from '../platform';

/**
 * One WebSocket per app session (previously every page opened its own socket,
 * so Orders + Tables could double-play the alert sound and double-reconnect).
 *
 * Pages subscribe with `useRealtime(handler)`. The provider also keeps an
 * "unseen new orders" counter for the nav badge and fires an OS notification.
 */
export type RealtimeEvent = { type: string; [key: string]: any };
type Listener = (e: RealtimeEvent) => void;

interface RealtimeCtx {
  isConnected: boolean;
  unseenNewOrders: number;
  markOrdersSeen: () => void;
  subscribe: (l: Listener) => () => void;
}

const Ctx = createContext<RealtimeCtx | null>(null);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const partner = getPartner();
  const token = getToken();
  const listeners = useRef(new Set<Listener>());
  const [unseen, setUnseen] = useState(0);

  const handle = useCallback((event: RealtimeEvent) => {
    if (event?.type === 'new_order_alert') {
      setUnseen((n) => n + 1);
      const num = event.order_data?.order_number || event.order_data?.id || '';
      notify('Yangi buyurtma', num ? `Buyurtma #${num} keldi` : event.message || 'Yangi buyurtma keldi');
    }
    listeners.current.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.error('[Realtime] listener failed', err);
      }
    });
  }, []);

  const { isConnected } = useWebSocket(partner?.uuid, token, handle, getFilialUuid(partner));

  // Reflect unseen orders in the window title (visible in taskbar / browser tab).
  useEffect(() => {
    const base = 'MilliyGo Hamkor';
    document.title = unseen > 0 ? `(${unseen}) Yangi buyurtma — ${base}` : base;
  }, [unseen]);

  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  const markOrdersSeen = useCallback(() => setUnseen(0), []);

  return <Ctx.Provider value={{ isConnected, unseenNewOrders: unseen, markOrdersSeen, subscribe }}>{children}</Ctx.Provider>;
};

/** Subscribe to realtime events. The handler may change between renders. */
export const useRealtime = (handler?: Listener) => {
  const ctx = useContext(Ctx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!ctx || !ref.current) return;
    return ctx.subscribe((e) => ref.current?.(e));
  }, [ctx]);
  return {
    isConnected: ctx?.isConnected ?? false,
    unseenNewOrders: ctx?.unseenNewOrders ?? 0,
    markOrdersSeen: ctx?.markOrdersSeen ?? (() => {}),
  };
};
