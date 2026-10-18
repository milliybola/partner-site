import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

let idCounter = 0;

const STYLES = {
  success: { icon: CheckCircle, iconBg: 'bg-brand-soft text-brand', border: 'border-edge' },
  error: { icon: XCircle, iconBg: 'bg-danger-soft text-danger', border: 'border-danger/20' },
  info: { icon: Info, iconBg: 'bg-info-soft text-info', border: 'border-edge' },
} as const;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type: ToastItem['type'], message: string) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => remove(id), 6000);
  }, [remove]);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed z-[200] flex flex-col gap-2 pointer-events-none left-4 right-4 bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+12px)] md:left-auto md:bottom-auto md:top-5 md:right-5 md:w-full md:max-w-sm">
        {toasts.map((t) => {
          const s = STYLES[t.type];
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl bg-surface border ${s.border} shadow-pop animate-slide-up`}
            >
              <span className={`p-2 rounded-xl shrink-0 ${s.iconBg}`}>
                <Icon className="w-4.5 h-4.5" />
              </span>
              <p className="flex-1 text-sm text-ink font-medium leading-snug pt-1">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="p-1 rounded-lg text-muted hover:text-ink hover:bg-overlay transition shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
