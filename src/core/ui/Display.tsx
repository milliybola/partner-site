import React from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button';

/* ----------------------------------------------------------------- Card */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { padded?: boolean; interactive?: boolean }> = ({
  padded = true,
  interactive,
  className = '',
  children,
  ...rest
}) => (
  <div
    className={`bg-surface border border-edge rounded-2xl ${padded ? 'p-4 md:p-5' : ''} ${
      interactive ? 'hover:border-edge-strong hover:shadow-card transition cursor-pointer' : ''
    } ${className}`}
    {...rest}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }> = ({
  title,
  subtitle,
  action,
  icon,
  className = '',
}) => (
  <div className={`flex items-start justify-between gap-3 mb-4 ${className}`}>
    <div className="flex items-start gap-3 min-w-0">
      {icon && <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0">{icon}</span>}
      <div className="min-w-0">
        <h3 className="text-[16px] font-extrabold text-ink tracking-tightest leading-tight">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ---------------------------------------------------------------- Badge */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'brand';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-field text-muted',
  success: 'bg-brand-soft text-brand',
  brand: 'bg-brand text-white',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info',
  gold: 'bg-gold-soft text-gold-ink',
};

export const Badge: React.FC<{ tone?: BadgeTone; dot?: boolean; className?: string; children: React.ReactNode; title?: string }> = ({
  tone = 'neutral',
  dot,
  className = '',
  children,
  title,
}) => (
  <span title={title} className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-[12px] font-bold whitespace-nowrap ${TONES[tone]} ${className}`}>
    {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
    {children}
  </span>
);

/* ------------------------------------------------------------- StatCard */
export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'brand' | 'gold' | 'danger' | 'info' | 'neutral';
  className?: string;
}> = ({ label, value, hint, icon, tone = 'brand', className = '' }) => {
  const iconTone = {
    brand: 'bg-brand-soft text-brand',
    gold: 'bg-gold-soft text-gold-ink',
    danger: 'bg-danger-soft text-danger-ink',
    info: 'bg-info-soft text-info',
    neutral: 'bg-field text-muted',
  }[tone];
  return (
    <div className={`bg-surface border border-edge rounded-2xl p-4 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted truncate">{label}</span>
        {icon && <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}>{icon}</span>}
      </div>
      <div className="mt-2 text-[22px] md:text-[24px] font-black text-ink tracking-tightest leading-none truncate">{value}</div>
      {hint && <div className="mt-1.5 text-[12px] text-muted truncate">{hint}</div>}
    </div>
  );
};

/* --------------------------------------------------------------- States */
export const Spinner: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Loader2 className={`animate-spin text-brand ${className}`} />
);

export const LoadingState: React.FC<{ label?: string; className?: string }> = ({ label = 'Yuklanmoqda...', className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-16 text-muted ${className}`} role="status">
    <Spinner className="w-7 h-7" />
    <span className="text-[14px] font-medium">{label}</span>
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`animate-pulse rounded-xl bg-field ${className}`} />
);

export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 4, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-surface border border-edge rounded-2xl p-4 space-y-2.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    ))}
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center gap-2 py-12 px-6 ${className}`}>
    <span className="w-14 h-14 rounded-2xl bg-field text-subtle flex items-center justify-center mb-1">
      {icon || <Inbox className="w-7 h-7" />}
    </span>
    <h3 className="text-[16px] font-extrabold text-ink tracking-tightest">{title}</h3>
    {description && <p className="text-[14px] text-muted max-w-sm">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{ title?: string; message?: string; onRetry?: () => void; className?: string }> = ({
  title = "Ma'lumotlarni yuklab bo'lmadi",
  message,
  onRetry,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center gap-2 py-12 px-6 ${className}`} role="alert">
    <span className="w-14 h-14 rounded-2xl bg-danger-soft text-danger flex items-center justify-center mb-1">
      <AlertTriangle className="w-7 h-7" />
    </span>
    <h3 className="text-[16px] font-extrabold text-ink tracking-tightest">{title}</h3>
    {message && <p className="text-[14px] text-muted max-w-sm">{message}</p>}
    {onRetry && (
      <Button variant="outline" className="mt-3" icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
        Qayta urinish
      </Button>
    )}
  </div>
);

export const InlineAlert: React.FC<{ tone?: 'danger' | 'warning' | 'info' | 'success'; children: React.ReactNode; className?: string; icon?: React.ReactNode }> = ({
  tone = 'danger',
  children,
  className = '',
  icon,
}) => {
  const t = {
    danger: 'bg-danger-soft text-danger-ink',
    warning: 'bg-warning-soft text-warning-ink',
    info: 'bg-info-soft text-info',
    success: 'bg-brand-soft text-brand',
  }[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px] font-medium ${t} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="shrink-0 mt-0.5">{icon || <AlertTriangle className="w-4 h-4" />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
};

/* ------------------------------------------------------------- Divider */
export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`h-px bg-edge ${className}`} />;
