import React from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { formatMoney } from '../../../../core/lib/format';
import { splitEach } from '../../utils/printing';

export const MAX_SPLIT = 20;

/** Zal hisobini bir necha do'stga bo'lish: kishilar soni + bir kishiga to'g'ri keladigan summa. */
export const SplitBill: React.FC<{
  total: number | string;
  count: number;
  onChange: (count: number) => void;
  disabled?: boolean;
}> = ({ total, count, onChange, disabled }) => {
  const step = (d: number) => onChange(Math.min(MAX_SPLIT, Math.max(1, count + d)));
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between rounded-2xl border border-edge bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Users className="w-5 h-5 text-muted" />
          Hisobni bo'lish
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Kamaytirish"
            disabled={disabled || count <= 1}
            onClick={() => step(-1)}
            className="w-9 h-9 rounded-full bg-field flex items-center justify-center text-ink disabled:opacity-40 cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="min-w-[2ch] text-center text-[18px] font-black tabular-nums">{count}</span>
          <button
            type="button"
            aria-label="Ko'paytirish"
            disabled={disabled || count >= MAX_SPLIT}
            onClick={() => step(1)}
            className="w-9 h-9 rounded-full bg-field flex items-center justify-center text-ink disabled:opacity-40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      {count > 1 && (
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-field px-4 py-3 text-[13px] font-bold text-ink">
          <span>Kishi boshiga</span>
          <span className="tabular-nums">{formatMoney(splitEach(total, count))}</span>
        </div>
      )}
    </div>
  );
};
