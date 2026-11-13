import { useEffect, useState } from 'react';

/**
 * Printerning oxirgi chop etish natijasi (shu kompyuterda). ESC/POS printer o'z holatini (qog'oz, qopqoq)
 * qaytarmaydi — shuning uchun kassa pastidagi holat qatori har bir printer uchun OXIRGI urinish natijasini
 * ko'rsatadi: muvaffaqiyatli yoki xato, vaqti bilan. Yozuvni `sendToPrinter` qiladi.
 */
export interface PrintResult {
  ok: boolean;
  at: number;
  /** Printer nomi yoki IP — maslahat matni uchun */
  label: string;
  error?: string;
}

/** Printer kaliti va ko'rinadigan nomi (sendToPrinter va holat qatori bir xil hisoblashi uchun) */
export const printerKey = (d: { kind: 'network' | 'system'; host?: string; port?: number; name?: string }) => {
  const label = d.kind === 'network' ? `${d.host?.trim() ?? ''}:${d.port || 9100}` : (d.name ?? '').trim();
  return { key: `${d.kind}:${label}`, label };
};

const KEY = 'milliygo_print_last';
export const PRINT_RESULT_EVENT = 'milliygo:print-result';

/** Har printer (kalit: tur + manzil) uchun oxirgi natija */
export const getPrintResults = (): Record<string, PrintResult> => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PrintResult>) : {};
  } catch {
    return {};
  }
};

export const recordPrintResult = (key: string, r: PrintResult) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getPrintResults(), [key]: r }));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(PRINT_RESULT_EVENT));
};

export function usePrintResults(): Record<string, PrintResult> {
  const [r, setR] = useState(getPrintResults);
  useEffect(() => {
    const sync = () => setR(getPrintResults());
    window.addEventListener(PRINT_RESULT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PRINT_RESULT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return r;
}
