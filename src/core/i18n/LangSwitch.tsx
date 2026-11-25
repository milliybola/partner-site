import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { getLang, setLang, t } from './index';
import type { Lang } from './index';

/** Bayroqlar SVG — Windows emoji bayroqlarni ko'rsatmaydi (harf bo'lib chiqadi) */
const FlagUz: React.FC = () => (
  <svg viewBox="0 0 30 20" className="h-[14px] w-[21px] shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,.08)]" aria-hidden>
    <rect width="30" height="20" fill="#fff" />
    <rect width="30" height="6.4" fill="#0099B5" />
    <rect y="13.6" width="30" height="6.4" fill="#1EB53A" />
    <rect y="6.4" width="30" height="0.6" fill="#CE1126" />
    <rect y="13" width="30" height="0.6" fill="#CE1126" />
    <circle cx="5" cy="3.2" r="2.2" fill="#fff" />
    <circle cx="5.8" cy="3.2" r="2" fill="#0099B5" />
    {[9, 10.6, 12.2].map((x) => (
      <circle key={x} cx={x} cy="2" r="0.45" fill="#fff" />
    ))}
    {[9, 10.6, 12.2].map((x) => (
      <circle key={x} cx={x} cy="3.6" r="0.45" fill="#fff" />
    ))}
  </svg>
);

const FlagRu: React.FC = () => (
  <svg viewBox="0 0 30 20" className="h-[14px] w-[21px] shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,.08)]" aria-hidden>
    <rect width="30" height="6.67" fill="#fff" />
    <rect y="6.67" width="30" height="6.67" fill="#0039A6" />
    <rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
  </svg>
);

const OPTIONS: { value: Lang; short: string; label: string; Flag: React.FC }[] = [
  { value: 'uz', short: 'UZ', label: "O'zbekcha", Flag: FlagUz },
  { value: 'ru', short: 'RU', label: 'Русский', Flag: FlagRu },
];

/** Til tanlash: bayroqli ochiladigan ro'yxat. Tanlov shu qurilmada eslab qolinadi; tanlanganda sahifa qayta yuklanadi. */
export const LangSwitch: React.FC<{ className?: string }> = ({ className = '' }) => {
  const lang = getLang();
  const current = OPTIONS.find((o) => o.value === lang) || OPTIONS[0];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.switch')}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-field px-3 text-[13px] font-extrabold text-ink cursor-pointer hover:bg-edge/60"
      >
        <current.Flag />
        {current.short}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t('lang.switch')}
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[170px] rounded-xl border border-edge bg-surface p-1 shadow-card"
        >
          {OPTIONS.map((o) => {
            const active = o.value === lang;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    if (!active) setLang(o.value);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-bold cursor-pointer ${
                    active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-field'
                  }`}
                >
                  <o.Flag />
                  <span className="flex-1">{o.label}</span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
