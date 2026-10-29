import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Ban, Check } from 'lucide-react';

/** Tayyor sabablar; «Boshqa» tanlansa matn kiritiladi. Mijozga ham shu matn ko'rinadi. */
const PRESETS = [
  'Mahsulot tugagan',
  'Hozir band, qabul qila olmaymiz',
  'Ish vaqti tugagan',
  "Yetkazib berish manzili uzoq",
  "Mijoz so'rovi bo'yicha",
] as const;
const OTHER = 'OTHER';
const MIN_OTHER = 3;

interface RejectOptions {
  /** Masalan: «MG-10059» */
  orderLabel?: string;
}

/** Sabab matnini qaytaradi; foydalanuvchi bekor qilsa — null. */
type RejectFn = (options?: RejectOptions) => Promise<string | null>;

const RejectContext = createContext<RejectFn | null>(null);

export const useRejectReason = () => {
  const ctx = useContext(RejectContext);
  if (!ctx) throw new Error('useRejectReason must be used within RejectReasonProvider');
  return ctx;
};

export const RejectReasonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState<RejectOptions | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [other, setOther] = useState('');
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const ask: RejectFn = useCallback((options = {}) => {
    setChoice('');
    setOther('');
    setOpen(options);
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const finish = (value: string | null) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(null);
  };

  const reason = choice === OTHER ? other.trim() : choice;
  const valid = choice === OTHER ? reason.length >= MIN_OTHER : choice !== '';

  return (
    <RejectContext.Provider value={ask}>
      {children}
      {open && (
        <div
          onClick={() => finish(null)}
          className="fixed inset-0 z-[210] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4 animate-fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-md bg-surface rounded-t-3xl md:rounded-3xl shadow-pop p-5 pb-[calc(20px+var(--safe-bottom))] md:p-6 space-y-4 animate-sheet-up md:animate-slide-up max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start gap-3.5">
              <span className="p-2.5 rounded-xl shrink-0 bg-danger-soft text-danger">
                <Ban className="w-5 h-5" />
              </span>
              <div className="pt-1 text-left">
                <h3 className="font-extrabold text-ink text-[17px] tracking-tightest mb-1">
                  {open.orderLabel ? `${open.orderLabel} — rad etish` : 'Buyurtmani rad etish'}
                </h3>
                <p className="text-sm text-muted leading-relaxed">Rad etish sababini tanlang. Mijozga xabar boradi.</p>
              </div>
            </div>

            <div className="space-y-2" role="radiogroup" aria-label="Rad etish sababi">
              {[...PRESETS, OTHER].map((p) => {
                const on = choice === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChoice(p)}
                    className={`w-full min-h-[48px] px-4 rounded-2xl border text-left text-[15px] font-semibold flex items-center justify-between gap-3 transition cursor-pointer ${
                      on ? 'border-danger bg-danger-soft text-danger-ink' : 'border-edge bg-surface text-ink hover:bg-field'
                    }`}
                  >
                    <span>{p === OTHER ? 'Boshqa sabab' : p}</span>
                    {on && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {choice === OTHER && (
              <textarea
                autoFocus
                value={other}
                onChange={(e) => setOther(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Sababini yozing…"
                className="w-full rounded-2xl bg-field border border-transparent px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:outline-none focus:bg-surface focus:border-danger/40 focus:ring-4 focus:ring-danger/10 resize-none"
              />
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => finish(null)}
                className="flex-1 h-12 rounded-2xl bg-field hover:bg-edge-strong text-ink font-bold text-[15px] transition cursor-pointer"
              >
                Orqaga
              </button>
              <button
                type="button"
                disabled={!valid}
                onClick={() => finish(reason)}
                className="flex-1 h-12 rounded-2xl font-bold text-[15px] transition cursor-pointer text-white bg-danger hover:bg-danger-ink disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Rad etish
              </button>
            </div>
          </div>
        </div>
      )}
    </RejectContext.Provider>
  );
};
