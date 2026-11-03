import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { BellRing, BookOpen, Lock, Printer, ReceiptText, RefreshCw, ShoppingCart } from 'lucide-react';
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

const G_DARK = '#0B4F2A';
const G = '#15803D';
const G_LIGHT = '#22A14B';
const GOLD = '#F5B400';
const GOLD_SOFT = '#FFF4CC';
const MINT = '#E7F5EA';

/** Burchakdagi milliy naqsh (romb) — SVG pattern, chop etishda ham aniq */
const Ornament: React.FC<{ id: string; flip?: boolean }> = ({ id, flip }) => (
  <svg
    viewBox="0 0 120 70"
    style={{
      position: 'absolute',
      top: 0,
      [flip ? 'right' : 'left']: 0,
      width: '6.4em',
      height: '3.7em',
      transform: flip ? 'scaleX(-1)' : undefined,
    }}
    aria-hidden
  >
    <defs>
      <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill={G} />
        <path d="M10 1 L19 10 L10 19 L1 10 Z" fill="none" stroke="#7BC67E" strokeWidth="2" />
        <path d="M10 6 L14 10 L10 14 L6 10 Z" fill="#B7E4A6" />
      </pattern>
      <clipPath id={`${id}-c`}>
        <path d="M0 0 H120 C95 8 70 22 48 44 C30 62 12 68 0 70 Z" />
      </clipPath>
    </defs>
    <rect width="120" height="70" fill={`url(#${id})`} clipPath={`url(#${id}-c)`} />
    <path d="M120 0 C95 8 70 22 48 44 C30 62 12 68 0 70" fill="none" stroke={GOLD} strokeWidth="4" />
  </svg>
);

/** Pastki manzara: tog'lar, archalar, darvoza va yashil to'lqin */
const Landscape: React.FC = () => (
  <svg
    viewBox="0 0 420 80"
    preserveAspectRatio="none"
    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
    aria-hidden
  >
    <path d="M40 44 L95 14 L118 27 L150 4 L205 42 Z" fill="#CFEBD6" />
    <path d="M95 14 L104 20 L98 25 L113 24 L118 27 L150 4 L139 19 L128 17 Z" fill="#FFFFFF" opacity="0.85" />
    <g fill={G_LIGHT}>
      {[236, 248, 356, 368, 381].map((x, i) => (
        <path key={x} d={`M${x} ${44 - (i % 2) * 3} l6 -${17 + (i % 2) * 4} l6 ${17 + (i % 2) * 4} Z`} />
      ))}
    </g>
    <g fill="none" stroke={G} strokeWidth="2.2">
      <rect x="288" y="12" width="46" height="32" />
      <path d="M301 44 V30 a10 10 0 0 1 20 0 V44" />
      <path d="M284 12 H338 M291 6 H331 V12 M291 6 V12" />
    </g>
    <path d="M0 40 C90 28 170 50 260 38 C330 29 380 32 420 36 V80 H0 Z" fill={GOLD} />
    <path d="M0 46 C90 34 170 56 260 44 C330 35 380 38 420 42 V80 H0 Z" fill={G} />
  </svg>
);

const ICON_STYLE = { width: '100%', height: '100%' } as const;
const FEATURES: { icon: React.ReactNode; label: string; fg: string; bg: string }[] = [
  { icon: <BookOpen style={ICON_STYLE} strokeWidth={2.3} />, label: "Menyuni ko'ring", fg: G, bg: MINT },
  { icon: <ShoppingCart style={ICON_STYLE} strokeWidth={2.3} />, label: 'Buyurtma bering', fg: G, bg: MINT },
  { icon: <BellRing style={ICON_STYLE} strokeWidth={2.3} />, label: 'Ofitsiantni chaqiring', fg: '#B07D00', bg: GOLD_SOFT },
  { icon: <ReceiptText style={ICON_STYLE} strokeWidth={2.3} />, label: "Hisobingizni ko'ring", fg: G, bg: MINT },
];

