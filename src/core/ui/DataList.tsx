import React from 'react';

/**
 * Responsive data list.
 *  - >= md: dense table
 *  - <  md: stacked cards (no horizontal scroll)
 *
 * Columns flagged `primary` become the card title, `mobileHidden` are skipped
 * on cards, everything else renders as "label: value" rows.
 */
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string; // td/th class on desktop
  align?: 'left' | 'right' | 'center';
  primary?: boolean;
  mobileHidden?: boolean;
  /** shown at the top-right of the mobile card (status badge, amount...) */
  mobileAside?: boolean;
}

export function DataList<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowActions,
  empty,
  className = '',
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) || columns[0];
  const aside = columns.filter((c) => c.mobileAside);
  const rest = columns.filter((c) => c !== primary && !c.mobileHidden && !c.mobileAside);
  const alignCls = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  return (
    <div className={className}>
      {/* Desktop table */}
      <div className="hidden md:block bg-surface border border-edge rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-edge bg-surface2">
                {columns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 text-[12px] font-bold text-muted uppercase tracking-wide whitespace-nowrap ${alignCls(c.align)} ${c.className || ''}`}>
                    {c.header}
                  </th>
                ))}
                {rowActions && <th className="px-4 py-3 w-px" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`border-b border-edge last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface2' : ''}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 align-middle text-ink ${alignCls(c.align)} ${c.className || ''}`}>
                      {c.render(r)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {rowActions(r)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {rows.map((r) => (
          <div
            key={rowKey(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={`bg-surface border border-edge rounded-2xl p-4 ${onRowClick ? 'active:bg-surface2 cursor-pointer' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-bold text-[15px] text-ink">{primary.render(r)}</div>
              {aside.length > 0 && <div className="shrink-0 flex flex-col items-end gap-1">{aside.map((c) => <React.Fragment key={c.key}>{c.render(r)}</React.Fragment>)}</div>}
            </div>
            {rest.length > 0 && (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[12px] text-muted">{c.header}</dt>
                    <dd className="text-[14px] text-ink font-medium break-words">{c.render(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {rowActions && (
              <div className="mt-3 pt-3 border-t border-edge flex flex-wrap gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                {rowActions(r)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
