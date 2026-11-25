import React, { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Bell, BellOff, ChevronDown, Tv, Lock, Monitor, Printer, ReceiptText, Send, Store, Volume2, Wallet } from 'lucide-react';
import { useToast } from '../../../core/components/ToastProvider';
import { Badge, Button, Card, CardHeader, Divider, InlineAlert, PageHeader, QtyStepper, Select, SettingRow, Switch } from '../../../core/ui';
import { getAutoLockMinutes, setAutoLockMinutes } from '../../../core/lib/posLock';
import { ensureNotificationPermission, isTauri, notify } from '../../../core/platform';
import { getDisplayName, getPartner, isCashier, isManager } from '../../../core/lib/session';
import { PaymentMethodsCard } from '../components/PaymentMethodsCard';
import { PrintersCard } from '../components/PrintersCard';
import { ReceiptLookCard } from '../components/ReceiptLookCard';
import { TvScreensCard } from '../../screens/components/TvScreensCard';
import { WorkModeCard } from '../components/WorkModeCard';
import { TelegramReportCard } from '../components/TelegramReportCard';
import { TelegramOrdersGroupCard } from '../components/TelegramOrdersGroupCard';
import { getErrorMessage } from '../../../core/lib/errors';
import { printReceiptPreview } from '../../orders/utils/printing';
import { usePlatformConfig } from '../../../core/lib/platformStage';
import { DELIVERY_RECEIPT_KEY } from '../../orders/deliveryReceipts';

// Yetkazish buyurtmasi qabul qilinganda kassa cheki (standart — yoqilgan)
const AUTO_PRINT_KEY = DELIVERY_RECEIPT_KEY;
const COPIES_KEY = 'milliygo_print_copies';

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
};

type Perm = 'granted' | 'denied' | 'default' | 'unsupported';
const browserPermission = (): Perm => {
  if (isTauri()) return 'default';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as Perm;
};

/** Short local chime, same tones as the new-order alert in useWebSocket. */
const playTestChime = () => {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return false;
  const ctx = new Ctx();
  const tone = (freq: number, start: number, dur: number, vol: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.start(start);
    o.stop(start + dur);
  };
  const t = ctx.currentTime;
  tone(523.25, t, 0.4, 0.15);
  tone(659.25, t + 0.15, 0.6, 0.15);
  tone(783.99, t + 0.15, 0.6, 0.1);
  setTimeout(() => ctx.close().catch(() => {}), 1200);
  return true;
};

/** Kassa qulfi: harakatsizlikdan keyin avtomatik qulflash (shu qurilma uchun) */
const PosLockCard: React.FC = () => {
  const [minutes, setMinutes] = useState(getAutoLockMinutes);
  return (
    <Card>
      <CardHeader title="Kassa qulfi" icon={<Lock className="w-[18px] h-[18px]" />} />
      <SettingRow
        title="Avtomatik qulflash"
        description="Kassa rejimida shuncha vaqt hech kim ishlatmasa — ekran qulflanadi, xodim PIN bilan ochadi"
        control={
          <Select
            value={String(minutes)}
            onChange={(e) => {
              const m = parseInt(e.target.value, 10) || 0;
              setMinutes(m);
              setAutoLockMinutes(m);
            }}
            containerClassName="w-36"
          >
            <option value="0">O'chiq</option>
            {[1, 2, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} daqiqa
              </option>
            ))}
          </Select>
        }
      />
      <p className="mt-2 text-[12px] text-muted">Xodimlarning PIN kodlari «Xodimlar» bo'limida o'rnatiladi.</p>
    </Card>
  );
};

type SectionKey = 'printers' | 'receipt' | 'tv' | 'notify' | 'pos' | 'payments' | 'telegram';

