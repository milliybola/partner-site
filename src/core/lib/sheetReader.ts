/**
 * Jadval faylini (Excel .xlsx yoki .csv) qatorlar ro'yxatiga o'qiydi — tashqi kutubxonasiz.
 *
 * .xlsx — ZIP ichidagi XML: birinchi varaq (xl/worksheets/sheet1 yoki workbook'dagi birinchisi) va
 * sharedStrings. ZIP «deflate» brauzerning DecompressionStream('deflate-raw') bilan ochiladi
 * (Chrome/Edge 103+, Safari 16.4+, Firefox 113+, Tauri WebView2).
 * .csv — `;` yoki `,` (Excel'ning O'zbekiston/Rossiya sozlamasida `;`), qo'shtirnoq, UTF-8 BOM.
 */

export type SheetRows = string[][];

export class SheetError extends Error {}

/* ------------------------------------------------------------------ CSV */

export const parseCsv = (text: string): SheetRows => {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: SheetRows = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

/* ------------------------------------------------------------------ ZIP */

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  offset: number;
}

const readZipEntries = (buf: ArrayBuffer): Map<string, ZipEntry> => {
  const v = new DataView(buf);
  // End of central directory — oxiridan qidiriladi (izoh bo'lishi mumkin)
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SheetError("Fayl Excel (.xlsx) emas yoki buzilgan.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.set(name, { name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
};

const readZipText = async (buf: ArrayBuffer, e: ZipEntry): Promise<string> => {
  const v = new DataView(buf);
  const nameLen = v.getUint16(e.offset + 26, true);
  const extraLen = v.getUint16(e.offset + 28, true);
  const data = new Uint8Array(buf, e.offset + 30 + nameLen + extraLen, e.compSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new SheetError("Excel faylining siqish usuli qo'llab-quvvatlanmaydi.");
  if (typeof DecompressionStream === 'undefined') {
    throw new SheetError("Brauzeringiz Excel faylni o'qiy olmaydi. Faylni CSV qilib saqlang yoki brauzerni yangilang.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
};

/* ------------------------------------------------------------------ XLSX */

/** "C12" → 2 (0 dan) */
const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS('*', tag));

export const parseXlsx = async (buf: ArrayBuffer): Promise<SheetRows> => {
  const entries = readZipEntries(buf);
  const get = (name: string) => entries.get(name);

  // Birinchi varaq: workbook.xml dagi birinchi <sheet> → rels orqali fayl nomi
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = byTag(xml(await readZipText(buf, wb)), 'sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = byTag(xml(await readZipText(buf, rels)), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = get(sheetPath) || Array.from(entries.values()).find((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name));
  if (!sheet) throw new SheetError("Excel faylda varaq topilmadi.");

  const shared: string[] = [];
  const ss = get('xl/sharedStrings.xml');
  if (ss) {
    for (const si of byTag(xml(await readZipText(buf, ss)), 'si')) {
      shared.push(byTag(si, 't').map((t) => t.textContent || '').join(''));
    }
  }

  const rows: SheetRows = [];
  for (const r of byTag(xml(await readZipText(buf, sheet)), 'row')) {
    const row: string[] = [];
    for (const c of byTag(r, 'c')) {
      const ref = c.getAttribute('r');
      const idx = ref ? colIndex(ref) : row.length;
      const type = c.getAttribute('t');
      let value: string;
      if (type === 'inlineStr') value = byTag(c, 't').map((t) => t.textContent || '').join('');
      else {
        const raw = byTag(c, 'v')[0]?.textContent ?? '';
        value = type === 's' ? shared[Number(raw)] ?? '' : raw;
      }
      while (row.length < idx) row.push('');
      row[idx] = value;
    }
    const rowNo = Number(r.getAttribute('r'));
    if (rowNo) while (rows.length < rowNo - 1) rows.push([]);
    rows.push(row);
  }
  return rows;
};

export const readSpreadsheet = async (file: File): Promise<SheetRows> => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new SheetError("Eski .xls format qo'llab-quvvatlanmaydi. Excel'da «Saqlash → .xlsx» qiling.");
  const rows = name.endsWith('.csv') || name.endsWith('.txt') ? parseCsv(await file.text()) : await parseXlsx(await file.arrayBuffer());
  return rows.map((r) => r.map((c) => (c ?? '').trim())).filter((r) => r.some((c) => c !== ''));
};

/** Excel to'g'ri ochadigan CSV (UTF-8 BOM, `;`) — shablon yuklab olish uchun */
export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
