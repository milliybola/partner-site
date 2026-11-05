import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Responsive dialog:
 *  - phones (< md): bottom sheet, full width, max 92vh, drag-handle, sticky footer
 *  - desktop: centered dialog
 * Body scroll is locked while open; Esc closes.
 */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'screen';
  /** prevent closing by backdrop click (e.g. while saving) */
  persistent?: boolean;
  /** remove default body padding */
  flush?: boolean;
  headerAction?: React.ReactNode;
  /** pastki panel (footer) uchun qo'shimcha klass, masalan `md:hidden` */
  footerClassName?: string;
}

const SIZES = {
  sm: 'md:max-w-md',
  md: 'md:max-w-lg',
  lg: 'md:max-w-2xl',
  xl: 'md:max-w-4xl',
  full: 'md:max-w-6xl',
  /** butun ekran (kassa: stol buyurtmasi) */
  screen: '',
};

let openCount = 0;

export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, subtitle, children, footer, size = 'md', persistent, flush, headerAction, footerClassName = '' }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openCount++;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount <= 0) document.body.style.overflow = '';
    };
  }, [open, persistent]);

  if (!open) return null;

  const screen = size === 'screen';

  return createPortal(
    <div className={`fixed inset-0 z-[120] flex items-end md:items-center justify-center ${screen ? '' : 'md:p-6'}`} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => !persistent && onClose()} />
      <div
        className={`relative w-full ${SIZES[size]} bg-surface flex flex-col animate-sheet-up md:animate-slide-up ${
          screen ? 'h-full' : 'max-h-[92vh] md:max-h-[88vh] rounded-t-3xl md:rounded-3xl shadow-sheet md:shadow-pop'
        }`}
      >
        <div className={`${screen ? 'hidden' : 'md:hidden flex'} justify-center pt-2.5 pb-1`}>
          <span className="w-10 h-1.5 rounded-full bg-edge-strong" />
        </div>
        {(title || headerAction) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-2 md:pt-5 pb-3 border-b border-edge">
            <div className="min-w-0">
              {title && <h2 className="text-[18px] font-extrabold text-ink tracking-tightest leading-tight">{title}</h2>}
              {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0 -mr-2 -mt-1">
              {headerAction}
              <button
                type="button"
                aria-label="Yopish"
                onClick={onClose}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-ink hover:bg-field cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
        <div className={`flex-1 min-h-0 overscroll-contain ${screen ? 'overflow-hidden' : 'overflow-y-auto'} ${flush ? '' : 'px-5 py-4'}`}>{children}</div>
        {footer && (
          <div className={`border-t border-edge px-5 py-3 pb-[calc(12px+var(--safe-bottom))] md:pb-3 flex flex-col-reverse md:flex-row md:justify-end gap-2 bg-surface rounded-b-none ${screen ? '' : 'md:rounded-b-3xl'} ${footerClassName}`}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

/** Alias for clarity where a centered dialog is semantically intended. */
export const Modal = Sheet;
