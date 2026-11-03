import React, { useEffect, useState } from 'react';
import { ChefHat, Printer, RefreshCw, Wallet } from 'lucide-react';
import { Button, Card, CardHeader, Input, Select, SettingRow, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { isTauri, listPrinters, pingPrinterAgent } from '../../../core/platform';
import {
  DEFAULT_DEVICE,
  deviceReady,
  getPrinterSettings,
  savePrinterSettings,
  type PrinterDevice,
  type PrinterSettings,
} from '../../../core/lib/printerConfig';
import { openCashDrawer, printTestTicket } from '../../orders/utils/printing';

/** Bitta printer (kassa yoki oshxona) sozlamasi: ulanish turi, manzil/nom, qog'oz eni, kod sahifasi */
const DeviceForm: React.FC<{
  title: string;
  hint: string;
  icon: React.ReactNode;
  value: PrinterDevice | null;
  systemPrinters: string[];
  onChange: (d: PrinterDevice | null) => void;
}> = ({ title, hint, icon, value, systemPrinters, onChange }) => {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const enabled = value !== null;
  const d = value ?? DEFAULT_DEVICE;
  const set = (patch: Partial<PrinterDevice>) => onChange({ ...d, ...patch });

  const test = async () => {
    setTesting(true);
    try {
      await printTestTicket(d, title);
      toast.success('Sinov cheki yuborildi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Chop etib bo'lmadi"));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="py-3 space-y-3">
      <SettingRow
        title={<span className="inline-flex items-center gap-2">{icon} {title}</span>}
        description={hint}
        control={<Switch checked={enabled} onChange={(on) => onChange(on ? d : null)} label={title} />}
      />
      {enabled && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Select label="Ulanish" value={d.kind} onChange={(e) => set({ kind: e.target.value as PrinterDevice['kind'] })}>
            <option value="network">Tarmoq (LAN / Wi-Fi)</option>
            <option value="system">Kompyuterga ulangan (USB)</option>
          </Select>
          {d.kind === 'network' ? (
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <Input label="IP manzil" placeholder="192.168.1.100" value={d.host ?? ''} onChange={(e) => set({ host: e.target.value })} />
              <Input
                label="Port"
                inputMode="numeric"
                value={String(d.port ?? 9100)}
                onChange={(e) => set({ port: parseInt(e.target.value.replace(/\D/g, ''), 10) || 9100 })}
              />
            </div>
          ) : (
            <Select
              label="Printer"
              value={d.name ?? ''}
              onChange={(e) => set({ name: e.target.value })}
              hint={systemPrinters.length ? undefined : "Windows'da printer topilmadi — drayver o'rnatilganini tekshiring"}
            >
              <option value="">— Tanlang —</option>
              {systemPrinters.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
          <Select label="Qog'oz eni" value={String(d.width)} onChange={(e) => set({ width: e.target.value === '58' ? 58 : 80 })}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </Select>
          <Input
            label="Kod sahifasi (kirill)"
            hint="Ko'p printerlarda CP866 = 17. Kirill harflari buzilsa, printer qo'llanmasidan qarang."
            inputMode="numeric"
            value={String(d.codepage)}
            onChange={(e) => set({ codepage: Math.min(255, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0) })}
          />
          <div className="sm:col-span-2">
            <Button variant="outline" size="sm" icon={<Printer className="w-4 h-4" />} loading={testing} disabled={!deviceReady(d)} onClick={test}>
              Sinov cheki
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Desktop kassa printerlari (ESC/POS, oynasiz). Sozlama shu kompyuterda saqlanadi.
 * Kassa printeri yoqilmasa — cheklar avvalgidek Windows'ning asosiy printeriga (window.print) ketadi.
 */
export const PrintersCard: React.FC = () => {
  const toast = useToast();
  const [settings, setSettings] = useState<PrinterSettings>(getPrinterSettings);
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
  // Brauzerda chekni kompyuterdagi printer agenti chiqaradi; desktop ilovada agent kerak emas
  const desktop = isTauri();
  const [agentStatus, setAgentStatus] = useState<'checking' | 'up' | 'down'>('checking');
  const direct = desktop || settings.agent;

  const reload = () => {
    void listPrinters().then(setSystemPrinters);
    if (!desktop) {
      setAgentStatus('checking');
      void pingPrinterAgent().then((a) => setAgentStatus(a ? 'up' : 'down'));
    }
  };
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<PrinterSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    savePrinterSettings(next);
  };

  const drawer = async () => {
    try {
      await openCashDrawer();
    } catch (err) {
      toast.error(getErrorMessage(err, "Pul qutisini ochib bo'lmadi"));
    }
  };

  return (
    <Card>
      <CardHeader
        title="Printerlar (ESC/POS)"
        icon={<Printer className="w-[18px] h-[18px]" />}
        action={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={reload}>
            Yangilash
          </Button>
        }
      />
      <p className="text-[13px] text-muted">
        Chek oynasiz, to'g'ridan-to'g'ri termal printerga chiqadi: avtomatik kesiladi, pul qutisi ochiladi. Sozlama faqat shu kompyuter uchun.
      </p>
      <div className="divide-y divide-edge">
        {!desktop && (
          <SettingRow
            title="Printer agenti orqali chop etish"
            description={
              agentStatus === 'up'
                ? '✅ Agent ishlayapti'
                : agentStatus === 'checking'
                  ? 'Agent tekshirilmoqda…'
                  : "Agent topilmadi. Kassa kompyuterida printer-agent'ni ishga tushiring (printer-agent/README.md), so'ng “Yangilash”ni bosing."
            }
            control={<Switch checked={settings.agent} onChange={(agent) => update({ agent })} label="Printer agenti" />}
          />
        )}
        {direct && (
          <>
        <DeviceForm
          title="Kassa printeri"
          hint="Mijoz cheki va pre-chek. O'chiq bo'lsa — Windows'dagi asosiy printer ishlatiladi."
          icon={<Wallet className="w-4 h-4" />}
          value={settings.receipt}
          systemPrinters={systemPrinters}
          onChange={(receipt) => update({ receipt })}
        />
        <DeviceForm
          title="Oshxona printeri"
          hint="Buyurtma oshxonaga tushganda (kassa, ofitsiant, QR, ilova) narxsiz oshxona cheki chiqadi."
          icon={<ChefHat className="w-4 h-4" />}
          value={settings.kitchen}
          systemPrinters={systemPrinters}
          onChange={(kitchen) => update({ kitchen })}
        />
          </>
        )}
        {direct && settings.receipt && (
          <SettingRow
            title="Pul qutisi"
            description="Naqd to'lov cheki chiqqanda kassa printeriga ulangan pul qutisi ochiladi"
            control={
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={drawer}>
                  Ochish
                </Button>
                <Switch checked={settings.openDrawer} onChange={(openDrawer) => update({ openDrawer })} label="Pul qutisi" />
              </div>
            }
          />
        )}
      </div>
    </Card>
  );
};
