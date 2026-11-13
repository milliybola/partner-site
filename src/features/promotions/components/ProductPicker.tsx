import React, { useMemo, useState } from 'react';
import { Check, ImageOff } from 'lucide-react';
import { EmptyState, ErrorState, QtyStepper, SearchInput, SkeletonList } from '../../../core/ui';
import { formatMoney } from '../../../core/lib/format';
import type { CatalogProduct } from '../services/promotionsApi';

/**
 * Searchable product list grouped by category.
 *  - mode "quantity": each product has a QtyStepper (set composition)
 *  - mode "select":   checkbox multi-select (promotion targets)
 */
export const ProductPicker: React.FC<{
  products: CatalogProduct[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  mode: 'quantity' | 'select';
  quantities?: Record<string, number>;
  onQuantityChange?: (uuid: string, qty: number) => void;
  selected?: string[];
  onToggle?: (uuid: string) => void;
  productWord: string;
}> = ({ products, loading, error, onRetry, mode, quantities = {}, onQuantityChange, selected = [], onToggle, productWord }) => {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? products.filter((p) => p.name.toLowerCase().includes(needle) || p.categoryName.toLowerCase().includes(needle))
      : products;
    const map = new Map<string, CatalogProduct[]>();
    filtered.forEach((p) => {
      const k = p.categoryName || 'Boshqa';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return Array.from(map.entries());
  }, [products, q]);

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} className="py-6" />;
  if (products.length === 0)
    return <EmptyState title={`${productWord}lar topilmadi`} description="Avval Menyu bo'limida mahsulot qo'shing." className="py-6" />;

  return (
    <div className="space-y-3">
      <SearchInput value={q} onChange={setQ} placeholder={`${productWord} qidirish...`} />
      {groups.length === 0 && <p className="text-[14px] text-muted text-center py-4">Hech narsa topilmadi</p>}
      <div className="space-y-4">
        {groups.map(([cat, items]) => (
          <div key={cat}>
            <div className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-1.5">{cat}</div>
            <div className="border border-edge rounded-2xl divide-y divide-edge overflow-hidden">
              {items.map((p) => {
                const qty = quantities[p.uuid] || 0;
                const isSel = selected.includes(p.uuid);
                const active = mode === 'quantity' ? qty > 0 : isSel;
                const body = (
                  <>
                    {p.image ? (
                      <img src={p.image} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 bg-field" />
                    ) : (
                      <span className="w-11 h-11 rounded-xl bg-field text-subtle flex items-center justify-center shrink-0">
                        <ImageOff className="w-4 h-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[14px] font-semibold text-ink truncate">{p.name}</div>
                      <div className="text-[13px] text-muted">
                        {(() => {
                          // Variantli: narx oralig'i (majburiy guruhlar bo'yicha) — «65 000» chalg'itmasin
                          const req = (p.option_groups ?? []).filter((g) => g.required);
                          const min = p.price + req.reduce((s, g) => s + Math.min(...g.options.map((o) => o.price_delta)), 0);
                          const max = p.price + req.reduce((s, g) => s + Math.max(...g.options.map((o) => o.price_delta)), 0);
                          return max > min ? `${formatMoney(min, false)} – ${formatMoney(max)}` : formatMoney(p.price);
                        })()}
                        {!p.is_available && <span className="ml-1.5 text-warning-ink">· mavjud emas</span>}
                      </div>
                    </div>
                  </>
                );
                if (mode === 'quantity') {
                  return (
                    <div key={p.uuid} className={`flex items-center gap-3 px-3 py-2 ${active ? 'bg-brand-soft/50' : 'bg-surface'}`}>
                      {body}
                      <QtyStepper size="sm" value={qty} onChange={(v) => onQuantityChange?.(p.uuid, v)} max={99} />
                    </div>
                  );
                }
                const groups = p.option_groups ?? [];
                return (
                  <div key={p.uuid} className={active ? 'bg-brand-soft/50' : 'bg-surface'}>
                    <button
                      type="button"
                      onClick={() => onToggle?.(p.uuid)}
                      aria-pressed={isSel}
                      className={`w-full flex items-center gap-3 px-3 py-2 min-h-[56px] cursor-pointer bg-transparent ${active ? '' : 'hover:bg-surface2'}`}
                    >
                      {body}
                      <span
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                          isSel ? 'bg-brand border-brand text-white' : 'border-edge-strong'
                        }`}
                      >
                        {isSel && <Check className="w-4 h-4" />}
                      </span>
                    </button>
                    {/* Variantlar daraxti: aksiya mahsulotga — uning BARCHA variantlariga amal qiladi */}
                    {groups.length > 0 && (
                      <div className="pl-[68px] pr-3 pb-2.5 -mt-1">
                        {groups.map((g) => (
                          <div key={g.name} className="mt-1">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{g.name}</div>
                            <ul className="mt-0.5 border-l-2 border-edge ml-1">
                              {g.options.map((o) => (
                                <li key={o.name} className="relative flex items-center gap-2 pl-3 py-[3px] text-[13px]">
                                  <span className="absolute left-0 top-1/2 w-2 border-t-2 border-edge" aria-hidden />
                                  <span className={`flex-1 truncate ${o.is_available ? 'text-ink' : 'text-subtle line-through'}`}>{o.name}</span>
                                  <span className="text-muted tabular-nums">
                                    {g.required ? formatMoney(p.price + o.price_delta) : `+${formatMoney(o.price_delta)}`}
                                  </span>
                                  {isSel && <Check className="w-3.5 h-3.5 text-brand shrink-0" aria-label="aksiya amal qiladi" />}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {isSel && (
                          <p className="mt-1.5 text-[12px] font-semibold text-brand">
                            Aksiya barcha variantlarga amal qiladi — bir xil variantdan olinganda (masalan, 2 ta 30 sm)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
