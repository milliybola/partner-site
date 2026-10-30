import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Lock, Printer, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, EmptyState, Sheet } from '../../../core/ui';
import type { TableModel } from '../services/tablesApi';

interface PosterProps {
  table: TableModel;
  restaurantName: string;
  logo?: string | null;
  /** 1em = fontSize. Plakat 21em × 29.7em (A5) */
  fontSize: string;
}

/** "Stol | 5" → ["Stol", "5"]; boshqa nom bo'lsa — butun nom katta chiqadi. */
const splitName = (name: string): [string | null, string] => {
  const parts = name.split('|').map((p) => p.trim()).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : [null, name.trim()];
};

/** A5 plakat: hamma o'lcham `em` da, shuning uchun ekranda kichik ko'rinadi, chop etishda A5 to'ldiradi. */
export const TableQrPoster: React.FC<PosterProps> = ({ table, restaurantName, logo, fontSize }) => {
  const [prefix, number] = splitName(table.table_number);
  return (
    <div
      className="qr-poster flex flex-col overflow-hidden bg-white text-ink"
      style={{ fontSize, width: '21em', height: '29.7em', borderRadius: '1.1em', border: '1px solid #EEF0F3' }}
    >
      <div className="flex flex-col items-center bg-brand text-white" style={{ padding: '1.7em 1.5em 1.9em' }}>
        {logo && (
          <img
            src={logo}
            alt=""
            className="bg-white object-cover"
            style={{ width: '3.6em', height: '3.6em', borderRadius: '1em', marginBottom: '0.7em' }}
          />
        )}
        <div className="text-center font-black leading-tight" style={{ fontSize: '1.6em' }}>
          {restaurantName}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center" style={{ padding: '1.2em 1.5em', gap: '0.9em' }}>
        <div className="text-center leading-none">
          {prefix && (
            <div className="font-bold uppercase text-muted" style={{ fontSize: '1em', letterSpacing: '0.25em', marginBottom: '0.3em' }}>
              {prefix}
            </div>
          )}
          <div className="font-black tracking-tight" style={{ fontSize: number.length > 3 ? '2.6em' : '4.4em' }}>
            {number}
          </div>
        </div>

        <div className="bg-white" style={{ padding: '0.9em', borderRadius: '1.1em', border: '0.18em solid #15803D' }}>
          <QRCodeSVG
            value={table.qr_url ?? ''}
            size={256}
            level="M"
            marginSize={0}
            fgColor="#111111"
            bgColor="#ffffff"
            style={{ width: '11em', height: '11em', display: 'block' }}
          />
        </div>

        <div className="text-center">
          <div className="font-black" style={{ fontSize: '1.3em' }}>
            Skanerlang va buyurtma bering
          </div>
          <div className="text-muted" style={{ fontSize: '0.8em', marginTop: '0.4em' }}>
            Menyu · Buyurtma · Ofitsiantni chaqirish · Hisobni ko'rish
          </div>
        </div>
      </div>

      <div className="text-center font-black text-brand" style={{ fontSize: '0.95em', padding: '0.9em', borderTop: '1px solid #EEF0F3' }}>
        Milliy<span style={{ color: '#F5B400' }}>Go</span>
      </div>
    </div>
  );
};

/** Chop etish: plakatlar `document.body` ga alohida qatlam sifatida qo'yiladi; qolgan sahifa chop etishda yashiriladi (index.css). */
const PrintLayer: React.FC<{ tables: TableModel[]; restaurantName: string; logo?: string | null; onDone: () => void }> = ({
  tables,
  restaurantName,
  logo,
  onDone,
}) => {
  useEffect(() => {
    document.body.classList.add('printing-qr');
    const finish = () => {
      document.body.classList.remove('printing-qr');
      onDone();
    };
    window.addEventListener('afterprint', finish, { once: true });
    const t = setTimeout(() => window.print(), 150); // logotiplar chizilib bo'lsin
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing-qr');
    };
  }, [onDone]);

  return createPortal(
    <div className="qr-print-root">
      {tables.map((t) => (
        <TableQrPoster key={t.uuid} table={t} restaurantName={restaurantName} logo={logo} fontSize="7.0476mm" />
      ))}
    </div>,
    document.body,
  );
};

interface SheetProps {
  open: boolean;
  onClose: () => void;
  enabled: boolean;
  tables: TableModel[];
  restaurantName: string;
  logo?: string | null;
  canManage: boolean;
  onReset: (t: TableModel) => Promise<void>;
}

/** «Stol QR-kodlari»: har stol uchun alohida plakat ko'rinishi, chop etish va QR'ni yangilash. */
export const TableQrSheet: React.FC<SheetProps> = ({ open, onClose, enabled, tables, restaurantName, logo, canManage, onReset }) => {
  const [printing, setPrinting] = useState<TableModel[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const done = useCallback(() => setPrinting(null), []);
  const list = tables.filter((t) => t.is_active !== false && t.qr_url);

  const reset = async (t: TableModel) => {
    setBusy(t.uuid);
    try {
      await onReset(t);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        size="lg"
        title="Stol QR-kodlari"
        subtitle={enabled ? "Har stolga alohida QR: mijoz skanerlab o'sha stoldan buyurtma beradi" : undefined}
        footer={
          enabled && list.length > 0 ? (
            <Button size="lg" block icon={<Printer className="w-4 h-4" />} onClick={() => setPrinting(list)}>
              Hammasini chop etish ({list.length} ta, A5)
            </Button>
          ) : undefined
        }
      >
        {!enabled ? (
          <EmptyState
            icon={<Lock className="w-7 h-7" />}
            title="Stol QR menyusi Plus tarifida"
            description="Plus tarifida har stolga alohida QR beriladi: mijoz telefondan buyurtma beradi, ofitsiantni chaqiradi va hisobini ko'radi."
            action={
              <Link to="/plan?need=qr_menu">
                <Button>Tarifni ko'rish</Button>
              </Link>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState title="Faol stol yo'q" description="Avval stol qo'shing — keyin QR plakatlar shu yerda chiqadi." />
        ) : (
          <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2">
            {list.map((t) => (
              <div key={t.uuid} className="rounded-2xl border border-edge bg-surface-2 p-3">
                <div className="flex justify-center overflow-hidden" style={{ height: '19em', fontSize: '10px' }}>
                  <div style={{ transform: 'scale(0.62)', transformOrigin: 'top center', height: '29.7em' }}>
                    <TableQrPoster table={t} restaurantName={restaurantName} logo={logo} fontSize="10px" />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="md" block icon={<Printer className="w-4 h-4" />} onClick={() => setPrinting([t])}>
                    Chop etish
                  </Button>
                  {canManage && (
                    <Button
                      size="md"
                      variant="outline"
                      loading={busy === t.uuid}
                      icon={<RefreshCw className="w-4 h-4" />}
                      onClick={() => reset(t)}
                      aria-label="QR'ni yangilash"
                      title="QR'ni yangilash (eski QR ishlamaydi)"
                    >
                      <span className="sr-only">QR'ni yangilash</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Sheet>
      {printing && <PrintLayer tables={printing} restaurantName={restaurantName} logo={logo} onDone={done} />}
    </>
  );
};
