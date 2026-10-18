import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'success' | 'gold' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark disabled:bg-brand/50',
  success: 'bg-brand-bright text-white hover:bg-brand active:bg-brand disabled:bg-brand-bright/50',
  secondary: 'bg-field text-ink hover:bg-edge-strong active:bg-edge-strong',
  outline: 'bg-surface text-ink border border-edge-strong hover:bg-field',
  ghost: 'bg-transparent text-ink hover:bg-field',
  danger: 'bg-danger text-white hover:bg-danger-ink disabled:bg-danger/50',
  'danger-soft': 'bg-danger-soft text-danger-ink hover:bg-danger/15',
  gold: 'bg-gold text-ink hover:brightness-95',
};

// Every size keeps >= 44px on touch except "sm", which is for dense desktop toolbars.
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-[14px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
  xl: 'h-14 px-6 text-[16px] gap-2.5 rounded-2xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', block, loading, icon, iconRight, className = '', children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-bold select-none whitespace-nowrap transition-colors
        disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer
        ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  ),
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // required for a11y + tooltip
  variant?: 'ghost' | 'secondary' | 'outline' | 'danger-soft' | 'primary';
  size?: 'sm' | 'md';
}

export const IconButton: React.FC<IconButtonProps> = ({ label, variant = 'ghost', size = 'md', className = '', children, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`inline-flex items-center justify-center shrink-0 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
      ${size === 'md' ? 'w-11 h-11' : 'w-9 h-9'}
      ${variant === 'ghost' ? 'text-muted hover:text-ink hover:bg-field' : ''}
      ${variant === 'secondary' ? 'bg-field text-ink hover:bg-edge-strong' : ''}
      ${variant === 'outline' ? 'bg-surface border border-edge-strong text-ink hover:bg-field' : ''}
      ${variant === 'danger-soft' ? 'text-danger-ink hover:bg-danger-soft' : ''}
      ${variant === 'primary' ? 'bg-brand text-white hover:bg-brand-dark' : ''}
      ${className}`}
    {...rest}
  >
    {children}
  </button>
);
