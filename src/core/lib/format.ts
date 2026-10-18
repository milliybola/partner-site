/** Money in so'm, grouped with spaces: 125 000 so'm */
export const formatMoney = (value: number | string | null | undefined, withCurrency = true): string => {
  const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  const safe = Number.isFinite(n) ? Math.round(n as number) : 0;
  const s = safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return withCurrency ? `${s} so'm` : s;
};

/** Compact money for tight places: 1,2 mln / 350 ming */
export const formatMoneyShort = (value: number | string | null | undefined): string => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} mln`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} ming`;
  return `${Math.round(n)}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Parses ISO strings as well as backend "dd-MM-yyyy[ HH:mm[:ss]]" strings. */
export const parseDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  const m = /^(\d{2})[-.](\d{2})[-.](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (m) {
    const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
};

export const formatTime = (value: any) => {
  const d = parseDate(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
};

export const formatDate = (value: any) => {
  const d = parseDate(value);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : '—';
};

export const formatDateTime = (value: any) => {
  const d = parseDate(value);
  return d ? `${formatDate(d)} ${formatTime(d)}` : '—';
};

/** "5 daq oldin" style relative time */
export const timeAgo = (value: any, now: number = Date.now()) => {
  const d = parseDate(value);
  if (!d) return '—';
  const diff = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (diff < 60) return 'hozirgina';
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min} daq oldin`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return formatDate(d);
};

export const minutesSince = (value: any, now: number = Date.now()) => {
  const d = parseDate(value);
  return d ? Math.max(0, Math.floor((now - d.getTime()) / 60000)) : 0;
};

/** dd-MM-yyyy (backend promos/sets format) <-> yyyy-MM-dd (input[type=date]) */
export const toBackendDate = (isoDate: string) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}-${m}-${y}` : isoDate;
};
export const fromBackendDate = (value?: string | null) => {
  const d = parseDate(value);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
};

/** +998 (90) 123-45-67 */
export const formatPhone = (raw?: string | null) => {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length !== 9) return raw;
  return `+998 (${local.slice(0, 2)}) ${local.slice(2, 5)}-${local.slice(5, 7)}-${local.slice(7, 9)}`;
};

/** Input mask helper used by phone fields. */
export const maskPhoneInput = (val: string) => {
  const digits = val.replace(/\D/g, '');
  const local = (digits.startsWith('998') ? digits.slice(3) : digits).slice(0, 9);
  let out = '+998';
  if (local.length > 0) out += ' (' + local.slice(0, 2);
  if (local.length > 2) out += ') ' + local.slice(2, 5);
  if (local.length > 5) out += '-' + local.slice(5, 7);
  if (local.length > 7) out += '-' + local.slice(7, 9);
  return out;
};
export const cleanPhone = (formatted: string) => formatted.replace(/[^\d+]/g, '');
