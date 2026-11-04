import React, { useState } from 'react';
import { Button, InlineAlert, Input, Select, Sheet } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { parseNum, UNIT_LABEL, UNIT_OPTIONS, warehouseApi } from '../warehouseApi';
import type { Ingredient, IngredientUnit } from '../warehouseApi';

/** Xom ashyo qo'shish / tahrirlash: nomi, birligi, tannarxi (1 birlik), kam qoldiq chegarasi. */
export const IngredientSheet: React.FC<{
  ingredient: Ingredient | null; // null — yangi
  onClose: () => void;
  onSaved: () => void;
}> = ({ ingredient, onClose, onSaved }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(ingredient?.name || '');
  const [unit, setUnit] = useState<IngredientUnit>(ingredient?.unit || 'KG');
  const [cost, setCost] = useState(ingredient ? String(ingredient.cost_price || '') : '');
  const [minStock, setMinStock] = useState(ingredient?.min_stock ? String(ingredient.min_stock) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costNum = cost.trim() ? parseNum(cost) : 0;
  const minNum = minStock.trim() ? parseNum(minStock) : 0;
  const invalid = !name.trim() || !(costNum >= 0) || !(minNum >= 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), unit, cost_price: costNum, min_stock: minNum };
      if (ingredient) await warehouseApi.updateIngredient(ingredient.uuid, body);
      else await warehouseApi.createIngredient(body);
      toast.success(ingredient ? 'Saqlandi' : "Xom ashyo qo'shildi");
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Saqlab bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!ingredient) return;
    const ok = await confirm(`«${ingredient.name}» o'chirilsinmi? Harakatlar tarixi saqlanib qoladi.`, {
      title: "Xom ashyoni o'chirish",
      danger: true,
      confirmText: "O'chirish",
      cancelText: 'Orqaga',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await warehouseApi.deleteIngredient(ingredient.uuid);
      toast.success("O'chirildi");
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "O'chirib bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  const u = UNIT_LABEL[unit];
  return (
    <Sheet
      open
      onClose={onClose}
      persistent={saving}
      title={ingredient ? ingredient.name : 'Yangi xom ashyo'}
      subtitle="Go'sht, un, yog', idish — taom tayyorlashga ketadigan narsalar"
      footer={
        <div className="w-full flex flex-wrap gap-2">
          {ingredient && (
            <Button variant="danger-soft" size="lg" className="flex-1 min-w-[120px]" disabled={saving} onClick={remove}>
              O'chirish
            </Button>
          )}
          <Button type="submit" form="ingredient-form" size="lg" className="flex-[2] min-w-[160px]" loading={saving} disabled={invalid}>
            Saqlash
          </Button>
        </div>
      }
    >
      <form id="ingredient-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Input label="Nomi" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Mol go'shti" />
        <Select
          label="O'lchov birligi"
          value={unit}
          onChange={(e) => setUnit(e.target.value as IngredientUnit)}
          hint={ingredient ? "Harakatlari bor xom ashyoning birligini o'zgartirib bo'lmaydi" : undefined}
        >
          {UNIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={`Tannarx (1 ${u} uchun, so'm)`}
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
            error={!(costNum >= 0) ? "To'g'ri son kiriting" : null}
            hint="Kirim kiritilganda o'rtacha narx bo'yicha o'zi yangilanadi"
          />
          <Input
            label={`Kam qoldiq chegarasi (${u})`}
            inputMode="decimal"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            placeholder="0"
            error={!(minNum >= 0) ? "To'g'ri son kiriting" : null}
            hint="Qoldiq shundan oshmasa — «Kam qoldi»"
          />
        </div>
      </form>
    </Sheet>
  );
};