const SettingsPage: React.FC = () => {
  // 1-bosqich: mijoz cheki va kassa qulfi yo'q (Q48, Q51) — oshxona printeri qoladi
  const { pos: posStage } = usePlatformConfig();
  const toast = useToast();
  const desktop = isTauri();
  const [autoPrint, setAutoPrint] = useState(() => readLS(AUTO_PRINT_KEY) !== 'false');
  const [copies, setCopies] = useState(() => Math.min(5, Math.max(1, parseInt(readLS(COPIES_KEY) || '1', 10) || 1)));
  const [perm, setPerm] = useState<Perm>(browserPermission);
  const [printing, setPrinting] = useState(false);
  const [showKiosk, setShowKiosk] = useState(false);

  // Bo'lim URL'da (?s=printers); kassa pastidagi holat qatoridan «Printer» bosilsa — Printerlar bo'limi
  const focus = (useLocation().state as { focus?: string } | null)?.focus;
  const [params, setParams] = useSearchParams();
  const section = (params.get('s') as SectionKey | null) ?? (focus === 'printers' ? 'printers' : null);
  const setSection = (key: SectionKey) => setParams({ s: key }, { replace: true });

  useEffect(() => writeLS(AUTO_PRINT_KEY, autoPrint ? 'true' : 'false'), [autoPrint]);
  useEffect(() => writeLS(COPIES_KEY, String(copies)), [copies]);

  const requestPermission = async () => {
    const ok = await ensureNotificationPermission();
    setPerm(ok ? 'granted' : browserPermission() === 'default' ? 'default' : 'denied');
    if (ok) {
      notify('MilliyGo Hamkor', 'Bildirishnomalar yoqildi');
      toast.success('Bildirishnomalar yoqildi');
    } else {
      toast.error("Ruxsat berilmadi. Brauzer yoki Windows sozlamalaridan yoqing.");
    }
  };

  const testSound = () => {
    if (!playTestChime()) toast.error("Bu qurilmada ovoz qo'llab-quvvatlanmaydi.");
  };

  const testPrint = async () => {
    setPrinting(true);
    try {
      const p = getPartner();
      await printReceiptPreview(
        {
          order_number: 'TEST',
          created_at: new Date().toISOString(),
          description: 'Sinov cheki — printer sozlamasini tekshirish uchun. Bu buyurtma emas.',
          partner_name: getDisplayName(p),
          partner_address: p?.address,
          partner_phone: p?.phone,
          items: [{ name: 'Sinov chop etish', quantity: 1, unit_price: 0, line_total: 0 }],
          subtotal: 0,
          total_price: 0,
        },
        false,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Chop etib bo'lmadi. Printer ulanganini tekshiring."));
    } finally {
      setPrinting(false);
    }
  };

  const permBadge =
    perm === 'granted' ? (
      <Badge tone="success" dot>
        Yoqilgan
      </Badge>
    ) : perm === 'denied' ? (
      <Badge tone="danger" dot>
        Bloklangan
      </Badge>
    ) : perm === 'unsupported' ? (
      <Badge>Qo'llab-quvvatlanmaydi</Badge>
    ) : (
      <Badge tone="warning" dot>
        So'ralmagan
      </Badge>
    );

  // Bo'limlar: chapda ro'yxat (telefonda — yuqorida tablar), o'ngda faqat tanlangan bo'lim
  const sections: Array<{ key: SectionKey; label: string; icon: React.ReactNode; content: React.ReactNode }> = [
    {
      key: 'printers',
      label: 'Printerlar',
      icon: <Printer className="w-[18px] h-[18px]" />,
      content: (
        <>
      {posStage && (
      <Card>
        <CardHeader title="Chek chop etish" icon={<Printer className="w-[18px] h-[18px]" />} />
        <div className="divide-y divide-edge">
          <SettingRow
            title="Yetkazish: qabul qilinganda chek"
            description="Yetkazib berish buyurtmasi qabul qilinishi bilan oshxona cheki bilan birga kassa cheki ham chiqadi («Tayyor»da qayta chiqmaydi)"
            control={<Switch checked={autoPrint} onChange={setAutoPrint} label="Yetkazish: qabul qilinganda chek" />}
          />
          <SettingRow
            title="Nusxalar soni"
            description="Har bir chek necha marta chiqariladi (masalan, oshxona va mijoz uchun)"
            control={<QtyStepper value={copies} min={1} max={5} onChange={setCopies} size="sm" />}
          />
        </div>
        <Divider className="my-3" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[13px] text-muted">Printer to'g'ri ishlashini sinov cheki bilan tekshiring.</p>
          <Button variant="outline" icon={<Printer className="w-4 h-4" />} loading={printing} onClick={testPrint}>
            Sinov cheki
          </Button>
        </div>
      </Card>
      )}
      <PrintersCard />
      {!desktop && (
        <Card>
          <button
            type="button"
            onClick={() => setShowKiosk((v) => !v)}
            aria-expanded={showKiosk}
            className="w-full flex items-center justify-between gap-3 min-h-[44px] text-left cursor-pointer"
          >
            <span className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <Monitor className="w-[18px] h-[18px]" />
              </span>
              <span>
                <span className="block text-[16px] font-extrabold tracking-tightest">Agentsiz usul: brauzerda oynasiz chop etish</span>
                <span className="block text-[13px] text-muted">Chrome / Edge uchun “kiosk printing” sozlamasi (kesish va pul qutisi ishlamaydi)</span>
              </span>
            </span>
            <ChevronDown className={`w-5 h-5 text-muted transition-transform ${showKiosk ? 'rotate-180' : ''}`} />
          </button>
          {showKiosk && (
            <ol className="mt-4 space-y-3 text-[14px]">
              {[
                <>Chrome yoki Edge yorlig'ini sichqonchaning o'ng tugmasi bilan bosing va <b>Properties (Svoystva)</b>ni tanlang.</>,
                <>
                  <b>Target (Obekt)</b> maydoni oxiriga bo'sh joy qoldirib quyidagini qo'shing:
                  <code className="mt-2 block select-all rounded-xl bg-field px-3 py-2.5 font-mono text-[13px] font-bold break-all">--kiosk-printing</code>
                </>,
                <>Barcha brauzer oynalarini yoping va tizimga shu yorliq orqali qayta kiring.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-7 h-7 rounded-lg bg-field text-ink font-extrabold text-[13px] flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="pt-0.5 min-w-0">{step}</div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[12px] text-muted">Tavsiya: Windows uchun MilliyGo Hamkor desktop ilovasini o'rnating — u bu sozlamasiz ishlaydi.</p>
        </Card>
      )}
        </>
      ),
    },
    ...(!isCashier() ? [{ key: 'receipt' as const, label: "Chek ko'rinishi", icon: <ReceiptText className="w-[18px] h-[18px]" />, content: <ReceiptLookCard /> }] : []),
    ...(!isCashier() ? [{ key: 'tv' as const, label: 'TV ekranlar', icon: <Tv className="w-[18px] h-[18px]" />, content: <TvScreensCard /> }] : []),
    {
      key: 'notify',
      label: 'Bildirishnomalar',
      icon: <Bell className="w-[18px] h-[18px]" />,
      content: (
      <Card>
        <CardHeader title="Bildirishnomalar va ovoz" icon={<Bell className="w-[18px] h-[18px]" />} />
        <div className="divide-y divide-edge">
          <SettingRow
            title={
              <span className="inline-flex items-center gap-2">
                Tizim bildirishnomalari {!desktop && permBadge}
              </span>
            }
            description="Yangi buyurtma kelganda, oyna yopiq bo'lsa ham xabar chiqadi"
            control={
              perm === 'granted' ? (
                <Button variant="secondary" size="sm" onClick={() => notify('MilliyGo Hamkor', 'Sinov bildirishnomasi')}>
                  Sinash
                </Button>
              ) : (
                <Button variant="outline" size="sm" icon={perm === 'denied' ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />} onClick={requestPermission}>
                  Yoqish
                </Button>
              )
            }
          />
          <SettingRow
            title="Yangi buyurtma ovozi"
            description="Ovoz eshitilishi uchun sahifada kamida bir marta bosgan bo'lishingiz kerak"
            control={
              <Button variant="secondary" size="sm" icon={<Volume2 className="w-4 h-4" />} onClick={testSound}>
                Eshitish
              </Button>
            }
          />
        </div>
        {perm === 'denied' && !desktop && (
          <InlineAlert tone="warning" className="mt-3">
            Brauzer bildirishnomalarni bloklagan. Manzil satridagi qulf belgisini bosib, “Bildirishnomalar”ni yoqing.
          </InlineAlert>
        )}
      </Card>
      ),
    },
    ...(!isCashier() || posStage
      ? [
          {
            key: 'pos' as const,
            label: 'Kassa',
            icon: <Store className="w-[18px] h-[18px]" />,
            content: (
              <>
                {!isCashier() && <WorkModeCard />}
                {posStage && <PosLockCard />}
              </>
            ),
          },
        ]
      : []),
    ...(!isManager()
      ? [
          { key: 'payments' as const, label: "To'lov usullari", icon: <Wallet className="w-[18px] h-[18px]" />, content: <PaymentMethodsCard /> },
          {
            key: 'telegram' as const,
            label: 'Telegram',
            icon: <Send className="w-[18px] h-[18px]" />,
            content: (
              <>
                <TelegramOrdersGroupCard />
                <TelegramReportCard />
              </>
            ),
          },
        ]
      : []),
  ];
  const current = sections.find((x) => x.key === section) ?? sections[0];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Sozlamalar" subtitle={current.label}>
        {/* Telefon/planshet: bo'limlar tab ko'rinishida */}
        <div className="lg:hidden -mx-1 flex gap-1.5 overflow-x-auto no-scrollbar px-1">
          {sections.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setSection(x.key)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[14px] font-bold cursor-pointer ${
                x.key === current.key ? 'bg-brand text-white' : 'bg-surface border border-edge text-ink'
              }`}
            >
              {x.icon}
              {x.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="mt-2 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Sozlamalar bo'limlari" className="hidden lg:flex flex-col gap-1 self-start sticky top-[calc(var(--appbar-h,56px)+16px)]">
          {sections.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setSection(x.key)}
              aria-current={x.key === current.key ? 'page' : undefined}
              className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-bold cursor-pointer transition-colors ${
                x.key === current.key ? 'bg-brand text-white' : 'text-ink hover:bg-field'
              }`}
            >
              <span className={x.key === current.key ? 'text-white' : 'text-muted'}>{x.icon}</span>
              {x.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl space-y-4">{current.content}</div>
      </div>
    </div>
  );
};

export default SettingsPage;
