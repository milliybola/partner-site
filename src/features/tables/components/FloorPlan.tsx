import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, LayoutGrid, Move, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import type { Hall, TableModel, TablePosition } from '../services/tablesApi';
import type { TableDraft } from '../lib/tableDrafts';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, minutesSince } from '../../../core/lib/format';
import { Button } from '../../../core/ui';
import { t } from '../../../core/i18n';

/**
 * Kassadagi zal xaritasi (InOne/YesPOS uslubida): stollar atrofida stullar bilan, zal rejasidagi joyida.
 * Yashil — bo'sh, qizil — band, sariq — QR tasdiq kutmoqda, ko'k — tayyor. Joylar serverda foizda saqlanadi,
 * shuning uchun har qanday ekranda bir xil ko'rinadi. Hali joylashtirilmagan stol tartib raqami bo'yicha
 * avtomatik to'rga qo'yiladi. Ega/menejer «Joylashtirish» rejimida stollarni sudraydi va fon rasmini qo'yadi.
 */

type Pos = { x: number; y: number };

/** Stol kartasining o'lchami (px) — joy (0–100%) kartaning chap-yuqori burchagi uchun «maydon − karta» ichida */
const TILE = 92;
/** Xarita ichki chekkasi (px): stullar maydon chetida kesilmasin; sudrash hisobi ham shuni hisobga oladi */
const INSET = 24;
/** Bitta stol egallaydigan joy (px): stol + ikki tomondagi stullar + kichik oraliq — stollar bir-biriga tegmasligi uchun */
const FOOT = TILE + 2 * 18 + 8;

/**
 * Avtomatik to'r. `rowsWanted` berilmasa — ustunlar soni ekran nisbatiga yaqin (joylashtirilmagan stollar uchun).
 * `byColumn` — stollar ustun bo'yicha to'ldiriladi (1–6 birinchi ustun, 7–12 ikkinchi …), aks holda qator bo'yicha.
 */
const autoPositions = (tables: TableModel[], rowsWanted?: number, byColumn = false): Record<string, Pos> => {
  const n = tables.length;
  if (!n) return {};
  const rows = rowsWanted ? Math.min(n, Math.max(1, rowsWanted)) : Math.max(1, Math.ceil(n / Math.max(1, Math.ceil(Math.sqrt(n * 1.6)))));
  const cols = Math.max(1, Math.ceil(n / rows));
  const out: Record<string, Pos> = {};
  tables.forEach((tb, i) => {
    const c = byColumn ? Math.floor(i / rows) : i % cols;
    const r = byColumn ? i % rows : Math.floor(i / cols);
    out[tb.uuid] = {
      x: cols === 1 ? 50 : (c / (cols - 1)) * 100,
      y: rows === 1 ? 50 : (r / (rows - 1)) * 100,
    };
  });
  return out;
};

const positionsOf = (tables: TableModel[]): Record<string, Pos> => {
  const auto = autoPositions(tables);
  const out: Record<string, Pos> = {};
  for (const tb of tables) {
    out[tb.uuid] = tb.pos_x != null && tb.pos_y != null ? { x: tb.pos_x, y: tb.pos_y } : auto[tb.uuid];
  }
  return out;
};

type Kind = 'free' | 'busy' | 'wait' | 'ready' | 'reserved' | 'draft' | 'inactive';
const TONE: Record<Kind, { tile: string; chair: string; text: string }> = {
  free: { tile: 'bg-brand-bright', chair: 'bg-brand-bright', text: 'text-white' },
  busy: { tile: 'bg-danger', chair: 'bg-danger', text: 'text-white' },
  wait: { tile: 'bg-warning', chair: 'bg-warning', text: 'text-ink' },
  ready: { tile: 'bg-info', chair: 'bg-info', text: 'text-white' },
  reserved: { tile: 'bg-[#64748B]', chair: 'bg-[#64748B]', text: 'text-white' },
  draft: { tile: 'bg-warning-soft border-2 border-dashed border-warning', chair: 'bg-warning', text: 'text-ink' },
  inactive: { tile: 'bg-surface/80 border-2 border-dashed border-edge-strong', chair: 'bg-edge-strong', text: 'text-muted' },
};