const CORNERS = [
  { top: '0.3em', left: '0.3em', borderTopWidth: '0.26em', borderLeftWidth: '0.26em', borderTopLeftRadius: '0.75em' },
  { top: '0.3em', right: '0.3em', borderTopWidth: '0.26em', borderRightWidth: '0.26em', borderTopRightRadius: '0.75em' },
  { bottom: '0.3em', left: '0.3em', borderBottomWidth: '0.26em', borderLeftWidth: '0.26em', borderBottomLeftRadius: '0.75em' },
  { bottom: '0.3em', right: '0.3em', borderBottomWidth: '0.26em', borderRightWidth: '0.26em', borderBottomRightRadius: '0.75em' },
] as const;

/**
 * Nom shrifti: bitta qatorga sig'adigan qilib kichraytiriladi (o'rtacha harf ≈ 0.6em). Juda uzun nom — 1.1em, 2 qator.
 * Sarlavha balandligi doim bir xil (2.7em), shuning uchun plakat A5 dan oshmaydi.
 */
const nameSize = (name: string, hasLogo: boolean) => {
  const width = hasLogo ? 12.4 : 15.5;
  const fit = width / (0.6 * Math.max(1, name.trim().length));
  return `${Math.min(2.6, Math.max(1.1, fit)).toFixed(2)}em`;
};

/**
 * A5 plakat (148 × 210 mm): hamma o'lcham `em` da — 21em × 29.7em. Ekranda kichik ko'rinadi, chop etishda A5 to'ldiradi.
 * Muhim narsalar chetdan kamida ~1.1em (≈8 mm) ichkarida — printer chetini kesib qo'ysa ham ko'rinadi.
 */
