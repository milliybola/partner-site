import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Receipt } from 'lucide-react';
import apiClient from '../../core/api/client';
import { Button } from '../../core/ui';
import { useRealtime } from '../../core/realtime/RealtimeProvider';
import { useToast } from '../../core/components/ToastProvider';
import { getErrorMessage } from '../../core/lib/errors';
import { notify } from '../../core/platform';
import { playCallRing } from '../calls/callSound';
import { useTariff } from '../../core/lib/tariff';
import { getPartner, isManager as isManagerRole } from '../../core/lib/session';
import { TableBillSheet } from './components/TableBillSheet';
import type { TableModel } from './services/tablesApi';

const POLL_MS = 20_000;

/** Mehmon stol QR'idan ofitsiantni chaqirdi (CALL) yoki hisob so'radi (BILL). */
export interface TableCall {
  uuid: string;
  kind: 'CALL' | 'BILL';
  status: 'PENDING' | 'ACKNOWLEDGED';
  table_uuid: string;
  table_number: string;
  created_at: string;
}

const what = (c: TableCall) => (c.kind === 'BILL' ? "hisob so'ramoqda" : 'ofitsiantni chaqirmoqda');

/** Hali olinmagan stol chaqiruvlari: WebSocket `table_call` / `table_call_update` + zaxira so'rovi. */
function useTableCalls() {
  const toast = useToast();
  const [calls, setCalls] = useState<TableCall[]>([]);
  const known = useRef(new Set<string>());
  const first = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('partner/table-calls/');
      const list: TableCall[] = res.data?.data ?? [];
      // Ilk yuklashda (sahifa ochilganda) eski chaqiruvlar uchun ovoz chiqarmaymiz
      list.forEach((c) => {
        if (!known.current.has(c.uuid) && !first.current) {
          playCallRing();
          notify(`${c.table_number} — ${what(c)}`, 'Stolga boring va "Boraman" ni bosing');
        }
        known.current.add(c.uuid);
      });
      first.current = false;
      setCalls(list);
    } catch {
      /* keyingi urinishda */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useRealtime((e) => {
    if (e?.type === 'table_call') void load();
    if (e?.type === 'table_call_update') {
      const uuid = (e as unknown as { call?: { uuid?: string } }).call?.uuid;
      if (uuid) setCalls((prev) => prev.filter((c) => c.uuid !== uuid));
    }
  });

  const ack = useCallback(
    async (c: TableCall) => {
      try {
        await apiClient.post(`partner/table-calls/${c.uuid}/ack/`);
      } catch (err) {
        // Boshqa xodim oldin olgan bo'lishi mumkin — xabar chiqaramiz, ro'yxat baribir yangilanadi
        toast.error(getErrorMessage(err, "Chaqiruvni olib bo'lmadi."));
      }
      setCalls((prev) => prev.filter((x) => x.uuid !== c.uuid));
    },
    [toast],
  );

  return { calls, ack };
}

/** Ekran pastidagi stol chaqiruvlari kartalari (Layout'da bir marta). Faqat stol QR menyusi yoqilgan hamkorda ishlaydi. */
export const TableCallAlerts: React.FC = () => {
  const { tariff } = useTariff();
  return tariff.allow_dine_in && tariff.allow_qr_menu ? <TableCallCards /> : null;
};

const TableCallCards: React.FC = () => {
  const { calls, ack } = useTableCalls();
  const [billTable, setBillTable] = useState<TableModel | null>(null);
  const canPay = isManagerRole(getPartner());
  if (calls.length === 0 && !billTable) return null;
  return (
    <>
    <TableBillSheet table={billTable} canPay={canPay} onClose={() => setBillTable(null)} onChanged={() => {}} />
    <div className="pointer-events-none fixed bottom-[calc(var(--tabbar-h)+12px)] left-3 right-3 z-[60] space-y-2.5 md:bottom-6 md:left-auto md:right-6 md:w-[380px]">
      {calls.slice(0, 4).map((c) => (
        <article key={c.uuid} role="alert" className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-gold bg-gold-soft p-3.5 shadow-xl animate-new-order">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold text-ink">
            {c.kind === 'BILL' ? <Receipt className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black tracking-tightest text-ink">{c.table_number}</div>
            <div className="text-[13px] font-semibold text-gold-ink">{what(c)}</div>
          </div>
          {c.kind === 'BILL' && (
            <Button
              size="md"
              variant="secondary"
              onClick={() => setBillTable({ uuid: c.table_uuid, table_number: c.table_number, capacity: 0, status: 'OCCUPIED' })}
            >
              Hisob
            </Button>
          )}
          <Button size="md" onClick={() => void ack(c)}>
            Boraman
          </Button>
        </article>
      ))}
      {calls.length > 4 && <div className="pointer-events-auto text-center text-[12.5px] font-bold text-muted">Yana {calls.length - 4} ta chaqiruv</div>}
    </div>
    </>
  );
};
