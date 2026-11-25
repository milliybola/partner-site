import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, ReceiptText, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Input, Select } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { getDisplayName, getPartner } from '../../../core/lib/session';
import { DEFAULT_DEVICE, PRINTERS_CHANGED_EVENT, getPrinterSettings, type PrinterDevice } from '../../../core/lib/printerConfig';
import {
  RECEIPT_LOOK_EVENT,
  getReceiptLook,
  refreshReceiptLook,
  removeReceiptLogo,
  updateReceiptLook,
  uploadReceiptLogo,
  type ReceiptLook,
} from '../../../core/lib/receiptLook';
import { t } from '../../../core/i18n';

/** Namunadagi chek qaysi printer sozlamasi bilan ko'rsatiladi: kassa printeri, bo'lmasa oshxonaniki */
const previewDevice = (): PrinterDevice => {
  const s = getPrinterSettings();
  return s.receipt ?? s.kitchen ?? DEFAULT_DEVICE;
};

const COLS = { 80: 48, 58: 32 } as const;

/** Termal chekning taxminiy ko'rinishi: qog'oz eni, chekkalar, baland shrift, logotip va rahmat matni */
const ReceiptPreview: React.FC<{ look: ReceiptLook; device: PrinterDevice }> = ({ look, device }) => {
  const cols = COLS[device.width] - (device.marginLeft ?? 0) - (device.marginRight ?? 0);
  const tall = device.fontSize === 'tall';
  const name = (getDisplayName(getPartner()) || 'Kafe').toUpperCase();
  const pair = (l: string, r: string) => `${l}${' '.repeat(Math.max(1, cols - l.length - r.length))}${r}`;
  const lines: Array<{ text: string; center?: boolean; bold?: boolean }> = [
    { text: `MilliyGo | ${name}`.slice(0, cols), center: true, bold: true },
    { text: 'milliyapp.uz', center: true, bold: true },
    { text: '-'.repeat(cols) },
    { text: pair('Buyurtma:', '000123') },
    { text: pair('Sana:', '24.11.2026 20:30') },
    { text: '-'.repeat(cols) },
    { text: pair('Lavash (tovuq)', '52 000 UZS'), bold: true },
    { text: '26 000 UZS x 2' },
    { text: pair('Fanta 0,5 L', '8 000 UZS'), bold: true },
    { text: '='.repeat(cols) },
    { text: pair('JAMI:', '60 000 UZS'), bold: true },
    { text: '='.repeat(cols) },
    { text: '' },
    { text: look.footer.trim() || t('rc.thanks'), center: true, bold: true },
  ];
  const logo = look.logo_position === 'top' && look.logo ? look.logo : null;
  return (
    <div className="rounded-2xl bg-field p-4">
      <div className="mb-2 text-center text-[12px] font-bold text-muted">
        Chek ko'rinishi · {device.width} mm
      </div>
      <div
        className="mx-auto bg-white text-black shadow-card"
        style={{ width: device.width === 80 ? 300 : 214, padding: '14px 0 18px', fontFamily: 'ui-monospace, Consolas, monospace' }}
      >
        <div style={{ paddingLeft: `${(device.marginLeft ?? 0) * (100 / COLS[device.width])}%`, paddingRight: `${(device.marginRight ?? 0) * (100 / COLS[device.width])}%` }}>
          {logo && (
            <img src={logo} alt="" className="mx-auto mb-2 block" style={{ width: `${look.logo_width}%`, filter: 'grayscale(1) contrast(1.6)' }} />
          )}
          {lines.map((l, i) => (
            <div
              key={i}
              className="overflow-hidden whitespace-pre"
              style={{
                fontSize: device.width === 80 ? 10.4 : 10.6,
                lineHeight: tall ? '26px' : '14px',
                textAlign: l.center ? 'center' : 'left',
                fontWeight: l.bold ? 800 : 400,
                paddingLeft: 6,
                paddingRight: 6,
              }}
            >
              <span style={tall ? { display: 'inline-block', transform: 'scaleY(1.9)', transformOrigin: 'center' } : undefined}>{l.text || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Chek ko'rinishi (kafe bo'yicha, barcha kassalarda bir xil): logotip, uning joyi va eni, rahmat matni.
 * Shrift va chekkalar — har printerning o'z sozlamasida (Printerlar kartasi), namunada shu kompyuterdagisi ko'rinadi.
 */
export const ReceiptLookCard: React.FC = () => {
  const toast = useToast();
  const [look, setLook] = useState<ReceiptLook>(getReceiptLook);
  const [draft, setDraft] = useState({ logo_position: look.logo_position, logo_width: look.logo_width, footer: look.footer });
  const [device, setDevice] = useState<PrinterDevice>(previewDevice);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshReceiptLook().then((l) => {
      setLook(l);
      setDraft({ logo_position: l.logo_position, logo_width: l.logo_width, footer: l.footer });
    });
    const onLook = () => setLook(getReceiptLook());
    const onPrinters = () => setDevice(previewDevice());
    window.addEventListener(RECEIPT_LOOK_EVENT, onLook);
    window.addEventListener(PRINTERS_CHANGED_EVENT, onPrinters);
    return () => {
      window.removeEventListener(RECEIPT_LOOK_EVENT, onLook);
      window.removeEventListener(PRINTERS_CHANGED_EVENT, onPrinters);
    };
  }, []);

  const dirty = draft.logo_position !== look.logo_position || draft.logo_width !== look.logo_width || draft.footer !== look.footer;

  const save = async () => {
    setSaving(true);
    try {
      const l = await updateReceiptLook({ ...draft, footer: draft.footer.trim() });
      setLook(l);
      setDraft({ logo_position: l.logo_position, logo_width: l.logo_width, footer: l.footer });
      toast.success('Chek ko‘rinishi saqlandi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi"));
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const l = await uploadReceiptLogo(file);
      setLook(l);
      setDraft((d) => ({ ...d, logo_position: l.logo_position }));
      toast.success('Logotip yuklandi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Logotipni yuklab bo'lmadi"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const dropLogo = async () => {
    setUploading(true);
    try {
      const l = await removeReceiptLogo();
      setLook(l);
      setDraft((d) => ({ ...d, logo_position: l.logo_position }));
    } catch (err) {
      toast.error(getErrorMessage(err, "Logotipni olib tashlab bo'lmadi"));
    } finally {
      setUploading(false);
    }
  };

  // Namunada saqlanmagan o'zgarishlar ham ko'rinadi
  const shown: ReceiptLook = { ...look, ...draft };

  return (
    <Card>
      <CardHeader title="Chek ko'rinishi" icon={<ReceiptText className="w-[18px] h-[18px]" />} />
      <p className="text-[13px] text-muted">
        Logotip va rahmat matni barcha kassalarda bir xil chiqadi. Shrift va chekkalar — har printerning o'z sozlamasida (yuqorida).
      </p>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13px] font-bold text-ink">Logotip</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-edge bg-white">
                {look.logo ? <img src={look.logo} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-subtle" />}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pickLogo(e.target.files?.[0])} />
              <Button variant="outline" size="sm" icon={<ImagePlus className="w-4 h-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>
                {look.logo ? 'Almashtirish' : 'Logotip yuklash'}
              </Button>
              {look.logo && (
                <Button variant="outline" size="sm" icon={<Trash2 className="w-4 h-4" />} disabled={uploading} onClick={() => void dropLogo()}>
                  Olib tashlash
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-muted">Oq fonli, qora-oq logotip eng toza chiqadi. Termal printer rangni oq-qora nuqtalarga aylantiradi.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Logotip joylashuvi"
              value={draft.logo_position}
              disabled={!look.logo}
              onChange={(e) => setDraft((d) => ({ ...d, logo_position: e.target.value as ReceiptLook['logo_position'] }))}
            >
              <option value="none">Yo'q</option>
              <option value="top">Tepada (markazda)</option>
            </Select>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[13px] font-bold text-ink">
                <span>Logotip eni</span>
                <span className="tabular-nums text-muted">{draft.logo_width}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={draft.logo_width}
                disabled={!look.logo}
                onChange={(e) => setDraft((d) => ({ ...d, logo_width: Number(e.target.value) }))}
                className="w-full accent-[rgb(var(--color-brand))]"
              />
            </div>
          </div>
          <Input
            label="Minnatdorchilik matni"
            placeholder={t('rc.thanks')}
            maxLength={150}
            value={draft.footer}
            hint="Chekning eng oxirida chiqadi. Bo'sh qoldirilsa — standart matn."
            onChange={(e) => setDraft((d) => ({ ...d, footer: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
              Saqlash
            </Button>
            {dirty && (
              <Button variant="outline" onClick={() => setDraft({ logo_position: look.logo_position, logo_width: look.logo_width, footer: look.footer })}>
                Bekor qilish
              </Button>
            )}
          </div>
        </div>
        <ReceiptPreview look={shown} device={device} />
      </div>
    </Card>
  );
};
