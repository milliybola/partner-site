import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';

export interface FilialOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  options: FilialOption[];
  onChange: (value: string) => void;
  /** Tanlov yo'q bo'lganda tugmada ko'rinadigan matn */
  placeholder?: string;
  /** Tugma ostidagi kichik yozuv (masalan, hamkor nomi) */
  subtitle?: string;
}

/** Sarlavhadagi ixcham filial tanlagich (rahbar: «Barcha filiallar» ham bor; menejer: faqat filiallar). */
export const FilialSwitch: React.FC<Props> = ({ value, options, onChange, placeholder = 'Filial tanlang', subtitle }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 h-12 max-w-[56vw] md:max-w-[300px] pl-2 pr-3 rounded-2xl bg-field hover:bg-edge/60 text-left cursor-pointer transition-colors"
      >
        <span className="w-8 h-8 shrink-0 rounded-xl bg-surface border border-edge flex items-center justify-center">
          <Building2 className="w-[18px] h-[18px] text-brand" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] font-extrabold text-ink truncate">{current?.label ?? placeholder}</span>
          {subtitle && <span className="hidden sm:block text-[11px] font-medium text-muted truncate">{subtitle}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 md:left-auto md:right-0 top-14 z-50 w-[min(280px,86vw)] max-h-[60vh] overflow-y-auto rounded-2xl bg-surface border border-edge shadow-lg p-1.5"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value || '__all'} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) onChange(o.value);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-[14px] cursor-pointer ${
                    active ? 'bg-brand-soft text-brand font-bold' : 'text-ink font-semibold hover:bg-field'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block text-[11px] font-medium text-muted truncate">{o.hint}</span>}
                  </span>
                  {active && <Check className="w-4 h-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