const kindOf = (tb: TableModel, draft?: TableDraft): Kind => {
  const o = tb.current_order;
  if (tb.is_active === false) return 'inactive';
  if (o && (o.status === 'PENDING' || o.status === 'NEW')) return 'wait';
  if (o?.status === 'READY_FOR_PICKUP') return 'ready';
  if (o || tb.status === 'OCCUPIED') return 'busy';
  if (draft) return 'draft';
  if (tb.status === 'RESERVED') return 'reserved';
  return 'free';
};

/** Stullar: chap/o'ng — bittadan, qolgani tepa va pastga teng bo'linadi (har tomonda ko'pi bilan 3 ta) */
const chairsOf = (capacity: number) => {
  const cap = Math.max(1, capacity || 4);
  const side = cap >= 2 ? 1 : 0;
  const rest = Math.max(0, cap - side * 2);
  return { side, top: Math.min(3, Math.ceil(rest / 2)), bottom: Math.min(3, Math.floor(rest / 2)) };
};

const Chairs: React.FC<{ count: number; dir: 'top' | 'bottom' | 'left' | 'right'; cls: string }> = ({ count, dir, cls }) => {
  if (!count) return null;
  const horizontal = dir === 'top' || dir === 'bottom';
  // Stul: qalinligi 14px, stoldan 4px uzoqda; eni tomondagi soniga qarab (1 — keng, 3 — tor), stol eniga sig'adi
  const place = {
    top: 'left-0 right-0 -top-[18px] flex-row',
    bottom: 'left-0 right-0 -bottom-[18px] flex-row',
    left: 'top-0 bottom-0 -left-[18px] flex-col',
    right: 'top-0 bottom-0 -right-[18px] flex-col',
  }[dir];
  const len = count === 1 ? 48 : count === 2 ? 38 : 26;
  return (
    <span className={`absolute ${place} flex items-center justify-center gap-1.5 pointer-events-none`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`${cls} rounded-[4px] opacity-95 shadow-sm`}
          style={horizontal ? { width: len, height: 14 } : { width: 14, height: len }}
        />
      ))}
    </span>
  );
};

