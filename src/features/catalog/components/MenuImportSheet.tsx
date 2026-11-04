import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { Badge, Button, InlineAlert, LoadingState, Select, SettingRow, Sheet, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import { getPartner, isShop } from '../../../core/lib/session';
import { downloadCsv, readSpreadsheet, SheetError, type SheetRows } from '../../../core/lib/sheetReader';
import { catalogApi, type BaseCategory } from '../services/catalogApi';

/*
 * Menyuni Excel/CSV'dan import: fayl brauzerda o'qiladi → ustunlar sarlavhadan aniqlanadi → fayldagi
 * kategoriya nomlari MilliyGo turkumlariga moslanadi (mos kelmagani qo'lda tanlanadi) → bitta so'rov bilan saqlanadi.
 */

type Field = 'name' | 'price' | 'category' | 'description' | 'unit' | 'barcode';

const ALIASES: Record<Field, string[]> = {
  name: ['nomi', 'nom', 'name', 'taom', 'mahsulot', 'tovar', 'наименование', 'название', 'товар', 'блюдо'],
  price: ['narxi', 'narx', 'price', 'цена', 'стоимость', 'summa'],
  category: ['kategoriya', 'turkum', 'category', 'bolim', 'категория', 'группа', 'раздел'],
  description: ['tavsif', 'izoh', 'tarkib', 'description', 'описание', 'состав'],
  unit: ['birlik', 'olchov', 'unit', 'единица', 'ед'],
  barcode: ['shtrix', 'barcode', 'ean', 'штрих'],
};
const DEFAULT_ORDER: Field[] = ['name', 'price', 'category', 'description', 'unit', 'barcode'];

/** Taqqoslash uchun: kichik harf, apostrof turlari bir xil, bo'sh joylar qisqartirilgan */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`ʻʼ']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const detectColumns = (header: string[]): Partial<Record<Field, number>> | null => {
  const cols: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h).replace(/ /g, '');
    if (!n) return;
    for (const f of DEFAULT_ORDER) {
      if (cols[f] === undefined && ALIASES[f].some((a) => n.startsWith(norm(a).replace(/ /g, '')))) {
        cols[f] = i;
        return;
      }
    }
  });
  return cols.name !== undefined && cols.price !== undefined ? cols : null;
};

/** "40 000", "40,000", "40000 so'm", "12.5" → son; noto'g'ri — NaN */
const parsePrice = (raw: string): number => {
  let s = raw.replace(/[\s\u00a0]/g, '').replace(/(so['‘’ʻ]?m|сум|uzs)$/i, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};

interface Row {
  line: number; // fayldagi qator raqami
  name: string;
  price: number;
  categoryName: string;
  description: string;
  unit: 'PIECE' | 'KG';
  barcode: string;
  error?: string;
}

const toRows = (sheet: SheetRows, shop: boolean): { rows: Row[]; headerFound: boolean } => {
  const detected = sheet.length ? detectColumns(sheet[0]) : null;
  const cols: Partial<Record<Field, number>> = detected ?? Object.fromEntries(DEFAULT_ORDER.map((f, i) => [f, i]));
  const body = detected ? sheet.slice(1) : sheet;
  const offset = detected ? 2 : 1;
  const cell = (r: string[], f: Field) => (cols[f] !== undefined ? (r[cols[f] as number] ?? '').trim() : '');
  const seen = new Set<string>();
  const rows = body.map((r, i): Row => {
    const name = cell(r, 'name');
    const price = parsePrice(cell(r, 'price'));
    const unitRaw = norm(cell(r, 'unit'));
    const unit: Row['unit'] = shop && /^(kg|кг|kilo)/.test(unitRaw) ? 'KG' : 'PIECE';
    const row: Row = {
      line: i + offset,
      name,
      price,
      categoryName: cell(r, 'category'),
      description: cell(r, 'description').slice(0, 255),
      unit,
      barcode: shop ? cell(r, 'barcode').slice(0, 64) : '',
    };
    const key = norm(name);
    if (!name) row.error = "Nomi bo'sh";
    else if (name.length > 255) row.error = 'Nomi juda uzun';
    else if (!Number.isFinite(price) || price <= 0) row.error = "Narx noto'g'ri";
    else if (seen.has(key)) row.error = 'Takror nom';
    seen.add(key);
    return row;
  });
  return { rows, headerFound: !!detected };
};

export const MenuImportSheet: React.FC<{ open: boolean; onClose: () => void; onDone: () => void }> = ({ open, onClose, onDone }) => {
  const toast = useToast();
  const shop = isShop();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bases, setBases] = useState<BaseCategory[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [headerFound, setHeaderFound] = useState(true);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || bases) return;
    catalogApi
      .getBaseCategories(String(getPartner()?.partner_type || ''))
      .then(setBases)
      .catch((err) => setError(getErrorMessage(err, "Turkumlarni yuklab bo'lmadi.")));
  }, [open, bases]);

  const reset = () => {
    setRows(null);
    setFileName('');
    setMapping({});
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      const sheet = await readSpreadsheet(file);
      if (!sheet.length) throw new SheetError("Fayl bo'sh.");
      const parsed = toRows(sheet, shop);
      if (parsed.rows.length > 1000) throw new SheetError("Bir martada ko'pi bilan 1000 ta qator. Faylni bo'lib yuklang.");
      // Fayldagi kategoriya nomi → MilliyGo turkumi (nomi bir xil bo'lsa o'zi moslanadi)
      const byName = new Map((bases || []).map((b) => [norm(b.name), b.uuid]));
      const auto: Record<string, string> = {};
      for (const r of parsed.rows) {
        const key = norm(r.categoryName);
        if (!(key in auto)) auto[key] = byName.get(key) || '';
      }
      setRows(parsed.rows);
      setHeaderFound(parsed.headerFound);
      setMapping(auto);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof SheetError ? err.message : "Faylni o'qib bo'lmadi. Excel (.xlsx) yoki CSV fayl tanlang.");
    } finally {
      setReading(false);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const r of rows || []) {
      if (r.error) continue;
      const key = norm(r.categoryName);
      const g = m.get(key) || { label: r.categoryName || 'Kategoriya ko‘rsatilmagan', count: 0 };
      g.count++;
      m.set(key, g);
    }
    return Array.from(m.entries()).map(([key, g]) => ({ key, ...g }));
  }, [rows]);

  const valid = (rows || []).filter((r) => !r.error);
  const invalid = (rows || []).filter((r) => r.error);
  const unmapped = groups.filter((g) => !mapping[g.key]);

  const template = () => {
    const cats = (bases || []).map((b) => b.name);
    const c1 = cats[0] || (shop ? 'Sut mahsulotlari' : 'Issiq taomlar');
    const c2 = cats[1] || c1;
    downloadCsv(
      shop ? 'mahsulotlar-shablon.csv' : 'menyu-shablon.csv',
      shop
        ? [
            ['Nomi', 'Narxi', 'Kategoriya', 'Tavsif', 'Birlik', 'Shtrix-kod'],
            ['Sut 1 l', 12000, c1, '', 'dona', '4780000000017'],
            ["Go'sht (mol)", 110000, c2, '', 'kg', ''],
          ]
        : [
            ['Nomi', 'Narxi', 'Kategoriya', 'Tavsif'],
            ['Osh', 40000, c1, "To'y oshi, 1 porsiya"],
            ['Choy', 5000, c2, "Ko'k choy, choynak"],
          ],
    );
  };

  const submit = async () => {
    if (!valid.length || unmapped.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post('partner/menu-import/', {
        on_duplicate: updateExisting ? 'update' : 'skip',
        items: valid.map((r) => ({
          name: r.name,
          price: r.price,
          category: mapping[norm(r.categoryName)],
          description: r.description,
          unit: r.unit,
          barcode: r.barcode,
        })),
      });
      const d = res.data?.data || {};
      toast.success(
        [d.created && `${d.created} ta qo'shildi`, d.updated && `${d.updated} ta yangilandi`, d.skipped && `${d.skipped} ta o'tkazildi`]
          .filter(Boolean)
          .join(', ') || 'Import tugadi',
      );
      onDone();
      reset();
      onClose();
    } catch (err) {
      const rowErrors = (err as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors as { row: number; message: string }[] | undefined;
      if (Array.isArray(rowErrors) && rowErrors.length) {
        setError(rowErrors.slice(0, 5).map((e) => `${valid[e.row - 1]?.line ?? e.row}-qator: ${e.message}`).join(' · '));
      } else setError(getErrorMessage(err, "Import qilib bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      persistent={saving}
      size="lg"
      title={shop ? 'Mahsulotlarni Excel’dan yuklash' : 'Menyuni Excel’dan yuklash'}
      subtitle={rows ? fileName : 'Bir martada yuzlab taom — bittalab kiritish shart emas'}
      footer={
        rows ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={saving} onClick={reset}>
              Boshqa fayl
            </Button>
            <Button className="flex-1 min-w-[180px]" size="lg" loading={saving} disabled={!valid.length || unmapped.length > 0} onClick={submit}>
              {valid.length} ta {shop ? 'mahsulotni' : 'taomni'} yuklash
            </Button>
          </div>
        ) : undefined
      }
    >
      {!bases && !error ? (
        <LoadingState className="min-h-[30vh]" />
      ) : (
        <div className="space-y-4">
          {error && <InlineAlert>{error}</InlineAlert>}

          {!rows && (
            <>
              <ol className="space-y-2 text-[14px] text-ink list-decimal pl-5">
                <li>
                  Shablonni yuklab oling yoki o'z faylingizdan foydalaning. Ustunlar:{' '}
                  <b>Nomi, Narxi, Kategoriya, Tavsif</b>
                  {shop && <>, <b>Birlik</b> (dona/kg), <b>Shtrix-kod</b></>}. Birinchi qator — sarlavha.
                </li>
                <li>Excel'da to'ldirib saqlang (.xlsx yoki .csv).</li>
                <li>Faylni tanlang — yuklashdan oldin hammasini ko'rib chiqasiz.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={template}>
                  Shablon
                </Button>
                <Button icon={<Upload className="w-4 h-4" />} loading={reading} onClick={() => fileRef.current?.click()}>
                  Faylni tanlash
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => pick(e.target.files?.[0])}
                />
              </div>
              {bases && bases.length > 0 && (
                <p className="text-[12px] text-muted">
                  Turkumlar: {bases.map((b) => b.name).join(', ')}. Boshqacha nom yozsangiz — keyingi qadamda moslab qo'yasiz.
                </p>
              )}
            </>
          )}

          {rows && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success" dot>{valid.length} ta tayyor</Badge>
                {invalid.length > 0 && <Badge tone="danger" dot>{invalid.length} ta xato — o'tkazib yuboriladi</Badge>}
              </div>
              {!headerFound && (
                <InlineAlert tone="warning">
                  Sarlavha topilmadi — ustunlar tartib bo'yicha olindi: Nomi, Narxi, Kategoriya, Tavsif.
                </InlineAlert>
              )}

              {groups.length > 0 && (
                <div className="rounded-2xl border border-edge p-3 space-y-2">
                  <div className="text-[14px] font-bold text-ink">Kategoriyalar</div>
                  {groups.map((g) => (
                    <div key={g.key} className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[140px] text-[14px] text-ink">
                        {g.label} <span className="text-muted">· {g.count} ta</span>
                      </div>
                      <Select
                        aria-label={`${g.label} turkumi`}
                        containerClassName="flex-1 min-w-[180px]"
                        value={mapping[g.key] || ''}
                        error={!mapping[g.key] ? 'Turkumni tanlang' : null}
                        onChange={(e) => setMapping((m) => ({ ...m, [g.key]: e.target.value }))}
                      >
                        <option value="">Turkumni tanlang</option>
                        {(bases || []).map((b) => (
                          <option key={b.uuid} value={b.uuid}>{b.name}</option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              <div className="divide-y divide-edge">
                <SettingRow
                  title="Mavjud taomlarni yangilash"
                  description="Menyuda shu nomli taom bo'lsa — narxi va turkumi fayldagidek bo'ladi. O'chiq bo'lsa, ular o'tkazib yuboriladi."
                  control={<Switch checked={updateExisting} onChange={setUpdateExisting} label="Mavjudlarni yangilash" />}
                />
              </div>

              <ul className="rounded-2xl border border-edge divide-y divide-edge max-h-[40vh] overflow-y-auto">
                {rows.slice(0, 300).map((r) => (
                  <li key={r.line} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="w-8 text-muted tabular-nums">{r.line}</span>
                    <span className={`flex-1 min-w-0 truncate ${r.error ? 'text-muted line-through' : 'text-ink font-semibold'}`}>{r.name || '—'}</span>
                    {r.error ? (
                      <Badge tone="danger">{r.error}</Badge>
                    ) : (
                      <span className="tabular-nums text-ink">
                        {formatMoney(r.price)}
                        {r.unit === 'KG' ? ' / kg' : ''}
                      </span>
                    )}
                  </li>
                ))}
                {rows.length > 300 && <li className="px-3 py-2 text-[12px] text-muted">… yana {rows.length - 300} ta qator</li>}
              </ul>
              <p className="text-[12px] text-muted inline-flex items-center gap-1">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Rasmlarni keyin har bir taomga alohida qo'shasiz.
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
};
