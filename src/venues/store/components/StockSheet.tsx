import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Badge, Button, Input, Sheet, Switch, Tabs } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { inventoryApi, formatQty, STATE_META } from '../inventoryApi';
import type { InventoryRow } from '../inventoryApi';

type Mode = 'in' | 'out' | 'set';

const MODES: { value: Mode; label: string }[] = [
  { value: 'in', label: 'Kirim (+)' },
  { value: 'out', label: 'Chiqim (−)' },
  { value: 'set', label: 'Aniq qoldiq' },
];

/** Bitta mahsulot qoldig'ini tez o'zgartirish: kirim, chiqim (zarar/yaroqsiz) yoki sanoq natijasi. */
export const StockSheet: React.FC<{
  row: InventoryRow;
  filialUuid?: string;
  onClose: () => void;
  onSaved: (row: InventoryRow) => void;
}> = ({ row, filialUuid, onClose, onSaved }) => {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('in');
  const [value, setValue] = useState('');
  const [available, setAvailable] = useState(row.is_available);
  const [saving, setSaving] = useState(false);

  const kg = row.unit === 'KG';
  const num = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(num) && num >= 0 && (kg || Number.isInteger(num));
  const after = !valid ? null : mode === 'set' ? num : mode === 'in' ? row.quantity + num : row.quantity - num;
  const negative = after !== null && after < 0;
  const quick = kg ? [0.5, 1, 5, 10] : [1, 5, 10, 50];
  const dirty = (valid && !negative) || available !== row.is_available;

  const submit = async () => {
    setSaving(true);
    try {
      const body: Parameters<typeof inventoryApi.update>[1] = { filial: filialUuid };
      if (valid && !negative) {
        body.quantity = mode === 'out' ? -num : num;
        body.mode = mode === 'set' ? 'set' : 'add';
      }
      if (available !== row.is_available) body.is_available = available;
      const saved = await inventoryApi.update(row.uuid, body);
      toast.success('Qoldiq yangilandi');
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Qoldiqni saqlab bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      persistent={saving}
      title={row.name}
      subtitle={row.barcode ? `Shtrix-kod: ${row.barcode}` : row.brand || undefined}
      footer={
        <Button block size="lg" loading={saving} disabled={!dirty} onClick={submit}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-2xl bg-field p-4">
          <div>
            <div className="text-[13px] text-muted">Hozirgi qoldiq</div>
            <div className="text-[24px] font-black text-ink tracking-tightest">{formatQty(row.quantity, row.unit)}</div>
          </div>
          <Badge tone={STATE_META[row.state].tone}>{STATE_META[row.state].label}</Badge>
        </div>

        <Tabs value={mode} onChange={setMode} options={MODES} fill />

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Button variant="outline" size="lg" aria-label="Kamaytirish" onClick={() => setValue(String(Math.max(0, (Number(value) || 0) - (kg ? 0.5 : 1))))}>
              <Minus className="w-4 h-4" />
            </Button>
            <Input
              containerClassName="flex-1"
              label={mode === 'set' ? `Yangi qoldiq (${kg ? 'kg' : 'dona'})` : `Miqdor (${kg ? 'kg' : 'dona'})`}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kg ? '0.0' : '0'}
              error={value && !valid ? (kg ? "To'g'ri son kiriting" : 'Dona — butun son bo‘lishi kerak') : negative ? `Qoldiq yetmaydi (${row.quantity})` : null}
            />
            <Button variant="outline" size="lg" aria-label="Ko'paytirish" onClick={() => setValue(String((Number(value) || 0) + (kg ? 0.5 : 1)))}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {mode !== 'set' && (
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setValue(String(Number(((Number(value) || 0) + q).toFixed(3))))}
                  className="h-9 px-3 rounded-xl bg-surface border border-edge-strong text-[13px] font-bold hover:bg-field cursor-pointer"
                >
                  +{q}
                </button>
              ))}
            </div>
          )}
          {after !== null && !negative && (
            <div className="text-[14px] text-muted">
              Saqlangandan keyin: <b className="text-ink">{formatQty(after, row.unit)}</b>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-edge p-3.5">
          <div>
            <div className="text-[14px] font-bold text-ink">Sotuvda</div>
            <div className="text-[12px] text-muted">O'chirilsa mijozlarga «Tugagan» ko'rinadi</div>
          </div>
          <Switch checked={available} onChange={setAvailable} label="Sotuvda" />
        </div>
      </div>
    </Sheet>
  );
};
