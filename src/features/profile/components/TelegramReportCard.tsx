import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { Button, Card, CardHeader, InlineAlert, Segmented, SettingRow, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatDate, formatTime } from '../../../core/lib/format';

interface ReportState {
  linked: boolean;
  chat_name: string;
  enabled: boolean;
  delay_minutes: number;
  next_send_at: string | null;
}

type Delay = '30' | '60';

/** «Bugun 23:00 da» / «05.11.2026 23:00 da» */
const whenText = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();
  return `${sameDay ? 'Bugun' : tomorrow ? 'Ertaga' : formatDate(d)} ${formatTime(d)} da`;
};

const URL = 'partner/telegram-report/';

/**
 * Rahbarga kunlik Telegram hisobot (faqat egasi): muassasa yopilgandan 30 daqiqa / 1 soat keyin — tushum, to'lovlar, top taomlar.
 * Yopilish vaqti — Profil'dagi ish vaqtidan (tungi smena ham hisobga olinadi).
 * Ulash: bot havolasi ochiladi → Telegram'da «Start» → shu yerda o'zi «Ulangan» bo'ladi (so'rov bilan kutiladi).
 */
export const TelegramReportCard: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<ReportState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'link' | 'test' | 'toggle' | 'unlink' | 'delay' | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = async () => {
    const res = await apiClient.get(URL);
    const s = res.data?.data as ReportState;
    setState(s);
    return s;
  };

  useEffect(() => {
    load().catch((err) => setError(getErrorMessage(err, "Hisobot sozlamasini yuklab bo'lmadi.")));
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
    // Brauzer popup'ni bloklamasligi uchun oyna bosish paytida ochiladi, havola keyin beriladi
    const win = window.open('', '_blank');
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
          if (s.linked) {
            stopPolling();
            toast.success("Telegram ulandi");
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
      toast.success("Bugungi hisobot Telegram'ga yuborildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Yuborib bo'lmadi."));
    } finally {
      setBusy(null);
    }
  };

  const patch = async (body: Partial<Pick<ReportState, 'enabled' | 'delay_minutes'>>, kind: 'toggle' | 'delay') => {
    setBusy(kind);
    try {
      const res = await apiClient.patch(URL, body);
      setState(res.data?.data);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi."));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    const ok = await confirm('Kunlik hisobot endi yuborilmaydi.', { title: "Telegram'ni uzish", confirmText: 'Uzish', danger: true });
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
      <CardHeader title="Kunlik hisobot Telegram'da" icon={<Send className="w-[18px] h-[18px]" />} />
      <p className="text-[13px] text-muted mb-3">
        Har kuni muassasa yopilgandan keyin kunlik tushum, buyurtmalar soni, naqd/karta, ko'p sotilgan taomlar va bekor
        qilinganlar Telegram'ingizga keladi — panelga kirmasdan. Yopilish vaqti Profil'dagi ish vaqtidan olinadi.
      </p>
      {error && <InlineAlert>{error}</InlineAlert>}
      {state && !state.linked && (
        <div className="space-y-3">
          {waiting && (
            <InlineAlert tone="info">Telegram'da botni oching va «Start» tugmasini bosing — bu yerda o'zi «Ulangan» bo'ladi.</InlineAlert>
          )}
          <Button icon={<Send className="w-4 h-4" />} loading={busy === 'link'} onClick={link}>
            {waiting ? 'Havolani qayta ochish' : "Telegram'ga ulash"}
          </Button>
        </div>
      )}
      {state?.linked && (
        <>
          <div className="divide-y divide-edge">
            <SettingRow
              title="Hisobot yuborilsin"
              description={
                (state.chat_name ? `Ulangan: ${state.chat_name}` : 'Telegram ulangan') +
                (state.enabled && state.next_send_at ? ` · keyingisi: ${whenText(state.next_send_at)}` : '')
              }
              control={<Switch checked={state.enabled} disabled={busy !== null} onChange={(v) => patch({ enabled: v }, 'toggle')} label="Kunlik hisobot" />}
            />
            <SettingRow
              title="Qachon yuborilsin"
              description="Muassasa yopilgandan keyin — kechikkan buyurtmalar yopilib bo'lishi uchun"
              control={
                <Segmented<Delay>
                  options={[
                    { value: '30', label: '30 daqiqa' },
                    { value: '60', label: '1 soat' },
                  ]}
                  value={String(state.delay_minutes) as Delay}
                  onChange={(v) => busy === null && patch({ delay_minutes: Number(v) }, 'delay')}
                />
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" loading={busy === 'test'} disabled={busy !== null} onClick={test}>
              Hozir yuborish (sinov)
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
