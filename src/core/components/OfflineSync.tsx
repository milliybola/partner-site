import React, { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, Trash2, TriangleAlert, Wifi } from 'lucide-react';
import { Button, IconButton, Sheet } from '../ui';
import { formatMoney } from '../lib/format';
import { flushQueue, removeQueued, retryQueued, useOfflineQueue, useOnline } from '../lib/offline';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { markKitchenPrinted } from '../../features/orders/kitchenPrinted';
import type { Order } from '../../features/orders/services/ordersApi';

const RETRY_MS = 20_000;

/**
 * Oflayn holat paneli: internet yo'qligi va navbatdagi buyurtmalar soni ko'rinadi.
 * Aloqa tiklanganda (va har 20 soniyada) navbat serverga yuboriladi; server rad etganlari
 * ro'yxatda qoladi — kassir qayta urinadi yoki o'chiradi.
 */
export const OfflineSync: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const online = useOnline();
  const queue = useOfflineQueue();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const pending = queue.filter((o) => !o.error).length;
  const failed = queue.filter((o) => o.error);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { sent, failed: nFailed } = await flushQueue();
      // Oflayn paytda oshxona cheki chiqqan — oshxona printeri ularni qayta chiqarmasin
      sent.forEach(({ order }) => order && markKitchenPrinted(order as Order));
      if (sent.length) toast.success(`${sent.length} ta oflayn buyurtma serverga yuborildi`);
      if (nFailed) toast.error(`${nFailed} ta buyurtmani server qabul qilmadi — tekshiring`);
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!online || pending === 0) return;
    const first = setTimeout(() => void sync(), 0);
    const t = setInterval(() => void sync(), RETRY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [online, pending, sync]);

  if (online && queue.length === 0) return null;

  const remove = async (id: string, label: string) => {
    const ok = await confirm(`«${label}» buyurtmasi navbatdan o'chiriladi va serverga yuborilmaydi.`, {
      title: "Navbatdan o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (ok) removeQueued(id);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-bold cursor-pointer ${
          !online ? 'bg-danger text-white' : failed.length ? 'bg-warning-soft text-warning-ink' : 'bg-info-soft text-info'
        }`}
      >
        {!online ? <CloudOff className="w-4 h-4" /> : failed.length ? <TriangleAlert className="w-4 h-4" /> : <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />}
        {!online
          ? `Internet yo'q — kassa oflayn ishlayapti${queue.length ? ` · navbatda ${queue.length} ta buyurtma` : ''}`
          : failed.length
            ? `${failed.length} ta oflayn buyurtmani server qabul qilmadi — ko'rish`
            : `Navbatdagi ${pending} ta buyurtma yuborilmoqda…`}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} size="sm" title="Oflayn navbat" subtitle={online ? 'Internet bor' : "Internet yo'q — buyurtmalar shu kompyuterda saqlanmoqda"}>
        <div className="space-y-2">
          {queue.map((o) => (
            <div key={o.id} className={`rounded-2xl px-4 py-3 ${o.error ? 'bg-danger-soft' : 'bg-field'}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold truncate">{o.label}</span>
                  <span className="block text-[12px] text-muted">
                    {new Date(o.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} · {formatMoney(o.total)}
                  </span>
                </span>
                {o.error && (
                  <IconButton label="Qayta urinish" onClick={() => retryQueued(o.id)}>
                    <RefreshCw className="w-[18px] h-[18px]" />
                  </IconButton>
                )}
                <IconButton label="O'chirish" onClick={() => remove(o.id, o.label)}>
                  <Trash2 className="w-[18px] h-[18px] text-danger-ink" />
                </IconButton>
              </div>
              {o.error && <p className="mt-1 text-[13px] font-semibold text-danger-ink">{o.error}</p>}
            </div>
          ))}
          {queue.length === 0 && <p className="text-[14px] text-muted">Navbat bo'sh.</p>}
        </div>
        <Button className="mt-4" block icon={<Wifi className="w-4 h-4" />} disabled={!online || pending === 0} loading={syncing} onClick={() => void sync()}>
          Hozir yuborish
        </Button>
      </Sheet>
    </>
  );
};
