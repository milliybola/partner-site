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
                        {formatMoney(p.price)}
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
                return (
                  <button
                    key={p.uuid}
                    type="button"
                    onClick={() => onToggle?.(p.uuid)}
                    aria-pressed={isSel}
                    className={`w-full flex items-center gap-3 px-3 py-2 min-h-[56px] cursor-pointer ${active ? 'bg-brand-soft/50' : 'bg-surface hover:bg-surface2'}`}
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
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