const PlanTile: React.FC<{
  table: TableModel;
  label: string;
  draft?: TableDraft;
  now: number;
  editing: boolean;
  dragging: boolean;
}> = ({ table, label, draft, now, editing, dragging }) => {
  const kind = kindOf(table, draft);
  const tone = TONE[kind];
  const o = table.current_order;
  const mins = o?.created_at ? minutesSince(o.created_at, now) : null;
  const who = o ? (o.order_source === 'QR' && !o.waiter_name ? 'QR' : o.waiter_name || t('detail.srcPos')) : '';
  const ch = chairsOf(table.capacity);
  return (
    <span
      className={`relative block rounded-xl shadow-lg transition ${tone.tile} ${dragging ? 'scale-105 ring-4 ring-white/70' : ''} ${
        editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:brightness-110 active:scale-95'
      }`}
      style={{ width: TILE, height: TILE }}
    >
      <Chairs count={ch.top} dir="top" cls={tone.chair} />
      <Chairs count={ch.bottom} dir="bottom" cls={tone.chair} />
      <Chairs count={ch.side} dir="left" cls={tone.chair} />
      <Chairs count={ch.side} dir="right" cls={tone.chair} />
      <span className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center ${tone.text}`}>
        <span className={`${o || draft ? 'text-[28px]' : 'text-[32px]'} font-black leading-none tracking-tightest max-w-full truncate`}>{label}</span>
        {o ? (
          // Band stol (YesPOS kabi): raqam va kim ochgani; summa sarlavhada, tafsilot stol bosilganda
          <span className="mt-0.5 text-[12px] font-extrabold opacity-95 leading-tight max-w-full truncate inline-flex items-center gap-0.5" title={mins !== null ? `${mins}′` : undefined}>
            {o.order_source === 'QR' && <QrCode className="w-3 h-3 shrink-0" />}
            {who}
          </span>
        ) : draft ? (
          <span className="text-[12px] font-black tabular-nums leading-tight">{formatMoney(draft.subtotal)}</span>
        ) : kind === 'reserved' ? (
          <span className="text-[10px] font-bold opacity-90">{t('tp.reserved')}</span>
        ) : kind === 'inactive' ? (
          <span className="text-[10px] font-bold">{t('tp.inactive')}</span>
        ) : null /* bo'sh stol: faqat raqam — sig'imni stullar ko'rsatadi */}
      </span>
    </span>
  );
};

export const FloorPlan: React.FC<{
  /** Chapdagi sarlavha: «Stollar (389 000)» */
  title?: React.ReactNode;
  tables: TableModel[];
  hall: Hall | null;
  drafts: Record<string, TableDraft>;
  now: number;
  /** Ega/menejer: joylashtirish va fon rasmi */
  canEdit: boolean;
  /** Zal yo'q bo'lsa fon rasmi qo'yib bo'lmaydi — «Zallarni sozlash» oynasini ochadi */
  onManageHalls?: () => void;
  /** Kassa: ekranda fon rasmi bor — shaffof panel uslubi; boshqaruvda rasm xarita maydoni ichida */
  fullBg?: boolean;
  labelOf: (tb: TableModel) => string;
  onOpen: (tb: TableModel) => void;
  onMenu: (tb: TableModel) => void;
  /** Saqlangandan keyin stollar/zallar qayta yuklansin */
  onSaved: () => void;
  /** Kartaning ostidagi tezkor amal («Tayyor» / «Ofitsiant») — oddiy to'rdagi kabi */
  quickAction?: (tb: TableModel) => { label: string; run: () => void; busy?: boolean } | null;
  /** Ro'yxat (to'r) ko'rinishiga o'tish */
  onGrid: () => void;
  /** Yangilash (kassa: sarlavha qatorida, Ro'yxat ikonkasi yonida) */
  onRefresh?: () => void;
  refreshing?: boolean;
}> = ({ title, tables, hall, drafts, now, canEdit, onManageHalls, fullBg = false, labelOf, onOpen, onMenu, onSaved, quickAction, onGrid, onRefresh, refreshing = false }) => {
  const toast = useToast();
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = useMemo(() => positionsOf(tables), [tables]);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<Record<string, Pos>>(saved);
  // Tartiblash: qatorlar soni va to'ldirish yo'nalishi (o'zgarishi bilan stollar qayta joylanadi)
  const [rowsWanted, setRowsWanted] = useState(() => Math.max(1, Math.round(Math.sqrt(Math.max(1, tables.length) / 1.6))));
  const [byColumn, setByColumn] = useState(false);
  const arrange = (rows: number, col: boolean) => {
    const r = Math.min(Math.max(1, tables.length), Math.max(1, rows));
    setRowsWanted(r);
    setByColumn(col);
    setLocal(autoPositions(tables, r, col));
  };
  const [drag, setDrag] = useState<{ uuid: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);

  // Tahrirda — qo'lda surilgan joylar (server yangilanishi ularni bosib ketmaydi; yangi kelgan stol — saqlangan joyida).
  // Boshqa zalga o'tilsa komponent qayta yaratiladi (key = zal), tahrir o'z-o'zidan bekor bo'ladi.
  const pos: Record<string, Pos> = useMemo(() => (editing ? { ...saved, ...local } : saved), [editing, saved, local]);

  // Xarita o'lchami: stollar sig'masa (ko'p qator, past ekran) — hammasi bir xil kichrayadi, ustma-ust tushmaydi
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = useMemo(() => {
    if (!box.w || !box.h) return 1;
    const spanX = Math.max(1, box.w - INSET * 2 - TILE);
    const spanY = Math.max(1, box.h - INSET * 2 - TILE);
    const list = tables.map((tb) => pos[tb.uuid]).filter(Boolean) as Pos[];
    let s = 1;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.max((Math.abs(list[i].x - list[j].x) / 100) * spanX, (Math.abs(list[i].y - list[j].y) / 100) * spanY);
        if (d < 4) continue; // ataylab ustma-ust qo'yilgan — hisobga olinmaydi
        s = Math.min(s, d / FOOT);
      }
    }
    return Math.max(0.45, Math.min(1, s));
  }, [box.w, box.h, tables, pos]);
  const size = Math.round(TILE * scale);

  const toPct = (clientX: number, clientY: number, dx: number, dy: number): Pos | null => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const w = Math.max(1, rect.width - INSET * 2 - size);
    const h = Math.max(1, rect.height - INSET * 2 - size);
    const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
    return {
      x: clamp(((clientX - rect.left - INSET - dx) / w) * 100),
      y: clamp(((clientY - rect.top - INSET - dy) / h) * 100),
    };
  };

  const onPointerDown = (e: React.PointerEvent, tb: TableModel) => {
    if (!editing) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ uuid: tb.uuid, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPct(e.clientX, e.clientY, drag.dx, drag.dy);
    if (!p) return;
    setLocal((prev) => ({ ...prev, [drag.uuid]: p }));
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };
  const onPointerUp = (tb: TableModel) => {
    const wasDrag = drag?.moved;
    setDrag(null);
    if (editing) {
      // Tahrirda bosish (surmasdan) — stol amallari (nomi, zali, o'chirish)
      if (!wasDrag) onMenu(tb);
      return;
    }
    onOpen(tb);
  };

  const save = async () => {
    const items: TablePosition[] = tables
      .filter((tb) => {
        const p = local[tb.uuid];
        return p && (p.x !== tb.pos_x || p.y !== tb.pos_y);
      })
      .map((tb) => ({ uuid: tb.uuid, pos_x: local[tb.uuid].x, pos_y: local[tb.uuid].y }));
    if (!items.length) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await tablesApi.saveLayout(items);
      toast.success(t('fp.saved'));
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, t('fp.saveFail')));
    } finally {
      setSaving(false);
    }
  };

  const pickBackground = async (file: File | undefined) => {
    if (!file || !hall) return;
    setBgBusy(true);
    try {
      await tablesApi.uploadHallBackground(hall.uuid, file);
      toast.success(t('fp.bgSaved'));
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, t('fp.bgFail')));
    } finally {
      setBgBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeBackground = async () => {
    if (!hall) return;
    setBgBusy(true);
    try {
      await tablesApi.removeHallBackground(hall.uuid);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, t('fp.bgFail')));
    } finally {
      setBgBusy(false);
    }
  };

  const bg = hall?.background || null;
  // Kassada fon butun ekranda (Sotuv sahifasi qo'yadi) — xarita maydoni shaffof; boshqaruvda rasm maydon ichida
  const wall = fullBg;

  return (
    <div
      className={`flex flex-col gap-2 ${wall ? 'h-full rounded-3xl border border-white/15 bg-slate-900/20 p-3 md:p-4 shadow-[0_10px_40px_rgba(0,0,0,.25)]' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!editing && title && (
          <h2 className={`mr-auto text-[18px] font-black tracking-tightest tabular-nums ${wall ? 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]' : 'text-ink'}`}>{title}</h2>
        )}
        {editing ? (
          <>
            <span className={`mr-auto text-[13px] font-bold ${wall ? 'rounded-lg bg-surface/90 px-2.5 py-1 text-ink' : 'text-muted'}`}>{t('fp.editHint')}</span>
            <div className="flex items-center gap-1 rounded-xl border border-edge bg-surface p-1" aria-label={t('fp.autoArrange')}>
              <span className="px-2 text-[13px] font-bold text-muted">{t('fp.rows')}</span>
              <button
                type="button"
                aria-label="−"
                onClick={() => arrange(rowsWanted - 1, byColumn)}
                disabled={saving || rowsWanted <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-field text-[18px] font-black text-ink cursor-pointer disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-[28px] text-center text-[15px] font-black tabular-nums text-ink">{rowsWanted}</span>
              <button
                type="button"
                aria-label="+"
                onClick={() => arrange(rowsWanted + 1, byColumn)}
                disabled={saving || rowsWanted >= tables.length}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-field text-[18px] font-black text-ink cursor-pointer disabled:opacity-40"
              >
                +
              </button>
              <span className="mx-1 h-6 w-px bg-edge" aria-hidden />
              {([false, true] as const).map((col) => (
                <button
                  key={String(col)}
                  type="button"
                  onClick={() => arrange(rowsWanted, col)}
                  disabled={saving}
                  className={`h-8 rounded-lg px-2.5 text-[13px] font-bold cursor-pointer ${byColumn === col ? 'bg-brand text-white' : 'text-muted hover:bg-field hover:text-ink'}`}
                >
                  {col ? t('fp.byColumn') : t('fp.byRow')}
                </button>
              ))}
            </div>
            {!hall && (
              <span className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1 text-[13px] font-bold text-amber-800">
                {t('fp.noHallBg')}
                {onManageHalls && (
                  <button type="button" className="underline" onClick={onManageHalls}>
                    {t('tp.manageHalls')}
                  </button>
                )}
              </span>
            )}
            {hall && (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickBackground(e.target.files?.[0])} />
                <Button variant="outline" icon={<ImagePlus className="w-4 h-4" />} onClick={() => fileRef.current?.click()} disabled={bgBusy}>
                  {bg ? t('fp.bgChange') : t('fp.background')}
                </Button>
                {bg && (
                  <Button variant="outline" icon={<Trash2 className="w-4 h-4" />} onClick={() => void removeBackground()} disabled={bgBusy}>
                    {t('fp.bgRemove')}
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              {t('fp.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? '…' : t('fp.save')}
            </Button>
          </>
        ) : (
          <>
            {canEdit && (
              <Button variant="outline" icon={<Move className="w-4 h-4" />} onClick={() => { setLocal(saved); setEditing(true); }}>
                {t('fp.edit')}
              </Button>
            )}
            {onRefresh &&
              (wall ? (
                <button
                  type="button"
                  aria-label={t('common.refresh')}
                  title={t('common.refresh')}
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-60"
                >
                  <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              ) : (
                <Button variant="outline" aria-label={t('common.refresh')} onClick={onRefresh} disabled={refreshing}>
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              ))}
            {wall ? (
              <button
                type="button"
                aria-label={t('fp.grid')}
                title={t('fp.grid')}
                onClick={onGrid}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white backdrop-blur hover:bg-white/25"
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
            ) : (
              <Button variant="outline" icon={<LayoutGrid className="w-4 h-4" />} onClick={onGrid}>
                {t('fp.grid')}
              </Button>
            )}
          </>
        )}
      </div>

      <div
        ref={boxRef}
        onPointerMove={onPointerMove}
        className={`relative w-full rounded-2xl overflow-hidden select-none ${wall ? '' : 'border border-edge bg-[#1E293B] bg-cover bg-center'} ${
          editing ? 'ring-2 ring-brand touch-none' : ''
        }`}
        style={{
          height: wall ? 'max(420px, calc(100vh - var(--appbar-h, 56px) - var(--statusbar-h, 0px) - 100px))' : 'max(380px, calc(100vh - var(--appbar-h, 56px) - 290px))',
          backgroundImage: bg && !wall ? `url("${bg}")` : undefined,
        }}
      >
        {editing && (
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '5% 5%' }}
            aria-hidden
          />
        )}
        {/* Stullar karta chetidan chiqadi — maydon ichida qolishi uchun ichki chekka */}
        <div className="absolute" style={{ inset: INSET }}>
          {tables.map((tb) => {
            const p = pos[tb.uuid] || { x: 0, y: 0 };
            const q = editing ? null : quickAction?.(tb) || null;
            return (
              <div
                key={tb.uuid}
                className="absolute"
                style={{
                  left: `calc((100% - ${size}px) * ${p.x / 100})`,
                  top: `calc((100% - ${size}px) * ${p.y / 100})`,
                  zIndex: drag?.uuid === tb.uuid ? 20 : 1,
                }}
              >
                <button
                  type="button"
                  aria-label={t('table.n', { n: tb.table_number })}
                  onPointerDown={(e) => onPointerDown(e, tb)}
                  onPointerUp={() => onPointerUp(tb)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (editing) onMenu(tb);
                      else onOpen(tb);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    onMenu(tb);
                  }}
                  className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white rounded-xl"
                  style={{ width: size, height: size }}
                >
                  <span className="block origin-top-left" style={{ width: TILE, height: TILE, transform: scale < 1 ? `scale(${scale})` : undefined }}>
                    <PlanTile table={tb} label={labelOf(tb)} draft={drafts[tb.uuid]} now={now} editing={editing} dragging={drag?.uuid === tb.uuid} />
                  </span>
                </button>
                {q && (
                  <button
                    type="button"
                    disabled={q.busy}
                    onClick={q.run}
                    className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+12px)] whitespace-nowrap h-7 px-2.5 rounded-lg bg-white text-ink text-[12px] font-black shadow-md hover:bg-white/90 active:scale-95 transition disabled:opacity-60 cursor-pointer"
                  >
                    {q.busy ? '…' : q.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
