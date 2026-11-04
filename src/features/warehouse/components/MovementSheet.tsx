import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, InlineAlert, Input, Select, Sheet } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatQty, parseNum, UNIT_LABEL, warehouseApi } from '../warehouseApi';
import type { Ingredient, ManualKind } from '../warehouseApi';

const META: Record<ManualKind, { title: string; subtitle: string; qty: string; save: string }> = {
  PURCHASE: {
    title: 'Kirim',
    subtitle: "Yetkazib beruvchidan kelgan xom ashyo — qoldiqqa qo'shiladi, tannarx yangilanadi",
    qty: 'Miqdor',
    save: 'Kirimni saqlash',
  },
  WRITE_OFF: {
    title: 'Hisobdan chiqarish',
    subtitle: "Buzilgan, to'kilgan yoki xodim ovqatiga ketgan — qoldiqdan ayiriladi",
    qty: 'Miqdor',
    save: 'Hisobdan chiqarish',
  },
  COUNT: {
    title: 'Inventarizatsiya',
    subtitle: 'Omborda sanab chiqilgan haqiqiy qoldiqni kiriting — farq avtomatik yoziladi',
    qty: 'Haqiqiy qoldiq',
    save: 'Natijani saqlash',
  },
};

interface Line {
  key: number;
  ingredient: string;
  quantity: string;
  cost: string;
}

let seq = 0;
const blank = (ingredient = ''): Line => ({ key: ++seq, ingredient, quantity: '', cost: '' });

/** Bir nechta xom ashyo bo'yicha bitta hujjat: kirim / hisobdan chiqarish / inventarizatsiya. */
export const MovementSheet: React.FC<{
  kind: ManualKind;
  ingredients: Ingredient[];
  preselect?: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ kind, ingredients, preselect, onClose, onSaved }) => {
  const toast = useToast();
  const meta = META[kind];
  const byUuid = useMemo(() => new Map(ingredients.map((i) => [i.uuid, i])), [ingredients]);
  const [lines, setLines] = useState<Line[]>(() =>
    kind === 'COUNT' && !preselect ? ingredients.map((i) => blank(i.uuid)) : [blank(preselect?.uuid || '')],
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const lineError = (l: Line): string | null => {
    const ing = byUuid.get(l.ingredient);
    if (!ing || l.quantity.trim() === '') return null;
    const q = parseNum(l.quantity);
    if (!Number.isFinite(q) || q < 0 || (kind !== 'COUNT' && q === 0)) return "To'g'ri son kiriting";
    if (ing.unit === 'PIECE' && !Number.isInteger(q)) return 'Dona — butun son';
    return null;
  };

  // Inventarizatsiyada bo'sh qoldirilgan qatorlar — sanalmagan, yuborilmaydi
  const filled = lines.filter((l) => byUuid.has(l.ingredient) && l.quantity.trim() !== '');
  const hasErrors = filled.some((l) => lineError(l)) || filled.some((l) => kind === 'PURCHASE' && l.cost.trim() && !(parseNum(l.cost) >= 0));
  const total = kind === 'PURCHASE' ? filled.reduce((s, l) => s + (parseNum(l.quantity) || 0) * (parseNum(l.cost) || 0), 0) : 0;
  const used = new Set(lines.map((l) => l.ingredient));

  const submit = async () => {
    if (!filled.length || hasErrors) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseApi.createMovement({
        kind,
        note: note.trim() || undefined,
        items: filled.map((l) => ({
          ingredient: l.ingredient,
          quantity: parseNum(l.quantity),
          ...(kind === 'PURCHASE' && l.cost.trim() ? { unit_cost: parseNum(l.cost) } : {}),
        })),
      });
      toast.success(`${meta.title} saqlandi`);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Saqlab bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      size="lg"
      onClose={onClose}
      persistent={saving}
      title={meta.title}
      subtitle={meta.subtitle}
      footer={
        <div className="w-full flex flex-wrap items-center gap-3">
          {kind === 'PURCHASE' && total > 0 && (
            <div className="text-[14px] text-muted">
              Jami: <b className="text-ink tabular-nums">{formatMoney(Math.round(total))}</b>
            </div>
          )}
          <Button size="lg" className="ml-auto min-w-[180px]" loading={saving} disabled={!filled.length || hasErrors} onClick={submit}>
            {meta.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        {ingredients.length === 0 && <InlineAlert tone="info">Avval «Xom ashyo» bo'limida xom ashyo qo'shing.</InlineAlert>}

        <ul className="space-y-2">
          {lines.map((l) => {
            const ing = byUuid.get(l.ingredient);
            const u = ing ? UNIT_LABEL[ing.unit] : '';
            const err = lineError(l);
            const q = parseNum(l.quantity);
            const diff = kind === 'COUNT' && ing && Number.isFinite(q) ? q - ing.quantity : null;
            return (
              <li key={l.key} className="rounded-2xl border border-edge bg-surface p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <Select
                    aria-label="Xom ashyo"
                    containerClassName="flex-[2] min-w-[180px]"
                    value={l.ingredient}
                    onChange={(e) => set(l.key, { ingredient: e.target.value })}
                  >
                    <option value="">Xom ashyoni tanlang</option>
                    {ingredients
                      .filter((i) => i.uuid === l.ingredient || !used.has(i.uuid))
                      .map((i) => (
                        <option key={i.uuid} value={i.uuid}>{i.name} ({UNIT_LABEL[i.unit]})</option>
                      ))}
                  </Select>
                  <Input
                    aria-label={meta.qty}
                    containerClassName="flex-1 min-w-[110px]"
                    inputMode="decimal"
                    placeholder={kind === 'COUNT' && ing ? String(Number(ing.quantity.toFixed(3))) : `${meta.qty}${u ? `, ${u}` : ''}`}
                    value={l.quantity}
                    onChange={(e) => set(l.key, { quantity: e.target.value })}
                    error={err}
                  />
                  {kind === 'PURCHASE' && (
                    <Input
                      aria-label="Narx"
                      containerClassName="flex-1 min-w-[130px]"
                      inputMode="decimal"
                      placeholder={ing ? `1 ${u} narxi` : 'Narx'}
                      value={l.cost}
                      onChange={(e) => set(l.key, { cost: e.target.value })}
                    />
                  )}
                  {lines.length > 1 && (
                    <IconButton label="Olib tashlash" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  )}
                </div>
                {ing && (
                  <div className="mt-1.5 text-[12px] text-muted flex flex-wrap gap-x-3">
                    <span>Hozir: <b className="text-ink">{formatQty(ing.quantity, ing.unit)}</b></span>
                    {kind === 'PURCHASE' && ing.cost_price > 0 && <span>Oxirgi narx: {formatMoney(ing.cost_price)} / {u}</span>}
                    {diff !== null && diff !== 0 && (
                      <span className={diff < 0 ? 'text-danger-ink font-bold' : 'text-brand-dark font-bold'}>
                        Farq: {diff > 0 ? '+' : ''}{formatQty(diff, ing.unit)}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {lines.length < ingredients.length && (
          <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setLines((ls) => [...ls, blank()])}>
            Qator qo'shish
          </Button>
        )}

        <Input
          label="Izoh"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'PURCHASE' ? "Yetkazib beruvchi, nakladnoy raqami" : kind === 'WRITE_OFF' ? 'Sabab: buzilgan, to‘kilgan...' : 'Masalan: oy oxiri sanog‘i'}
        />
      </div>
    </Sheet>
  );
};
