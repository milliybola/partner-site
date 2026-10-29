import React, { useEffect, useRef, useState } from 'react';
import { History, Grid3x3 } from 'lucide-react';
import { Input, Numpad } from '../../core/ui';
import { formatPhone, maskPhoneInput } from '../../core/lib/format';
import { customersApi } from './customersApi';
import type { Customer } from './customersApi';

const localDigits = (value: string) => {
  const d = value.replace(/\D/g, '');
  return d.startsWith('998') ? d.slice(3) : d;
};

/**
 * Mijoz telefoni maydoni: yozganda avvalgi mijozlardan taklif chiqadi (raqam yoki ism bo'yicha);
 * taklif tanlansa — raqam va (mavjud bo'lsa) ism to'ldiriladi. Raqam to'liq (9 raqam) kiritilsa ham
 * `lookup` bilan ism topiladi. Foydalanuvchi allaqachon yozgan ismni hech qachon bosib ketmaydi.
 */
export const PhoneCustomerInput: React.FC<{
  value: string;
  name: string;
  error?: string | null;
  onPhoneChange: (maskedPhone: string) => void;
  onNameFound: (name: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ value, name, error, onPhoneChange, onNameFound, onFocus, onBlur }) => {
  const [open, setOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const [items, setItems] = useState<Customer[]>([]);
  const lookedUp = useRef('');
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  const boxRef = useRef<HTMLDivElement>(null);

  // Takliflar (faqat maydon fokusda bo'lganda)
  useEffect(() => {
    if (!open) return;
    const term = localDigits(value);
    const t = setTimeout(() => {
      customersApi
        .search(term.length >= 2 ? term : '', 6)
        .then((list) => setItems(list.filter((c) => localDigits(c.phone) !== term)))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value, open]);

  // To'liq raqam → ismni topish (yozilgan ism bo'lmasa)
  useEffect(() => {
    const local = localDigits(value);
    if (local.length !== 9) {
      lookedUp.current = '';
      return;
    }
    if (lookedUp.current === local) return;
    lookedUp.current = local;
    let alive = true;
    customersApi
      .lookup(`+998${local}`)
      .then((c) => {
        if (alive && c?.name && !nameRef.current.trim()) onNameFound(c.name);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Tashqariga bosilsa yopiladi
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const pick = (c: Customer) => {
    lookedUp.current = localDigits(c.phone);
    onPhoneChange(maskPhoneInput(c.phone));
    if (c.name && !nameRef.current.trim()) onNameFound(c.name);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        label="Telefon"
        type="tel"
        inputMode="tel"
        placeholder="+998 (90) 123-45-67"
        value={value}
        error={error}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onBlur={onBlur}
        onChange={(e) => onPhoneChange(maskPhoneInput(e.target.value))}
        rightSlot={
          <button
            type="button"
            aria-label="Raqam panelini ochish"
            title="Raqam paneli (klaviaturasiz)"
            // Fokusда emas — faqat shu tugma orqali ochiladi (sensorli monoblok uchun)
            onClick={() => setPadOpen(true)}
            className="p-2 text-subtle hover:text-ink"
          >
            <Grid3x3 className="w-5 h-5" />
          </button>
        }
      />
      <Numpad
        open={padOpen}
        title="Telefon raqami"
        initial={localDigits(value)}
        maxLen={9}
        format={(d) => maskPhoneInput(d)}
        onClose={() => setPadOpen(false)}
        onConfirm={(digits) => {
          onPhoneChange(maskPhoneInput(digits));
          const local = digits.replace(/\D/g, '').slice(0, 9);
          if (local.length === 9) lookedUp.current = '';
        }}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 top-full mt-1 rounded-2xl border border-edge bg-surface shadow-lg overflow-hidden">
          {items.map((c) => (
            <li key={c.phone}>
              <button
                type="button"
                // onMouseDown: tanlov blur'dan oldin ishlashi uchun
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-field cursor-pointer"
              >
                <History className="w-4 h-4 text-subtle shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink truncate">{c.name || 'Ism kiritilmagan'}</span>
                  <span className="block text-[12px] text-muted">{formatPhone(c.phone)}</span>
                </span>
                <span className="text-[12px] text-muted shrink-0">{c.orders_count} ta</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
