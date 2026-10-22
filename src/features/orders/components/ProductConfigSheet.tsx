import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, QtyStepper, Sheet } from '../../../core/ui';
import { formatMoney } from '../../../core/lib/format';

/** Kassa (POS) uchun mahsulot sozlamasi: variantlar (sous, o'lcham), qadoq (quti) va kg miqdori. */
export interface PosOption {
  uuid: string;
  name: string;
  price_delta: number;
  is_available: boolean;
}

export interface PosOptionGroup {
  uuid: string;
  name: string;
  min_select: number;
  max_select: number;
  options: PosOption[];
}

export interface PosPackaging {
  uuid: string;
  name: string;
  multiplier: number;
  price: number;
}

export interface PosProduct {
  uuid: string;
  name: string;
  price: number;
  unit?: 'PIECE' | 'KG';
  step?: number;
  min_quantity?: number;
  option_groups?: PosOptionGroup[];
  packagings?: PosPackaging[];
}

export interface SelectedOption {
  uuid: string;
  name: string;
  group: string;
  price_delta: number;
}

export interface LineConfig {
  options: SelectedOption[];
  packaging: PosPackaging | null;
  quantity: number;
}

export const isConfigurable = (p: PosProduct) =>
  (p.option_groups?.length ?? 0) > 0 || (p.packagings?.length ?? 0) > 0 || p.unit === 'KG';

/** Savat qatori identifikatori: bir xil mahsulot turli variant/qadoq bilan alohida qator bo'ladi */
export const lineKey = (productUuid: string, options: SelectedOption[] = [], packaging?: PosPackaging | null) =>
  [productUuid, options.map((o) => o.uuid).sort().join(','), packaging?.uuid ?? ''].join('|');

/** 1 birlik (yoki 1 qadoq) taxminiy narxi; server narxni o'zi qayta hisoblaydi */
export const unitPrice = (product: Pick<PosProduct, 'price'>, options: SelectedOption[] = [], packaging?: PosPackaging | null) =>
  (packaging ? packaging.price : product.price) + options.reduce((s, o) => s + o.price_delta, 0);

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export const ProductConfigSheet: React.FC<{
  product: PosProduct | null;
  onClose: () => void;
  onConfirm: (cfg: LineConfig) => void;
}> = ({ product, onClose, onConfirm }) => {
  if (!product) return null;
  // `key` bilan qayta yaratiladi: har bir mahsulot uchun toza holat
  return <Inner key={product.uuid} product={product} onClose={onClose} onConfirm={onConfirm} />;
};

