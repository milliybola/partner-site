import { useCallback, useEffect, useRef, useState } from 'react';
import { callsApi } from './callsApi';
import type { IncomingCall, IncomingCallEvent } from './callsApi';
import { useRealtime } from '../../core/realtime/RealtimeProvider';
import { formatPhone } from '../../core/lib/format';
import { notify } from '../../core/platform';
import { playCallRing } from './callSound';

const POLL_MS = 5_000;
const POLL_HIDDEN_MS = 30_000;
const POLL_MAX_BACKOFF_MS = 30_000;
const TITLE_PREFIX = /^📞 \(\d+\) /;

/**
 * Hamkor telefonidagi MilliyGo Merchant ilovasi yuborgan ochiq qo'ng'iroqlar.
 *  - `GET partner/calls/?open=1` — har ~5 s (sahifa yashirin bo'lsa 30 s; xatoda 30 s gacha sekinlashadi);
 *  - WebSocket `incoming_call` / `call_update` — darhol;
 *  - yangi qo'ng'iroq / holat o'zgarishi: ovoz + OS bildirishnomasi + oyna sarlavhasi (har biri bir martadan).
 */
export function useIncomingCalls() {
  const [calls, setCalls] = useState<IncomingCall[]>([]);
  const seen = useRef(new Map<string, string>()); // uuid → oxirgi signal berilgan holat
  const closed = useRef(new Set<string>()); // bu sessiyada yopilgan/hal qilingan — qayta chiqmasin
  const firstLoad = useRef(true);
  const failures = useRef(0);

  const alertFor = useCallback((c: IncomingCall, initial: boolean) => {
    const prev = seen.current.get(c.uuid);
    if (prev === c.status) return;
    seen.current.set(c.uuid, c.status);
    if (initial) return; // sahifa ochilganda eski qo'ng'iroqlar uchun ovoz chiqarmaymiz
    const who = c.customer_name ? `${c.customer_name} · ${formatPhone(c.phone)}` : formatPhone(c.phone);
    if (c.status === 'RINGING') {
      playCallRing();
      notify("Qo'ng'iroq", `${who} qo'ng'iroq qilmoqda`);
    } else if (prev === undefined || prev === 'RINGING') {
      // Qo'ng'iroq tugadi / o'tkazib yuborildi: "buyurtma ochamizmi?"
      playCallRing();
      notify(c.status === 'MISSED' ? "O'tkazib yuborilgan qo'ng'iroq" : "Qo'ng'iroq tugadi", `${who} raqamga buyurtma yaratamizmi?`);
    }
  }, []);

  const upsert = useCallback(
    (incoming: IncomingCall) => {
      if (closed.current.has(incoming.uuid)) return;
      if (!incoming.is_open) {
        setCalls((prev) => prev.filter((c) => c.uuid !== incoming.uuid));
        return;
      }
      alertFor(incoming, false);
      setCalls((prev) => [incoming, ...prev.filter((c) => c.uuid !== incoming.uuid)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    [alertFor],
  );

  // Realtime
  useRealtime((e) => {
    if (e?.type === 'incoming_call' || e?.type === 'call_update') {
      const call = (e as unknown as IncomingCallEvent).call;
      if (call?.uuid) upsert(call);
    }
  });

  // Polling
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const list = (await callsApi.listOpen()).filter((c) => c.is_open && !closed.current.has(c.uuid));
        if (!alive) return;
        failures.current = 0;
        list.forEach((c) => alertFor(c, firstLoad.current));
        firstLoad.current = false;
        setCalls(list);
      } catch {
        failures.current += 1;
      }
      if (!alive) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const base = hidden ? POLL_HIDDEN_MS : POLL_MS;
      const delay = Math.min(POLL_MAX_BACKOFF_MS, base * Math.pow(2, Math.min(failures.current, 3)));
      timer = setTimeout(tick, delay);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer);
        void tick();
      }
    };
    void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [alertFor]);

  // Oyna sarlavhasi: "📞 (2) …" (RealtimeProvider sarlavhani o'zgartirsa qayta qo'yiladi)
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, '');
      const want = calls.length > 0 ? `📞 (${calls.length}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const el = document.querySelector('title');
    if (!el) return;
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      mo.disconnect();
      document.title = document.title.replace(TITLE_PREFIX, '');
    };
  }, [calls.length]);

  /** "Yopish" — darhol yashiradi, serverga yozadi (xato bo'lsa ham qayta chiqmaydi). */
  const dismiss = useCallback(async (uuid: string) => {
    closed.current.add(uuid);
    setCalls((prev) => prev.filter((c) => c.uuid !== uuid));
    try {
      await callsApi.dismiss(uuid);
    } catch {
      /* server keyingi so'rovda baribir ro'yxatga qaytarishi mumkin — closed to'plami uni yashiradi */
    }
  }, []);

  /** Buyurtma ochish boshlanganda kartani yashiramiz (resolve — buyurtma yaratilganda CreateOrderPage'da). */
  const hide = useCallback((uuid: string) => {
    closed.current.add(uuid);
    setCalls((prev) => prev.filter((c) => c.uuid !== uuid));
  }, []);

  return { calls, dismiss, hide };
}
