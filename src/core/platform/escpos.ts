/**
 * ESC/POS chek kodlovchi: matnni termal printer buyruqlariga aylantiradi (Xprinter, Rongta, Epson TM …).
 * Natija baytlari desktop ilovada `printer_send` orqali printerga to'g'ridan-to'g'ri yuboriladi.
 *
 * Kirill harflari CP866 kod sahifasida yuboriladi (`ESC t n`, n — printer sozlamasi, ko'pchilikda 17).
 * O'zbek lotinidagi ʻ/ʼ belgilari oddiy apostrofga almashtiriladi.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** 80 mm — 48 belgi, 58 mm — 32 belgi (A shrift) */
export const columnsFor = (widthMm: 58 | 80) => (widthMm === 58 ? 32 : 48);

const ASCII_FIXES: Record<string, string> = {
  'ʻ': "'", 'ʼ': "'", '‘': "'", '’': "'", '`': "'", '“': '"', '”': '"', '«': '"', '»': '"',
  '—': '-', '–': '-', '×': 'x', '№': 'N', '…': '...',
  [String.fromCharCode(0xa0)]: ' ', [String.fromCharCode(0x202f)]: ' ', // bo'linmas bo'shliqlar (raqam formatida)
};
// CP866 da yo'q o'zbek kirill harflari — eng yaqin harf
const CYR_FIXES: Record<string, string> = { 'Қ': 'К', 'қ': 'к', 'Ғ': 'Г', 'ғ': 'г', 'Ҳ': 'Х', 'ҳ': 'х' };

const cp866 = (ch: string): number => {
  const c = ch.codePointAt(0)!;
  if (c < 0x80) return c;
  if (c >= 0x410 && c <= 0x42f) return c - 0x410 + 0x80; // А-Я
  if (c >= 0x430 && c <= 0x43f) return c - 0x430 + 0xa0; // а-п
  if (c >= 0x440 && c <= 0x44f) return c - 0x440 + 0xe0; // р-я
  if (c === 0x401) return 0xf0; // Ё
  if (c === 0x451) return 0xf1; // ё
  if (c === 0x40e) return 0xf6; // Ў
  if (c === 0x45e) return 0xf7; // ў
  return 0x3f; // ?
};

const normalize = (s: string) =>
  Array.from(String(s ?? ''))
    .map((ch) => ASCII_FIXES[ch] ?? CYR_FIXES[ch] ?? ch)
    .join('');

/** So'zlar bo'yicha qatorlarga bo'lish (uzun so'z kesiladi) */
export const wrap = (text: string, width: number): string[] => {
  const out: string[] = [];
  for (const para of normalize(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= width) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
};

export class EscPos {
  private bytes: number[] = [];
  readonly cols: number;

  constructor(widthMm: 58 | 80 = 80, codepage = 17) {
    this.cols = columnsFor(widthMm);
    this.raw(ESC, 0x40); // init
    this.raw(ESC, 0x74, codepage); // kod sahifasi (CP866)
  }

  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }

  align(a: 'left' | 'center' | 'right') {
    return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }

  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Shrift kattaligi: 1 — oddiy, 2 — ikki barobar */
  size(w: 1 | 2 = 1, h: 1 | 2 = 1) {
    return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  }

  text(s: string) {
    for (const ch of Array.from(normalize(s))) this.bytes.push(cp866(ch));
    return this;
  }

  line(s = '') {
    return this.text(s).raw(0x0a);
  }

  /** Uzun matn — qatorlarga bo'linadi. `scale` — joriy shrift kengligi (2 bo'lsa sig'im ikki barobar kam). */
  para(s: string, scale: 1 | 2 = 1) {
    for (const l of wrap(s, Math.floor(this.cols / scale))) this.line(l);
    return this;
  }

  /** Chapda nom, o'ngda summa; nom sig'masa — keyingi qatorga o'tadi */
  pair(left: string, right: string, scale: 1 | 2 = 1) {
    const width = Math.floor(this.cols / scale);
    const r = normalize(right);
    const lines = wrap(left, Math.max(1, width - r.length - 1));
    lines.forEach((l, i) => {
      if (i === lines.length - 1) this.line(l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r);
      else this.line(l);
    });
    return this;
  }

  divider(ch = '-') {
    return this.line(ch.repeat(this.cols));
  }

  feed(n = 1) {
    return this.raw(ESC, 0x64, n);
  }

  qr(data: string, moduleSize = 6) {
    const d = Array.from(new TextEncoder().encode(data));
    const len = d.length + 3;
    this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize); // o'lcham
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // xatoni tuzatish M
    this.raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...d);
    return this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // chop etish
  }

  /** Qog'ozni surib, qisman kesish */
  cut() {
    return this.feed(4).raw(GS, 0x56, 0x42, 0x00);
  }

  /** Pul qutisini ochish (printerning RJ11 chiqishi, 2-pin) */
  openDrawer() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