const Inner: React.FC<{ product: PosProduct; onClose: () => void; onConfirm: (cfg: LineConfig) => void }> = ({ product, onClose, onConfirm }) => {
  const groups = product.option_groups ?? [];
  const packs = product.packagings ?? [];
  const kg = product.unit === 'KG';
  const step = product.step && product.step > 0 ? product.step : kg ? 0.1 : 1;
  const minQty = product.min_quantity && product.min_quantity > 0 ? product.min_quantity : step;

  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g.uuid, g.min_select > 0 && g.max_select === 1 ? [g.options.find((o) => o.is_available)?.uuid].filter(Boolean) as string[] : []])),
  );
  const [pack, setPack] = useState<PosPackaging | null>(null);
  const [qty, setQty] = useState(kg ? String(minQty) : '1');

  const toggle = (g: PosOptionGroup, o: PosOption) =>
    setPicked((prev) => {
      const cur = prev[g.uuid] ?? [];
      if (g.max_select === 1) return { ...prev, [g.uuid]: cur.includes(o.uuid) && g.min_select === 0 ? [] : [o.uuid] };
      if (cur.includes(o.uuid)) return { ...prev, [g.uuid]: cur.filter((x) => x !== o.uuid) };
      return cur.length >= g.max_select ? prev : { ...prev, [g.uuid]: [...cur, o.uuid] };
    });

  const options: SelectedOption[] = useMemo(
    () => groups.flatMap((g) => g.options.filter((o) => picked[g.uuid]?.includes(o.uuid)).map((o) => ({ uuid: o.uuid, name: o.name, group: g.name, price_delta: o.price_delta }))),
    [groups, picked],
  );

  const missing = groups.find((g) => (picked[g.uuid]?.length ?? 0) < g.min_select);
  const q = Number(qty.replace(',', '.'));
  const weighed = kg && !pack;
  const qtyError = !(q > 0)
    ? 'Miqdorni kiriting'
    : weighed && q < minQty - 1e-6
      ? `Kamida ${minQty} kg`
      : weighed && !eq(Math.round(q / step) * step, q)
        ? `Miqdor ${step} kg ga karrali bo'lsin`
        : !weighed && !Number.isInteger(q)
          ? 'Butun son kiriting'
          : null;
  const total = unitPrice(product, options, pack) * (q > 0 ? q : 0);
  const canAdd = !missing && !qtyError;

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.name}
      subtitle={formatMoney(product.price)}
      footer={
        <Button size="lg" block disabled={!canAdd} onClick={() => onConfirm({ options, packaging: pack, quantity: q })}>
          Savatga qo'shish · {formatMoney(total)}
        </Button>
      }
    >
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.uuid}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[15px] font-extrabold text-ink">{g.name}</h3>
              <span className="text-[12px] text-muted">
                {g.min_select > 0 ? `Majburiy · ${g.min_select === g.max_select ? g.min_select : `${g.min_select}–${g.max_select}`} ta` : `Ixtiyoriy · ko'pi bilan ${g.max_select} ta`}
              </span>
            </div>
            <div className="space-y-1.5">
              {g.options.map((o) => {
                const on = picked[g.uuid]?.includes(o.uuid);
                return (
                  <button
                    key={o.uuid}
                    type="button"
                    disabled={!o.is_available}
                    onClick={() => toggle(g, o)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 min-h-[48px] text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      on ? 'border-brand bg-brand-soft' : 'border-edge bg-surface hover:bg-field'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-5 h-5 shrink-0 flex items-center justify-center border-2 ${g.max_select === 1 ? 'rounded-full' : 'rounded-md'} ${on ? 'bg-brand border-brand text-white' : 'border-edge-strong'}`}>
                        {on && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-[14px] font-semibold text-ink truncate">{o.name}{!o.is_available && ' (tugagan)'}</span>
                    </span>
                    {o.price_delta > 0 && <span className="text-[13px] font-bold text-muted shrink-0">+{formatMoney(o.price_delta)}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {packs.length > 0 && (
          <section>
            <h3 className="text-[15px] font-extrabold text-ink mb-2">Birlik</h3>
            <div className="flex flex-wrap gap-2">
              {[null, ...packs].map((p) => {
                const on = (pack?.uuid ?? null) === (p?.uuid ?? null);
                return (
                  <button
                    key={p?.uuid ?? 'single'}
                    type="button"
                    onClick={() => {
                      setPack(p);
                      setQty(p ? '1' : kg ? String(minQty) : '1');
                    }}
                    className={`h-11 px-4 rounded-xl border text-[14px] font-bold cursor-pointer ${on ? 'border-brand bg-brand-soft text-brand' : 'border-edge bg-surface text-ink hover:bg-field'}`}
                  >
                    {p ? `${p.name} (${p.multiplier}${kg ? ' kg' : ' dona'}) · ${formatMoney(p.price)}` : kg ? 'Kg' : 'Dona'}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-[15px] font-extrabold text-ink mb-2">{weighed ? 'Og‘irligi (kg)' : pack ? `${pack.name} soni` : 'Soni'}</h3>
          {weighed ? (
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full h-12 rounded-xl bg-field px-4 text-[16px] font-bold tabular-nums outline-none focus:ring-2 focus:ring-brand/30"
              aria-label="Og'irligi"
            />
          ) : (
            <QtyStepper value={Number(qty) || 1} min={1} onChange={(v) => setQty(String(v))} />
          )}
          {qtyError && <p className="mt-1.5 text-[12px] font-medium text-danger-ink">{qtyError}</p>}
          {missing && <p className="mt-1.5 text-[12px] font-medium text-danger-ink">«{missing.name}» tanlanishi shart</p>}
          <p className="mt-1.5 text-[12px] text-muted">Narx taxminiy — aksiya va yakuniy summani server hisoblaydi.</p>
        </section>
      </div>
    </Sheet>
  );
};
