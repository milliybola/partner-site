import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { StatusItem, Tone } from '../lib/usePosStatus';
import { t } from '../i18n';

const TONE: Record<Tone, { box: string; dot: string }> = {
  ok: { box: 'text-muted', dot: 'bg-brand-bright' },
  idle: { box: 'text-muted', dot: 'bg-subtle' },
  warn: { box: 'bg-warning-soft text-warning-ink font-bold', dot: 'bg-warning' },
  bad: { box: 'bg-danger-soft text-danger-ink font-bold', dot: 'bg-danger' },
};

/** Monoblok/planshet: ekran pastida ingichka (28px) qator. Telefonda ko'rinmaydi — u yerda «Ko'proq» ichida. */
export const PosStatusBar: React.FC<{ items: StatusItem[] }> = ({ items }) => (
  <div
    role="status"
    aria-label={t('bar.title')}
    className="hidden md:flex fixed bottom-0 inset-x-0 z-30 h-7 items-center gap-1 px-3 bg-surface/95 backdrop-blur border-t border-edge text-[12px]"
  >
    {items.map((it) => {
      const tone = TONE[it.tone];
      const Icon = it.icon;
      const inner = (
        <>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{it.text}</span>
        </>
      );
      const cls = `inline-flex items-center gap-1.5 h-6 px-2 rounded-md min-w-0 max-w-[40%] ${tone.box}`;
      return it.action ? (
        <button key={it.id} type="button" onClick={it.action} title={it.hint ?? it.text} className={`${cls} cursor-pointer ${it.tone === 'warn' || it.tone === 'bad' ? 'hover:brightness-95' : 'hover:bg-field hover:text-ink'}`}>
          {inner}
        </button>
      ) : (
        <span key={it.id} title={it.hint ?? it.text} className={cls}>
          {inner}
        </span>
      );
    })}
  </div>
);

/** Telefon: «Ko'proq» oynasidagi ro'yxat (katta qatorlar). onAction — oynani yopish uchun. */
export const PosStatusList: React.FC<{ items: StatusItem[]; onAction: () => void }> = ({ items, onAction }) => (
  <div>
    <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-subtle">{t('bar.title')}</div>
    <div className="rounded-2xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
      {items.map((it) => {
        const tone = TONE[it.tone];
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            disabled={!it.action}
            onClick={() => {
              onAction();
              it.action?.();
            }}
            className={`w-full flex items-center gap-3 min-h-[48px] px-4 text-left text-[14px] cursor-pointer disabled:cursor-default ${
              it.tone === 'warn' || it.tone === 'bad' ? tone.box : 'text-ink'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
            <Icon className="w-[18px] h-[18px] shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block truncate font-semibold">{it.text}</span>
              {it.hint && <span className="block truncate text-[12px] opacity-80">{it.hint}</span>}
            </span>
            {it.action && <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />}
          </button>
        );
      })}
    </div>
  </div>
);