export const TableQrPoster: React.FC<PosterProps> = ({ table, restaurantName, logo, fontSize }) => {
  const [prefix, number] = splitName(table.table_number);
  const uid = `orn-${table.uuid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const numSize = number.length <= 2 ? '1.3em' : number.length <= 4 ? '0.9em' : '0.7em';
  return (
    <div
      className="qr-poster relative flex flex-col overflow-hidden text-ink"
      style={{
        fontSize,
        width: '21em',
        height: '29.7em',
        borderRadius: '1.1em',
        border: '1px solid #EEF0F3',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F6FAF7 55%, #EAF4EC 100%)',
      }}
    >
      <Ornament id={`${uid}-l`} />
      <Ornament id={`${uid}-r`} flip />

      {/* Sarlavha: logo nom yonida — plakat balandligi logoga bog'liq emas */}
      <div className="relative flex flex-col items-center text-center" style={{ padding: '2.2em 1.5em 0' }}>
        <div className="flex items-center justify-center" style={{ gap: '0.45em', maxWidth: '16em', height: '2.7em' }}>
          {logo && (
            <img
              src={logo}
              alt=""
              className="shrink-0 bg-white object-cover"
              style={{ width: '2.5em', height: '2.5em', borderRadius: '0.7em', boxShadow: '0 0.12em 0.45em rgba(0,0,0,.14)' }}
            />
          )}
          <div
            className="font-black"
            style={{
              fontSize: nameSize(restaurantName, !!logo),
              lineHeight: 1.02,
              color: G_DARK,
              letterSpacing: '-0.02em',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {restaurantName}
          </div>
        </div>
        <div style={{ width: '4.6em', height: '0.22em', borderRadius: '1em', background: GOLD, margin: '0.45em 0 0.5em' }} />
        <div className="flex items-center" style={{ gap: '0.5em' }}>
          <span style={{ width: '1.3em', height: '0.12em', borderRadius: '1em', background: GOLD }} />
          <span className="font-black italic" style={{ fontSize: '1.2em', color: G_DARK, lineHeight: 1.1 }}>
            Barchasi shu yerda!
          </span>
          <span style={{ width: '1.3em', height: '0.12em', borderRadius: '1em', background: GOLD }} />
        </div>
        <div style={{ fontSize: '0.64em', marginTop: '0.3em', color: '#45514A', lineHeight: 1.3 }}>
          Kamerani QR-kodga qarating va buyurtma bering
        </div>
      </div>

      {/* QR — plakatning yarmidan kengi: 1–1.5 m dan ham oson skanerlanadi */}
      <div className="relative flex flex-1 items-center justify-center">
        {[-1, 1].map((s) => (
          <svg
            key={s}
            viewBox="0 0 30 40"
            style={{
              position: 'absolute',
              top: '50%',
              [s < 0 ? 'left' : 'right']: '1.1em',
              width: '1.3em',
              height: '1.75em',
              transform: `translateY(-50%)${s > 0 ? ' scaleX(-1)' : ''}`,
            }}
            aria-hidden
          >
            <g stroke={GOLD} strokeWidth="4.5" strokeLinecap="round">
              <path d="M24 6 L10 2" />
              <path d="M26 20 L6 20" />
              <path d="M24 34 L10 38" />
            </g>
          </svg>
        ))}
        <div
          className="relative bg-white"
          style={{ padding: '0.35em', borderRadius: '1.25em', border: `0.2em solid ${GOLD}`, boxShadow: '0 0.35em 1.1em rgba(21,128,61,.16)' }}
        >
          {CORNERS.map((c, i) => (
            <span key={i} style={{ position: 'absolute', width: '1.6em', height: '1.6em', borderColor: G_LIGHT, borderStyle: 'solid', borderWidth: 0, ...c }} />
          ))}
          <div className="relative" style={{ margin: '0.5em' }}>
            <QRCodeSVG
              value={table.qr_url ?? ''}
              size={360}
              level="H"
              marginSize={0}
              fgColor="#0E1A13"
              bgColor="#ffffff"
              style={{ width: '10.2em', height: '10.2em', display: 'block' }}
            />
            {/* Markazdagi stol nishoni: QR "H" darajada — markazi yopilsa ham o'qiladi (nishon ≈ 9% maydon) */}
            <div
              className="absolute flex flex-col items-center justify-center text-white"
              style={{
                left: '50%',
                top: '50%',
                width: '3.3em',
                height: '3.3em',
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 30%, ${G_LIGHT}, ${G_DARK})`,
                border: `0.2em solid ${GOLD}`,
                boxShadow: '0 0 0 0.22em #fff',
              }}
            >
              <span className="font-bold leading-none" style={{ fontSize: '0.5em', letterSpacing: '0.04em' }}>
                {prefix ?? 'Stol'}
              </span>
              <span className="font-black leading-none" style={{ fontSize: numSize, marginTop: '0.08em' }}>
                {number}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Xizmatlar */}
      <div className="relative grid grid-cols-4" style={{ gap: '0.4em', padding: '0 1.1em' }}>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex flex-col items-center bg-white text-center"
            style={{ gap: '0.32em', padding: '0.5em 0.2em 0.45em', borderRadius: '0.8em', boxShadow: '0 0.1em 0.45em rgba(11,79,42,.10)' }}
          >
            <span
              className="flex shrink-0 items-center justify-center"
              style={{ width: '1.85em', height: '1.85em', borderRadius: '0.6em', background: f.bg, color: f.fg, padding: '0.36em' }}
            >
              {f.icon}
            </span>
            <span className="font-extrabold" style={{ fontSize: '0.58em', lineHeight: 1.15, color: G_DARK }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {/* Pastki qism */}
      <div className="relative shrink-0" style={{ height: '3.6em', marginTop: '0.35em' }}>
        <Landscape />
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-center text-white"
          style={{ height: '2.1em', gap: '0.5em', fontSize: '0.72em' }}
        >
          <span style={{ width: '1.6em', height: '0.08em', background: '#fff', opacity: 0.8 }} />
          <span className="font-bold">
            MilliyGo xizmat ko'rsatadi — <span style={{ color: GOLD }}>milliyapp.uz</span>
          </span>
          <span style={{ width: '1.6em', height: '0.08em', background: '#fff', opacity: 0.8 }} />
        </div>
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
