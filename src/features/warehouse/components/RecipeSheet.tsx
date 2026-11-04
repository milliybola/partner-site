import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, InlineAlert, Input, LoadingState, Select, Sheet } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { parseNum, UNIT_LABEL, warehouseApi } from '../warehouseApi';
import type { Ingredient, RecipeDetail, RecipeSummary } from '../warehouseApi';

interface Line {
  key: number;
  ingredient: string;
  quantity: string;
}

let seq = 0;

/** Taomning texkartasi: 1 porsiyaga ketadigan xom ashyolar → tannarx va foyda (narxdan %). */
export const RecipeSheet: React.FC<{
  product: RecipeSummary;
  ingredients: Ingredient[];
  onClose: () => void;
  onSaved: () => void;
  onAddIngredient: () => void;
}> = ({ product, ingredients, onClose, onSaved, onAddIngredient }) => {
  const toast = useToast();
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byUuid = useMemo(() => new Map(ingredients.map((i) => [i.uuid, i])), [ingredients]);

  useEffect(() => {
    let alive = true;
    warehouseApi
      .recipe(product.uuid)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        // Setning o'z texkartasi yo'q bo'lsa, tarkib taomlariniki ko'rsatiladi — tahrirlashda bo'sh boshlanadi
        setLines(d.from_set ? [] : d.items.map((it) => ({ key: ++seq, ingredient: it.ingredient.uuid, quantity: String(it.quantity) })));
      })
      .catch((err) => alive && setError(getErrorMessage(err, "Texkartani yuklab bo'lmadi.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [product.uuid]);

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.ingredient));

  const rows = lines.map((l) => {
    const ing = byUuid.get(l.ingredient);
    const q = parseNum(l.quantity);
    const bad = l.quantity.trim() !== '' && (!Number.isFinite(q) || q <= 0 || (ing?.unit === 'PIECE' && !Number.isInteger(q)));
    return { l, ing, q, bad, cost: ing && Number.isFinite(q) && q > 0 ? q * ing.cost_price : 0 };
  });
  const valid = rows.filter((r) => r.ing && !r.bad && r.q > 0);
  const invalid = rows.some((r) => r.bad || (r.ing && r.l.quantity.trim() === ''));
  const cost = Math.round(valid.reduce((s, r) => s + r.cost, 0));
  const price = product.price;
  const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  const foodCost = price > 0 && cost > 0 ? Math.round((cost / price) * 1000) / 10 : null;

  const submit = async () => {
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseApi.saveRecipe(product.uuid, valid.map((r) => ({ ingredient: r.l.ingredient, quantity: r.q })));
      toast.success('Texkarta saqlandi');
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Texkartani saqlab bo'lmadi."));
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
      title={product.name}
      subtitle={`Texkarta · 1 porsiya · narxi ${formatMoney(price)}`}
      footer={
        <Button size="lg" block loading={saving} disabled={loading || invalid} onClick={submit}>
          Saqlash
        </Button>
      }
    >
      {loading ? (
        <LoadingState className="min-h-[30vh]" />
      ) : (
        <div className="space-y-4">
          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-field p-3">
              <div className="text-[12px] text-muted">Tannarx</div>
              <div className="text-[18px] font-black text-ink tabular-nums">{formatMoney(cost)}</div>
            </div>
            <div className="rounded-2xl bg-field p-3">
              <div className="text-[12px] text-muted">Foyda</div>
              <div className={`text-[18px] font-black tabular-nums ${margin !== null && margin < 50 ? 'text-warning-ink' : 'text-brand-dark'}`}>
                {margin !== null ? `${margin}%` : '—'}
              </div>
            </div>
            <div className="rounded-2xl bg-field p-3">
              <div className="text-[12px] text-muted">Food cost</div>
              <div className="text-[18px] font-black text-ink tabular-nums">{foodCost !== null ? `${foodCost}%` : '—'}</div>
            </div>
          </div>

          {detail?.from_set && (
            <InlineAlert tone="info">
              Bu set o'z texkartasiga ega emas — sotilganda tarkibidagi taomlarning texkartasi bo'yicha hisoblanadi
              ({formatMoney(detail.cost)}). O'z texkartasini kiritsangiz, u ustun bo'ladi.
            </InlineAlert>
          )}

          {ingredients.length === 0 ? (
            <InlineAlert tone="warning">
              Xom ashyo hali yo'q.{' '}
              <button type="button" className="font-bold underline cursor-pointer" onClick={onAddIngredient}>
                Xom ashyo qo'shish
              </button>
            </InlineAlert>
          ) : (
            <>
              <ul className="space-y-2">
                {rows.map(({ l, ing, bad, cost: c }) => (
                  <li key={l.key} className="flex flex-wrap items-start gap-2 rounded-2xl border border-edge bg-surface p-3">
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
                      aria-label="Miqdor"
                      containerClassName="flex-1 min-w-[110px]"
                      inputMode="decimal"
                      placeholder={ing ? (ing.unit === 'PIECE' ? '1' : `0.150 ${UNIT_LABEL[ing.unit]}`) : 'Miqdor'}
                      value={l.quantity}
                      onChange={(e) => set(l.key, { quantity: e.target.value })}
                      error={bad ? (ing?.unit === 'PIECE' ? 'Butun son' : "To'g'ri son") : null}
                    />
                    <div className="w-24 h-11 flex items-center justify-end text-[13px] font-bold text-muted tabular-nums">
                      {c > 0 ? formatMoney(Math.round(c)) : ''}
                    </div>
                    <IconButton label="Olib tashlash" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {lines.length < ingredients.length && (
                  <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setLines((ls) => [...ls, { key: ++seq, ingredient: '', quantity: '' }])}>
                    Xom ashyo qo'shish
                  </Button>
                )}
                <Button variant="ghost" onClick={onAddIngredient}>Yangi xom ashyo yaratish</Button>
              </div>
              <p className="text-[12px] text-muted">
                Miqdor xom ashyo birligida: 150 g go'sht = <b>0.150</b> kg. Taom sotilib, buyurtma yakunlanganda omborda shuncha ayiriladi.
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
};
