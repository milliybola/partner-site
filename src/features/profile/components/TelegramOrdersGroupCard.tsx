import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { Button, Card, CardHeader, InlineAlert } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { getErrorMessage } from '../../../core/lib/errors';

interface GroupState {
  linked: boolean;
  chat_name: string;
}

const URL = 'partner/orders-group/';

/**
 * Hamkorning «Buyurtmalar» Telegram guruhi (faqat egasi ulaydi): yangi buyurtma kelganda guruhga karta keladi,
 * holat o'zgarsa — o'sha xabar yangilanadi. Qabul qilish tugmasi YO'Q — buyurtma faqat panel/Merchant'da qabul qilinadi.
 * Ulash: t.me/<bot>?startgroup=… → Telegram guruh tanlatadi → bot qo'shiladi → bu yerda o'zi «Ulangan» bo'ladi.
 */
export const TelegramOrdersGroupCard: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'link' | 'test' | 'unlink' | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = async () => {
    const res = await apiClient.get(URL);
    const s = res.data?.data as GroupState;
    setState(s);
    return s;
  };

  useEffect(() => {
    load().catch((err) => setError(getErrorMessage(err, "Guruh sozlamasini yuklab bo'lmadi.")));
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setWaiting(false);
  };

  const link = async () => {
    setBusy('link');
    const win = window.open('', '_blank');
    const wasLinked = state?.linked ?? false;
    const oldName = state?.chat_name ?? '';
    try {
      const res = await apiClient.post(`${URL}link/`);
      const url = res.data?.data?.url as string;
      if (win) win.location.href = url;
      else window.location.href = url;
      setWaiting(true);
      const started = Date.now();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() - started > 15 * 60 * 1000) return stopPolling();
        try {
          const s = await load();
          if (s.linked && (!wasLinked || s.chat_name !== oldName)) {
            stopPolling();
            toast.success('Telegram guruh ulandi');
          }
        } catch {
          /* keyingi urinish */
        }
      }, 3000);
    } catch (err) {
      win?.close();
      toast.error(getErrorMessage(err, "Havolani olib bo'lmadi."));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      await apiClient.post(`${URL}test/`);
      toast.success('Guruhga sinov xabari yuborildi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Yuborib bo'lmadi."));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    const ok = await confirm('Yangi buyurtmalar bu guruhga kelmaydi.', { title: 'Guruhni uzish', confirmText: 'Uzish', danger: true });
    if (!ok) return;
    setBusy('unlink');
    try {
      const res = await apiClient.delete(URL);
      setState(res.data?.data);
    } catch (err) {
      toast.error(getErrorMessage(err, "Uzib bo'lmadi."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Yangi buyurtmalar Telegram guruhda" icon={<BellRing className="w-[18px] h-[18px]" />} />
      <p className="text-[13px] text-muted mb-3">
        Yangi buyurtma kelganda xodimlaringiz guruhiga xabar keladi: raqam, filial, taomlar, summa va manzil. Holat
        o'zgarsa (qabul qilindi, tayyor, bekor) xabar o'zi yangilanadi. Qabul qilish — faqat shu panel yoki Merchant ilovasida.
      </p>
      {error && <InlineAlert>{error}</InlineAlert>}
      {waiting && (
        <div className="mb-3">
          <InlineAlert tone="info">
            Telegram'da guruhni tanlang (yoki yangi guruh oching) va botni qo'shing — bu yerda o'zi «Ulangan» bo'ladi.
          </InlineAlert>
        </div>
      )}
      {state && !state.linked && (
        <Button icon={<Send className="w-4 h-4" />} loading={busy === 'link'} onClick={link}>
          {waiting ? 'Havolani qayta ochish' : 'Telegram guruhni ulash'}
        </Button>
      )}
      {state?.linked && (
        <>
          <p className="text-[14px] font-semibold text-ink">
            ✅ Ulangan{state.chat_name ? `: ${state.chat_name}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" loading={busy === 'test'} disabled={busy !== null} onClick={test}>
              Sinov xabari
            </Button>
            <Button variant="outline" loading={busy === 'link'} disabled={busy !== null} onClick={link}>
              Boshqa guruhga ulash
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={unlink}>
              Uzish
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};
