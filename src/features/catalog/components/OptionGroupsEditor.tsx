import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Switch } from '../../../core/ui';
import type { OptionGroupInput } from '../services/catalogApi';

/** Forma holati: raqamlar matn sifatida (kiritish paytida bo'sh qolishi mumkin) */
export interface OptionRow {
  key: string;
  uuid?: string;
  name: string;
  price: string;
  available: boolean;
}

export interface GroupRow {
  key: string;
  uuid?: string;
  name: string;
  min: string;
  max: string;
  active: boolean;
  options: OptionRow[];
}

let seq = 0;
export const newKey = () => `og${++seq}`;

export const emptyGroup = (): GroupRow => ({
  key: newKey(), name: '', min: '0', max: '1', active: true,
  options: [{ key: newKey(), name: '', price: '0', available: true }],
});

export const groupsToRows = (groups: OptionGroupInput[] = []): GroupRow[] =>
  groups.map((g) => ({
    key: newKey(), uuid: g.uuid, name: g.name, min: String(g.min_select), max: String(g.max_select), active: g.is_active,
    options: g.options.map((o) => ({ key: newKey(), uuid: o.uuid, name: o.name, price: String(o.price_delta), available: o.is_available })),
  }));

export const rowsToGroups = (rows: GroupRow[]): OptionGroupInput[] =>
  rows.map((g, gi) => ({
    uuid: g.uuid, name: g.name.trim(), min_select: Number(g.min), max_select: Number(g.max), is_active: g.active, order: gi,
    options: g.options.map((o, oi) => ({
      uuid: o.uuid, name: o.name.trim(), price_delta: Math.round(Number(o.price) || 0), is_available: o.available, order: oi,
    })),
  }));

/** Birinchi xatoni qaytaradi (yo'q bo'lsa `null`) — backend qoidalari bilan bir xil. */
export const validateGroups = (rows: GroupRow[]): string | null => {
  for (const [i, g] of rows.entries()) {
    const label = `${i + 1}-guruh`;
    const min = Number(g.min);
    const max = Number(g.max);
    const named = g.options.filter((o) => o.name.trim());
    if (!g.name.trim()) return `${label}: nomini kiriting (masalan «Sous»)`;
    if (!Number.isInteger(min) || min < 0) return `${label}: eng kam tanlov 0 yoki butun son`;
    if (!Number.isInteger(max) || max < 1) return `${label}: eng ko'p tanlov kamida 1`;
    if (min > max) return `${label}: eng kam tanlov eng ko'pdan katta bo'lishi mumkin emas`;
    if (named.length === 0) return `${label}: kamida bitta variant kiriting`;
    if (g.options.some((o) => !o.name.trim())) return `${label}: nomsiz variant bor`;
    if (min > named.length) return `${label}: variantlar soni eng kam tanlovdan kam`;
    if (g.options.some((o) => !(Number(o.price) >= 0))) return `${label}: variant narxi 0 yoki undan katta bo'lishi kerak`;
  }
  return null;
};

/** Mahsulot variantlari: sous, o'lcham, qo'shimchalar. Mijoz buyurtmada shulardan tanlaydi, narx o'zgaradi. */
export const OptionGroupsEditor: React.FC<{
  rows: GroupRow[];
  onChange: (rows: GroupRow[]) => void;
  error?: string;
}> = ({ rows, onChange, error }) => {
  const patchGroup = (key: string, patch: Partial<GroupRow>) => onChange(rows.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const patchOption = (gk: string, ok: string, patch: Partial<OptionRow>) =>
    onChange(rows.map((g) => (g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g)));

  return (
    <div className="rounded-2xl border border-edge p-4 space-y-3">
      <div>
        <h3 className="text-[14px] font-extrabold text-ink">Variantlar va qo'shimchalar</h3>
        <p className="text-[12px] text-muted mt-0.5">Masalan «Sous» (1 ta tanlanadi) yoki «Qo'shimcha» (bir nechta, narxi bilan). Ixtiyoriy.</p>
      </div>

      {rows.map((g, gi) => (
        <div key={g.key} className="rounded-xl bg-field p-3 space-y-3">
          <div className="flex items-end gap-2">
            <Input containerClassName="flex-1" label={`${gi + 1}-guruh nomi`} value={g.name} onChange={(e) => patchGroup(g.key, { name: e.target.value })} placeholder="Sous" />
            <button
              type="button"
              aria-label="Guruhni o'chirish"
              onClick={() => onChange(rows.filter((x) => x.key !== g.key))}
              className="h-11 w-11 flex items-center justify-center rounded-xl text-danger-ink hover:bg-danger-soft cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Eng kam tanlov" type="number" inputMode="numeric" min={0} value={g.min} onChange={(e) => patchGroup(g.key, { min: e.target.value })} hint="0 — ixtiyoriy" />
            <Input label="Eng ko'p tanlov" type="number" inputMode="numeric" min={1} value={g.max} onChange={(e) => patchGroup(g.key, { max: e.target.value })} />
          </div>

          <div className="space-y-2">
            {g.options.map((o) => (
              <div key={o.key} className="flex items-end gap-2">
                <Input containerClassName="flex-1" label="Variant" value={o.name} onChange={(e) => patchOption(g.key, o.key, { name: e.target.value })} placeholder="Achchiq" />
                <Input containerClassName="w-28" label="+ narx" type="number" inputMode="numeric" min={0} value={o.price} onChange={(e) => patchOption(g.key, o.key, { price: e.target.value })} />
                <div className="h-11 flex items-center"><Switch size="sm" checked={o.available} onChange={(v) => patchOption(g.key, o.key, { available: v })} label="Mavjud" /></div>
                <button
                  type="button"
                  aria-label="Variantni o'chirish"
                  onClick={() => patchGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                  className="h-11 w-10 flex items-center justify-center rounded-xl text-danger-ink hover:bg-danger-soft cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => patchGroup(g.key, { options: [...g.options, { key: newKey(), name: '', price: '0', available: true }] })}
            >
              Variant qo'shish
            </Button>
          </div>
        </div>
      ))}

      {error && <p className="text-[12px] font-medium text-danger-ink">{error}</p>}
      <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => onChange([...rows, emptyGroup()])}>
        Guruh qo'shish
      </Button>
    </div>
  );
};
