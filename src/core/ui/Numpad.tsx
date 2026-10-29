import React, { useEffect, useState } from 'react';
import { Delete, Check } from 'lucide-react';
import { Sheet } from './Overlay';

/**
 * Ekran raqam-paneli (numpad) — klaviaturasiz sensorli monoblok uchun.
 * Raqamlar tugma bilan kiritiladi. MUHIM: inputga fokus qilinganda O'ZI ochilmaydi —
 * faqat alohida tugma (masalan input yonidagi panel ikonkasi) orqali ochiladi.
 *
 * Faqat raqamlar bilan ishlaydi (satr); formatlash `format` orqali ko'rsatiladi.
 */
export const Numpad: React.FC<{
  open: boolean;
  title?: string;
  /** Boshlang'ich raqamlar (faqat raqamli satr) */
  initial?: string;
  /** Ko'rsatish uchun formatlovchi (masalan telefon maskasi) */
  format?: (digits: string) => string;
  maxLen?: number;
  onClose: () => void;
  onConfirm: (digits: string) => void;
}> = ({ open, title = 'Raqam kiriting', initial = '', format, maxLen = 20, onClose, onConfirm }) => {
  const [digits, setDigits] = useState(initial);
  useEffect(() => {
    if (open) setDigits(initial.replace(/\D/g, ''));
  }, [open, initial]);

  const press = (d: string) => setDigits((s) => (s.length >= maxLen ? s : s + d));
  const back = () => setDigits((s) => s.slice(0, -1));
  const clear = () => setDigits('');

  const confirm = () => {
    onConfirm(digits);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <button
          type="button"
          onClick={confirm}
          className="w-full h-12 rounded-2xl bg-brand text-white font-bold flex items-center justify-center gap-2 active:opacity-90"
        >
          <Check className="w-5 h-5" /> Tayyor
        </button>
      }
    >
      <div className="mb-3 h-14 rounded-2xl bg-field flex items-center px-4 text-[22px] font-bold text-ink tabular-nums select-none">
        {format ? format(digits) : digits || '—'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-16 rounded-2xl bg-field text-[24px] font-bold text-ink active:bg-edge"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          className="h-16 rounded-2xl bg-field text-[16px] font-bold text-muted active:bg-edge"
        >
          Tozalash
        </button>
        <button
          type="button"
          onClick={() => press('0')}
          className="h-16 rounded-2xl bg-field text-[24px] font-bold text-ink active:bg-edge"
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          aria-label="O'chirish"
          className="h-16 rounded-2xl bg-field flex items-center justify-center text-muted active:bg-edge"
        >
          <Delete className="w-7 h-7" />
        </button>
      </div>
    </Sheet>
  );
};
