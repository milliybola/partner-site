import React, { useId } from 'react';
import { Minus, Plus, Search, X } from 'lucide-react';

/* ---------------------------------------------------------------- Field */
export const Field: React.FC<{
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, error, required, htmlFor, className = '', children }) => (
  <div className={className}>
    {label && (
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
    )}
    {children}
    {error ? (
      <p className="mt-1.5 text-[12px] font-medium text-danger-ink">{error}</p>
    ) : hint ? (
      <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
    ) : null}
  </div>
);

const inputBase =
  'w-full min-h-[44px] rounded-xl bg-field border border-transparent px-3.5 text-[15px] text-ink placeholder:text-subtle ' +
  'focus:outline-none focus:bg-surface focus:border-brand/40 focus:ring-4 focus:ring-brand/10 transition disabled:opacity-60 disabled:cursor-not-allowed';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, rightSlot, containerClassName = '', className = '', id, required, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
      <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
        <div className="relative">
          {leftIcon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={!!error}
            className={`${inputBase} ${leftIcon ? 'pl-10' : ''} ${rightSlot ? 'pr-11' : ''} ${error ? 'border-danger/50 bg-danger-soft/40' : ''} ${className}`}
            {...rest}
          />
          {rightSlot && <span className="absolute right-1 top-1/2 -translate-y-1/2">{rightSlot}</span>}
        </div>
      </Field>
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, containerClassName = '', className = '', id, required, rows = 3, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
      <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
        <textarea ref={ref} id={inputId} rows={rows} required={required} className={`${inputBase} py-2.5 resize-y ${className}`} {...rest} />
      </Field>
    );
  },
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, containerClassName = '', className = '', id, required, children, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
      <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
        <select ref={ref} id={inputId} required={required} className={`${inputBase} cursor-pointer ${className}`} {...rest}>
          {children}
        </select>
      </Field>
    );
  },
);
Select.displayName = 'Select';

/* --------------------------------------------------------------- Search */
export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder = 'Qidirish...', className = '', autoFocus }) => (
  <div className={`relative ${className}`}>
    <Search className="w-4.5 h-4.5 w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
    <input
      type="search"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputBase} pl-10 pr-10`}
    />
    {value && (
      <button
        type="button"
        aria-label="Tozalash"
        onClick={() => onChange('')}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-subtle hover:text-ink hover:bg-edge"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

/* --------------------------------------------------------------- Switch */
export const Switch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}> = ({ checked, onChange, disabled, label, size = 'md' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
      ${size === 'md' ? 'h-7 w-12' : 'h-6 w-10'} ${checked ? 'bg-brand-bright' : 'bg-edge-strong'}`}
  >
    <span
      className={`inline-block rounded-full bg-white shadow transition-transform
        ${size === 'md' ? 'h-5 w-5' : 'h-4 w-4'}
        ${checked ? (size === 'md' ? 'translate-x-6' : 'translate-x-5') : 'translate-x-1'}`}
    />
  </button>
);

/** Row with title + description + control (settings lists). */
export const SettingRow: React.FC<{ title: React.ReactNode; description?: React.ReactNode; control: React.ReactNode; className?: string }> = ({
  title,
  description,
  control,
  className = '',
}) => (
  <div className={`flex items-center justify-between gap-4 py-3.5 ${className}`}>
    <div className="min-w-0">
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {description && <div className="text-[13px] text-muted mt-0.5">{description}</div>}
    </div>
    <div className="shrink-0">{control}</div>
  </div>
);

/* -------------------------------------------------------------- Stepper */
export const QtyStepper: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  disabled?: boolean;
}> = ({ value, onChange, min = 0, max = 999, size = 'md', disabled }) => {
  const btn = size === 'md' ? 'w-11 h-11' : 'w-9 h-9';
  return (
    <div className="inline-flex items-center bg-field rounded-xl">
      <button
        type="button"
        aria-label="Kamaytirish"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btn} flex items-center justify-center rounded-xl text-ink hover:bg-edge-strong disabled:opacity-40 cursor-pointer`}
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="min-w-[2rem] text-center text-[15px] font-extrabold tabular-nums select-none">{value}</span>
      <button
        type="button"
        aria-label="Ko'paytirish"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${btn} flex items-center justify-center rounded-xl text-ink hover:bg-edge-strong disabled:opacity-40 cursor-pointer`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------ Segmented */
export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
}

/**
 * Horizontally scrollable pill tabs. Works as status tabs on phones and as a
 * segmented control on desktop.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
  fill,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  fill?: boolean;
}) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center justify-center gap-1.5 shrink-0 rounded-xl font-bold transition-colors cursor-pointer whitespace-nowrap
              ${size === 'md' ? 'h-11 px-4 text-[14px]' : 'h-9 px-3 text-[13px]'}
              ${fill ? 'flex-1' : ''}
              ${active ? 'bg-ink text-white' : 'bg-surface border border-edge text-ink hover:bg-field'}`}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && (
              <span
                className={`min-w-[22px] h-[22px] px-1.5 rounded-lg text-[12px] font-extrabold inline-flex items-center justify-center tabular-nums
                  ${active ? 'bg-white/20 text-white' : 'bg-field text-muted'}`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact 2–4 option segmented control (e.g. Bugun / Hafta / Oy). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex p-1 bg-field rounded-xl gap-1 max-w-full overflow-x-auto no-scrollbar ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`h-9 px-3.5 rounded-lg text-[13px] font-bold whitespace-nowrap transition cursor-pointer inline-flex items-center gap-1.5
              ${active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
