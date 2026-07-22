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
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface border border-edge-strong rounded-2xl shadow-2xl p-6 space-y-5 animate-[slideUp_0.2s_ease-out]"
          >
            <div className="flex items-start gap-3.5">
              <span className={`p-2.5 rounded-xl shrink-0 ${state.options.danger ? 'bg-rose-500/10 text-rose-400' : 'bg-brand/10 text-brand'}`}>
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div className="pt-1 text-left">
                {state.options.title && <h3 className="font-bold text-ink text-base mb-1">{state.options.title}</h3>}
                <p className="text-sm text-muted leading-relaxed">{state.message}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handle(false)}
                className="flex-1 py-2.5 rounded-xl bg-overlay hover:bg-overlay-strong text-ink font-bold text-sm transition cursor-pointer border border-edge"
              >
                {state.options.cancelText || 'Bekor qilish'}
              </button>
              <button
                onClick={() => handle(true)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition cursor-pointer text-white ${
                  state.options.danger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-brand hover:bg-brand-dark'
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
