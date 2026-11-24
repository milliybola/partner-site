import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, LayoutGrid, Move, QrCode, Trash2, Users } from 'lucide-react';
import { tablesApi } from '../services/tablesApi';
import type { Hall, TableModel, TablePosition } from '../services/tablesApi';
import type { TableDraft } from '../lib/tableDrafts';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, minutesSince } from '../../../core/lib/format';
import { Button } from '../../../core/ui';
import { t } from '../../../core/i18n';
import { setPosWallpaper } from '../../../core/lib/posWallpaper';

/**
 * Kassadagi zal xaritasi (InOne/YesPOS uslubida): stollar atrofida stullar bilan, zal rejasidagi joyida.
 * Yashil — bo'sh, qizil — band, sariq — QR tasdiq kutmoqda, ko'k — tayyor. Joylar serverda foizda saqlanadi,
 * shuning uchun har qanday ekranda bir xil ko'rinadi. Hali joylashtirilmagan stol tartib raqami bo'yicha
 * avtomatik to'rga qo'yiladi. Ega/menejer «Joylashtirish» rejimida stollarni sudraydi va fon rasmini qo'yadi.
 */

type Pos = { x: number; y: number };

/** Stol kartasining o'lchami (px) — joy (0–100%) kartaning chap-yuqori burchagi uchun «maydon − karta» ichida */
const TILE = 92;

/** Joylashtirilmagan stollar uchun avtomatik to'r: ustunlar soni ekran nisbatiga yaqin */
const autoPositions = (tables: TableModel[]): Record<string, Pos> => {
  const n = tables.length;
  if (!n) return {};
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out: Record<string, Pos> = {};
  tables.forEach((tb, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
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
  const place = {
    top: 'left-0 right-0 -top-[9px] flex-row',
    bottom: 'left-0 right-0 -bottom-[9px] flex-row',
    left: 'top-0 bottom-0 -left-[9px] flex-col',
    right: 'top-0 bottom-0 -right-[9px] flex-col',
  }[dir];
  return (
    <span className={`absolute ${place} flex items-center justify-center gap-1.5 pointer-events-none`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={`${cls} rounded-[3px] opacity-90 ${horizontal ? 'w-5 h-[7px]' : 'w-[7px] h-5'}`} />
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
        <span className="text-[19px] font-black leading-none tracking-tightest max-w-full truncate">{label}</span>
        {o ? (
          <>
            <span className="text-[12px] font-black tabular-nums leading-tight">{formatMoney(o.total_price)}</span>
            <span className="text-[10px] font-bold opacity-90 leading-tight max-w-full truncate inline-flex items-center gap-0.5">
              {o.order_source === 'QR' && <QrCode className="w-3 h-3 shrink-0" />}
              {who}
              {mins !== null && <span className={mins >= 60 ? 'underline' : ''}>· {mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : `${mins}′`}</span>}
            </span>
          </>
        ) : draft ? (
          <span className="text-[12px] font-black tabular-nums leading-tight">{formatMoney(draft.subtotal)}</span>
        ) : kind === 'reserved' ? (
          <span className="text-[10px] font-bold opacity-90">{t('tp.reserved')}</span>
        ) : kind === 'inactive' ? (
          <span className="text-[10px] font-bold">{t('tp.inactive')}</span>
        ) : (
          <span className="text-[10px] font-bold opacity-85 inline-flex items-center gap-0.5">
            <Users className="w-3 h-3" /> {table.capacity}
          </span>
        )}
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
  /** Kassa: fon butun ekranga yoyiladi (Layout); boshqaruvda — xarita maydoni ichida */
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
}> = ({ title, tables, hall, drafts, now, canEdit, onManageHalls, fullBg = false, labelOf, onOpen, onMenu, onSaved, quickAction, onGrid }) => {
  const toast = useToast();
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = useMemo(() => positionsOf(tables), [tables]);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<Record<string, Pos>>(saved);
  const [drag, setDrag] = useState<{ uuid: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);

  // Tahrirda — qo'lda surilgan joylar (server yangilanishi ularni bosib ketmaydi; yangi kelgan stol — saqlangan joyida).
  // Boshqa zalga o'tilsa komponent qayta yaratiladi (key = zal), tahrir o'z-o'zidan bekor bo'ladi.
  const pos: Record<string, Pos> = editing ? { ...saved, ...local } : saved;

  const toPct = (clientX: number, clientY: number, dx: number, dy: number): Pos | null => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return null;
    const w = Math.max(1, box.width - TILE);
    const h = Math.max(1, box.height - TILE);
    const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
    return { x: clamp(((clientX - box.left - dx) / w) * 100), y: clamp(((clientY - box.top - dy) / h) * 100) };
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
  // Fon rasmi butun kassa ekraniga yoyiladi (Layout), xarita maydoni esa shaffof
  useEffect(() => {
    if (!fullBg) return;
    setPosWallpaper(bg);
    return () => setPosWallpaper(null);
  }, [bg, fullBg]);
  // Ekran foni bo'lsa maydon shaffof; boshqaruvda rasm maydon ichida ko'rinadi
  const wall = !!bg && fullBg;

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
            <Button variant="outline" onClick={() => setLocal(autoPositions(tables))} disabled={saving}>
              {t('fp.autoArrange')}
            </Button>
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
          height: wall ? 'max(420px, calc(100vh - var(--appbar-h, 56px) - 250px))' : 'max(440px, calc(100vh - var(--appbar-h, 56px) - 210px))',
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
        <div className="absolute inset-3">
          {tables.map((tb) => {
            const p = pos[tb.uuid] || { x: 0, y: 0 };
            const q = editing ? null : quickAction?.(tb) || null;
            return (
              <div
                key={tb.uuid}
                className="absolute"
                style={{
                  left: `calc((100% - ${TILE}px) * ${p.x / 100})`,
                  top: `calc((100% - ${TILE}px) * ${p.y / 100})`,
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
                >
                  <PlanTile table={tb} label={labelOf(tb)} draft={drafts[tb.uuid]} now={now} editing={editing} dragging={drag?.uuid === tb.uuid} />
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
