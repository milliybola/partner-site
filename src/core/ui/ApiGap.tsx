import React from 'react';

/**
 * Visible marker for UI that is waiting on a backend endpoint / field.
 * Every usage must also be listed in API_GAPS.md at the project root.
 *
 *   <ApiGap title="PATCH partner/me/ {is_open} is not confirmed" />
 *   <ApiGap title="..." label="API: tez kunda" />
 */
export const ApiGap: React.FC<{ title: string; label?: string; className?: string; block?: boolean; children?: React.ReactNode }> = ({
  title,
  label = 'API',
  className = '',
  block,
  children,
}) => {
  if (block) {
    return (
      <div
        title={title}
        className={`rounded-2xl border-2 border-dashed border-warning/70 bg-warning-soft/60 px-4 py-3 text-[13px] text-warning-ink ${className}`}
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 inline-flex items-center h-5 px-1.5 rounded-md border border-dashed border-warning text-[10px] font-black tracking-wider">
            {label}
          </span>
          <div className="min-w-0">
            <div className="font-semibold">{children || title}</div>
            {children && <div className="text-[12px] opacity-80 mt-0.5">{title}</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <span
      title={title}
      aria-label={`API yo'q: ${title}`}
      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-dashed border-warning bg-warning-soft/70 text-warning-ink text-[10px] font-black tracking-wider align-middle cursor-help select-none ${className}`}
    >
      {label}
      {children && <span className="font-semibold tracking-normal">{children}</span>}
    </span>
  );
};
