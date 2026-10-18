import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{ message: string; options: ConfirmOptions } | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm: ConfirmFn = useCallback((message, options = {}) => {
    setState({ message, options });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handle = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          onClick={() => handle(false)}
          className="fixed inset-0 z-[210] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-sm bg-surface rounded-t-3xl md:rounded-3xl shadow-pop p-5 pb-[calc(20px+var(--safe-bottom))] md:p-6 space-y-5 animate-sheet-up md:animate-slide-up"
          >
            <div className="flex items-start gap-3.5">
              <span className={`p-2.5 rounded-xl shrink-0 ${state.options.danger ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'}`}>
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div className="pt-1 text-left">
                {state.options.title && <h3 className="font-extrabold text-ink text-[17px] tracking-tightest mb-1">{state.options.title}</h3>}
                <p className="text-sm text-muted leading-relaxed">{state.message}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handle(false)}
                className="flex-1 h-12 rounded-2xl bg-field hover:bg-edge-strong text-ink font-bold text-[15px] transition cursor-pointer"
              >
                {state.options.cancelText || 'Bekor qilish'}
              </button>
              <button
                onClick={() => handle(true)}
                className={`flex-1 h-12 rounded-2xl font-bold text-[15px] transition cursor-pointer text-white ${
                  state.options.danger ? 'bg-danger hover:bg-danger-ink' : 'bg-brand hover:bg-brand-dark'
                }`}
              >
                {state.options.confirmText || 'Tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
