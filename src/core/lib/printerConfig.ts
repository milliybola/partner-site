import { isTauri } from '../platform';

/**
 * Shu kassa qurilmasining printerlari. Desktop ilovada to'g'ridan-to'g'ri; brauzerda — kompyuterda ishlaydigan
 * printer agenti orqali (`PrinterSettings.agent`). Ikkalasi ham yo'q bo'lsa chek `window.print` orqali chiqadi.
 */
export interface PrinterDevice {
  /** network — LAN/Wi-Fi (IP:9100), system — Windows'ga o'rnatilgan (USB) */
  kind: 'network' | 'system';
  host?: string;
  port?: number;
  name?: string;
  width: 58 | 80;
  /** ESC t n — kirill uchun CP866 (ko'p printerlarda 17) */
  codepage: number;
}

export interface PrinterSettings {
  /** Kassa cheki printeri; null — brauzer usulida (window.print) */
  receipt: PrinterDevice | null;
  /** Oshxona printeri; null — oshxona cheki chiqarilmaydi */
  kitchen: PrinterDevice | null;
  /** Naqd to'lov cheki chiqqanda pul qutisini ochish */
  openDrawer: boolean;
  /** Brauzerda: chekni shu kompyuterdagi printer agenti (printer-agent/) orqali chiqarish */
  agent: boolean;
}

const KEY = 'milliygo_printers';

export const DEFAULT_DEVICE: PrinterDevice = { kind: 'network', host: '', port: 9100, width: 80, codepage: 17 };
const DEFAULTS: PrinterSettings = { receipt: null, kitchen: null, openDrawer: true, agent: false };

export const getPrinterSettings = (): PrinterSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PrinterSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

/** Sozlama o'zgarganda (oshxona agenti darrov yoqiladi/o'chadi) */
export const PRINTERS_CHANGED_EVENT = 'milliygo:printers-changed';

export const savePrinterSettings = (s: PrinterSettings) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(PRINTERS_CHANGED_EVENT));
};

export const deviceReady = (d: PrinterDevice | null): d is PrinterDevice =>
  !!d && (d.kind === 'network' ? !!d.host?.trim() : !!d.name?.trim());

/** To'g'ridan-to'g'ri (ESC/POS) chop etish uchun sozlangan printer; yo'q bo'lsa — null */
export const escposPrinter = (role: 'receipt' | 'kitchen'): PrinterDevice | null => {
  const settings = getPrinterSettings();
  if (!isTauri() && !settings.agent) return null;
  const d = settings[role];
  return deviceReady(d) ? d : null;
};
