import React from 'react';
import { Input } from '../../../core/ui';

/** "1 250 000" -> 1250000 */
export const parseMoneyInput = (v: string): number => {
  const digits = (v || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Numeric so'm input with live thousands grouping and a numeric keypad on phones. */
export const MoneyInput: React.FC<{
  label?: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
}> = ({ label, hint, value, onChange, disabled, placeholder = '0', autoFocus, required }) => (
  <Input
    label={label}
    hint={hint}
    value={value}
    inputMode="numeric"
    autoComplete="off"
    placeholder={placeholder}
    disabled={disabled}
    autoFocus={autoFocus}
    required={required}
    onChange={(e) => {
      const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      onChange(digits ? group(digits) : '');
    }}
    className="text-[18px] font-bold tabular-nums"
    rightSlot={<span className="pr-3 text-[13px] font-semibold text-muted">so'm</span>}
  />
);
