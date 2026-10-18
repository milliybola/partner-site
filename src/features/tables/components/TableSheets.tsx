import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Download, Edit, Power, Trash2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button, InlineAlert, Input, Select, Sheet, Switch, Tabs, Textarea, SettingRow } from '../../../core/ui';
import { getErrorMessage } from '../../../core/lib/errors';
import { tablesApi } from '../services/tablesApi';
import type { TableModel, TableStatus } from '../services/tablesApi';
import type { PartnerFilial } from '../../orders/services/filialApi';

export const TABLE_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Bo'sh",
  OCCUPIED: 'Band',
  RESERVED: 'Rezerv',
};

/* ------------------------------------------------------------ Add / Edit */
export const TableFormSheet: React.FC<{
  open: boolean;
  table: TableModel | null;
  defaultOrder: number;
  isManager: boolean;
  filials: PartnerFilial[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, table, defaultOrder, isManager, filials, onClose, onSaved }) => {
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [status, setStatus] = useState<TableStatus>('AVAILABLE');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [filialUuid, setFilialUuid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTableNumber(table?.table_number || '');
    setCapacity(String(table?.capacity ?? 4));
    setStatus(table?.status || 'AVAILABLE');
    setNotes(table?.notes || '');
    setIsActive(table?.is_active ?? true);
    setDisplayOrder(String(table?.display_order ?? defaultOrder));
    setFilialUuid(table?.filial_uuid || '');
  }, [open, table, defaultOrder]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    const cap = Number(capacity);
    if (!tableNumber.trim()) return setError('Stol raqami yoki nomi majburiy.');
    if (!Number.isFinite(cap) || cap < 1 || cap > 100) return setError("Sig'im 1 dan 100 gacha son bo'lishi kerak.");
    setSaving(true);
    try {
      const payload: Partial<TableModel> = {
        table_number: tableNumber.trim(),
        capacity: cap,
        status,
        notes,
        is_active: isActive,
        display_order: Number(displayOrder) || 0,
        filial_uuid: isManager ? undefined : filialUuid || undefined,
      };
      if (table) await tablesApi.updateTable(table.uuid, payload);
      else await tablesApi.createTable(payload);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Stol ma'lumotlarini saqlashda xatolik."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      persistent={saving}
      title={table ? `Stol ${table.table_number}` : "Yangi stol qo'shish"}
      subtitle={table ? "Ma'lumotlarni tahrirlash" : undefined}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving} className="md:w-auto w-full">
            Bekor qilish
          </Button>
          <Button size="lg" loading={saving} onClick={() => submit()} className="md:w-auto w-full">
            {table ? 'Saqlash' : "Qo'shish"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        <Input
          label="Stol nomi / raqami"
          required
          autoFocus
          placeholder="Masalan: 1, VIP-2, A1"
          value={tableNumber}
          onChange={(e) => setTableNumber(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Sig'im (kishi)"
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <Input
            label="Tartib raqami"
            type="number"
            inputMode="numeric"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            hint="Ro'yxatdagi o'rni"
          />
        </div>
        <Select label="Holat" value={status} onChange={(e) => setStatus(e.target.value as TableStatus)}>
          <option value="AVAILABLE">Bo'sh</option>
          <option value="OCCUPIED">Band</option>
          <option value="RESERVED">Rezerv qilingan</option>
        </Select>
        <Textarea
          label="Izoh / joylashuvi"
          rows={2}
          placeholder="Masalan: Terassada, deraza yonida"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {!isManager && (
          <Select label="Filial" value={filialUuid} onChange={(e) => setFilialUuid(e.target.value)}>
            <option value="">Filialni tanlang</option>
            {filials.map((f) => (
              <option key={f.uuid} value={f.uuid}>
                {f.filial_name} {f.is_main ? '(Asosiy)' : ''}
              </option>
            ))}
          </Select>
        )}
        <div className="rounded-2xl bg-field px-4">
          <SettingRow
            title="Faol"
            description="Faol stollar buyurtma yaratishda ko'rinadi"
            control={<Switch checked={isActive} onChange={setIsActive} label="Faol" />}
          />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
};

/* ----------------------------------------------------------- Bulk import */
type BulkRow = { table_number: string; capacity: number; notes?: string; is_active?: boolean };

export const BulkImportSheet: React.FC<{ open: boolean; onClose: () => void; onDone: () => void }> = ({ open, onClose, onDone }) => {
  const [method, setMethod] = useState<'generator' | 'raw'>('generator');
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState('1');
  const [end, setEnd] = useState('5');
  const [cap, setCap] = useState('4');
  const [raw, setRaw] = useState('1, 4\n2, 4\nVIP-1, 8, VIP kabina');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; failed: number; errors: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setResult(null);
    }
  }, [open]);

  const build = (): BulkRow[] => {
    const rows: BulkRow[] = [];
    if (method === 'generator') {
      const s = parseInt(start, 10);
      const e = parseInt(end, 10);
      const c = parseInt(cap, 10);
      if (isNaN(s) || isNaN(e) || s > e || s < 1) throw new Error("Boshlang'ich va yakuniy raqamlar noto'g'ri.");
      if (e - s > 200) throw new Error("Bir martada 200 tadan ko'p stol yaratib bo'lmaydi.");
      if (isNaN(c) || c < 1 || c > 100) throw new Error("Sig'im 1 dan 100 gacha bo'lishi kerak.");
      for (let i = s; i <= e; i++) rows.push({ table_number: `${prefix}${i}`, capacity: c, is_active: true });
    } else {
      raw.split('\n').forEach((line, idx) => {
        if (!line.trim()) return;
        const parts = line.split(',');
        if (parts.length < 2) throw new Error(`${idx + 1}-qator: stol nomi va sig'imi vergul bilan ajratilishi kerak.`);
        const num = parts[0].trim();
        const c = parseInt(parts[1].trim(), 10);
        if (!num) throw new Error(`${idx + 1}-qator: stol nomi bo'sh.`);
        if (isNaN(c) || c < 1 || c > 100) throw new Error(`${idx + 1}-qator: sig'im 1 dan 100 gacha bo'lishi kerak.`);
        rows.push({ table_number: num, capacity: c, notes: parts.slice(2).join(',').trim() || undefined, is_active: true });
      });
    }
    if (!rows.length) throw new Error('Import qilinadigan stollar topilmadi.');
    return rows;
  };

  let preview: BulkRow[] = [];
  let previewError: string | null = null;
  try {
    preview = build();
  } catch (e: any) {
    previewError = e.message;
  }

  const submit = async () => {
    setError(null);
    setResult(null);
    let rows: BulkRow[];
    try {
      rows = build();
    } catch (e: any) {
      setError(e.message);
      return;
    }
    setSaving(true);
    try {
      const res = await tablesApi.bulkImportTables({ tables: rows });
      const created = Number(res?.created ?? 0);
      const failed = Number(res?.failed ?? 0);
      const errors = Array.isArray(res?.errors) ? res.errors.map(String) : [];
      // BUGFIX: partial failures (res.errors) were silently dropped before.
      if (failed > 0 || errors.length) {
        setResult({ created, failed, errors });
        if (created > 0) onDone();
      } else if (res?.success === false) {
        setError(res.message || 'Import qilishda xatolik.');
      } else {
        onDone();
        onClose();
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Stollarni import qilishda xatolik.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      persistent={saving}
      title="Ko'plab stol qo'shish"
      subtitle="Bir vaqtda bir nechta stol yarating"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving} className="md:w-auto w-full">
            Yopish
          </Button>
          <Button size="lg" loading={saving} onClick={submit} disabled={!!previewError} className="md:w-auto w-full">
            {preview.length ? `${preview.length} ta stol qo'shish` : "Qo'shish"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Tabs
          fill
          value={method}
          onChange={setMethod}
          options={[
            { value: 'generator', label: 'Generator' },
            { value: 'raw', label: 'Matn (CSV)' },
          ]}
        />
        {error && <InlineAlert>{error}</InlineAlert>}
        {result && (
          <InlineAlert tone={result.created > 0 ? 'warning' : 'danger'}>
            <div className="font-bold">
              {result.created} ta qo'shildi, {result.failed} ta xato
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[13px]">
                {result.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </InlineAlert>
        )}
        {method === 'generator' ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Prefiks" placeholder="VIP-" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              <Input label="Boshi" type="number" inputMode="numeric" min={1} value={start} onChange={(e) => setStart(e.target.value)} />
              <Input label="Oxiri" type="number" inputMode="numeric" min={1} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <Input label="Sig'im (har bir stol)" type="number" inputMode="numeric" min={1} max={100} value={cap} onChange={(e) => setCap(e.target.value)} />
          </>
        ) : (
          <Textarea
            label="Stollar ro'yxati"
            hint="Har qatorda: stol_nomi, sig'im, izoh (ixtiyoriy)"
            rows={6}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="font-mono"
          />
        )}
        <div className="rounded-2xl bg-field p-3">
          <div className="text-[12px] font-bold text-muted mb-2">Ko'rib chiqish</div>
          {previewError ? (
            <div className="text-[13px] text-danger-ink">{previewError}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {preview.slice(0, 30).map((r, i) => (
                <span key={i} className="h-7 px-2 rounded-lg bg-surface border border-edge text-[12px] font-bold inline-flex items-center">
                  {r.table_number} · {r.capacity}
                </span>
              ))}
              {preview.length > 30 && <span className="text-[12px] text-muted self-center">+{preview.length - 30}</span>}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
};

/* -------------------------------------------------------------- QR code */
export const QrSheet: React.FC<{ open: boolean; onClose: () => void; url: string; fileName: string }> = ({ open, onClose, url, fileName }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const download = () => {
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileName}-qr-code.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError('QR-kodni yuklab olishda xatolik yuz berdi.');
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title="Menyu QR-kodi"
      subtitle="Mijozlar skanerlab menyuga o'tadi"
      footer={
        <Button size="lg" block icon={<Download className="w-4 h-4" />} onClick={download}>
          PNG yuklab olish
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2">
        {error && <InlineAlert>{error}</InlineAlert>}
        <div className="p-4 bg-white rounded-2xl border border-edge">
          <QRCodeCanvas ref={canvasRef} value={url} size={240} level="M" marginSize={0} bgColor="#ffffff" fgColor="#111111" title="Menyu QR-kodi" />
        </div>
        <div className="text-[12px] text-muted break-all text-center">{url}</div>
      </div>
    </Sheet>
  );
};

/* -------------------------------------------------- Per-table action menu */
export const TableActionsSheet: React.FC<{
  table: TableModel | null;
  onClose: () => void;
  onEdit: (t: TableModel) => void;
  onToggleActive: (t: TableModel) => void;
  onDelete: (t: TableModel) => void;
  onOpenOrder: (t: TableModel) => void;
}> = ({ table, onClose, onEdit, onToggleActive, onDelete, onOpenOrder }) => {
  const active = table?.is_active !== false;
  const row = 'w-full flex items-center gap-3 h-14 px-4 rounded-2xl text-[15px] font-bold cursor-pointer';
  return (
    <Sheet open={!!table} onClose={onClose} size="sm" title={table ? `Stol ${table.table_number}` : ''} subtitle={table ? TABLE_STATUS_LABEL[table.status] : ''}>
      {table && (
        <div className="space-y-2 pb-2">
          <button type="button" className={`${row} bg-brand text-white justify-center`} onClick={() => onOpenOrder(table)}>
            <CheckCircle className="w-5 h-5" /> {table.current_order ? 'Buyurtmani ochish' : 'Buyurtma yaratish'}
          </button>
          <button type="button" className={`${row} bg-field text-ink`} onClick={() => onEdit(table)}>
            <Edit className="w-5 h-5 text-muted" /> Tahrirlash
          </button>
          <button type="button" className={`${row} bg-field text-ink`} onClick={() => onToggleActive(table)}>
            <Power className="w-5 h-5 text-muted" /> {active ? 'Nofaol qilish' : 'Faollashtirish'}
          </button>
          <button type="button" className={`${row} bg-danger-soft text-danger-ink`} onClick={() => onDelete(table)}>
            <Trash2 className="w-5 h-5" /> O'chirish
          </button>
        </div>
      )}
    </Sheet>
  );
};
