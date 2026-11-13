import React from 'react';
import { getLang, setLang, t } from './index';
import type { Lang } from './index';

const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'uz', label: 'UZ' },
  { value: 'ru', label: 'RU' },
];

/** Kassa tili: UZ | RU. Tanlov shu qurilmada eslab qolinadi; bosilganda sahifa qayta yuklanadi. */
export const LangSwitch: React.FC<{ className?: string }> = ({ className = '' }) => {
  const lang = getLang();
  return (
    <div role="radiogroup" aria-label={t('lang.switch')} className={`inline-flex items-center h-10 p-1 rounded-xl bg-field ${className}`}>
      {OPTIONS.map((o) => {
        const active = o.value === lang;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && setLang(o.value)}
            className={`h-8 px-2.5 rounded-lg text-[13px] font-extrabold cursor-pointer transition ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
