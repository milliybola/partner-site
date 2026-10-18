import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Page header. On phones it sticks below the app top bar so the title and
 * primary actions stay reachable while scrolling.
 */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: boolean | string;
  badge?: React.ReactNode;
  children?: React.ReactNode; // toolbar row (tabs / filters)
  sticky?: boolean;
}> = ({ title, subtitle, actions, back, badge, children, sticky = true }) => {
  const navigate = useNavigate();
  return (
    <div
      className={`${sticky ? 'sticky top-[var(--appbar-h,0px)] z-20' : ''} -mx-4 md:-mx-8 px-4 md:px-8 pt-3 md:pt-6 pb-3 bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {back && (
            <button
              type="button"
              aria-label="Orqaga"
              onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-ink hover:bg-field shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[22px] md:text-[26px] font-black text-ink tracking-tightest leading-tight truncate">{title}</h1>
              {badge}
            </div>
            {subtitle && <p className="text-[13px] md:text-[14px] text-muted mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

/** Section title inside a page. */
export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ children, action, className = '' }) => (
  <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
    <h2 className="text-[17px] font-extrabold text-ink tracking-tightest">{children}</h2>
    {action}
  </div>
);

/**
 * Sticky bottom action bar for phones (sits above the tab bar). On desktop it
 * renders inline, right aligned.
 */
export const MobileActionBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <>
    <div className="md:hidden h-20" aria-hidden />
    <div
      className={`fixed md:static left-0 right-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] md:bottom-auto z-30
        bg-surface/95 md:bg-transparent backdrop-blur border-t border-edge md:border-0 px-4 py-3 md:p-0
        flex gap-2 md:justify-end ${className}`}
    >
      {children}
    </div>
  </>
);
