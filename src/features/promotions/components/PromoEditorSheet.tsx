import React, { useEffect, useMemo, useState } from 'react';
import { ApiGap, Button, Field, Input, QtyStepper, Sheet, SettingRow, Switch } from '../../../core/ui';
import { fromBackendDate, toBackendDate } from '../../../core/lib/format';
import { getErrorMessage, isMissingEndpoint } from '../../../core/lib/errors';
import { useToast } from '../../../core/components/ToastProvider';
import { wording } from '../../../core/lib/session';
import { ProductPicker } from './ProductPicker';
import { BACKEND_NOT_READY_MSG } from './SetEditorSheet';
import { calcBuyXGetY, promotionsApi } from '../services/promotionsApi';
import type { CatalogProduct, Promotion, PromotionPayload } from '../services/promotionsApi';

type Preset = '1+1' | '2+1' | 'custom';

const presetOf = (buy: number, get: number): Preset => (get === 1 && buy === 1 ? '1+1' : get === 1 && buy === 2 ? '2+1' : 'custom');

export const PromoEditorSheet: React.FC<{
  open: boolean;
  initial: Promotion | null;
  products: CatalogProduct[];
  productsLoading: boolean;
  productsError: string | null;
  onRetryProducts: () => void;
  onClose: () => void;
  onSaved: (p: Promotion) => void;
}> = ({ open, initial, products, productsLoading, productsError, onRetryProducts, onClose, onSaved }) => {
  const toast = useToast();
  const w = wording();
  const [buy, setBuy] = useState(1);
  const [get, setGet] = useState(1);
  const [preset, setPreset] = useState<Preset>('1+1');
  const [selected, setSelected] = useState<string[]>([]);
  const [sameProduct, setSameProduct] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const b = initial?.buy_quantity ?? 1;
    const g = initial?.get_quantity ?? 1;
    setBuy(b);
    setGet(g);
    setPreset(presetOf(b, g));
    setSelected(Array.isArray(initial?.products) ? initial!.products! : []);
    setSameProduct(initial?.same_product ?? true);
    setIsActive(initial?.is_active ?? true);
    setStartDate(fromBackendDate(initial?.start_date));
    setEndDate(fromBackendDate(initial?.end_date));
    setErrors({});
  }, [open, initial]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === '1+1') { setBuy(1); setGet(1); }
    if (p === '2+1') { setBuy(2); setGet(1); }
  };

  const exampleQty = buy + get >= 4 ? (buy + get) * 2 + 1 : 7;
  const preview = useMemo(() => calcBuyXGetY(exampleQty, buy, get), [exampleQty, buy, get]);

  const toggle = (uuid: string) =>
    setSelected((prev) => (prev.includes(uuid) ? prev.filter((x) => x !== uuid) : [...prev, uuid]));

  const validate = () => {
    const e: Record<string, string> = {};
    if (buy < 1) e.qty = "Sotib olinadigan miqdor kamida 1 bo'lishi kerak";
    if (get < 1) e.qty = "Bepul miqdor kamida 1 bo'lishi kerak";
    if (selected.length === 0) e.products = `Kamida bitta ${w.product.toLowerCase()} tanlang`;
    if (startDate && endDate && startDate > endDate) e.dates = "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    const payload: PromotionPayload = {
      type: 'BUY_X_GET_Y',
      buy_quantity: buy,
      get_quantity: get,
      products: selected,
      same_product: sameProduct,
      is_active: isActive,
      start_date: startDate ? toBackendDate(startDate) : null,
      end_date: endDate ? toBackendDate(endDate) : null,
    };
    setSaving(true);
    try {
      const saved = initial?.uuid
        ? await promotionsApi.updatePromotion(initial.uuid, payload)
        : await promotionsApi.createPromotion(payload);
      toast.success(initial?.uuid ? 'Aksiya yangilandi' : "Aksiya qo'shildi");
      onSaved(saved);
    } catch (err) {
      toast.error(isMissingEndpoint(err) ? BACKEND_NOT_READY_MSG : getErrorMessage(err, "Aksiyani saqlab bo'lmadi"));
    } finally {
      setSaving(false);
    }
  };

  const chip = (p: Preset, label: string) => (
    <button
      key={p}
      type="button"
      onClick={() => applyPreset(p)}
      aria-pressed={preset === p}
      className={`h-12 flex-1 rounded-2xl text-[16px] font-black tracking-tightest cursor-pointer transition ${
        preset === p ? 'bg-gold text-ink' : 'bg-field text-ink hover:bg-edge-strong'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      persistent={saving}
      size="lg"
      title={initial?.uuid ? 'Aksiyani tahrirlash' : 'Yangi aksiya'}
      subtitle="«X ta olsa — Y ta bepul» turidagi aksiya"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving} className="md:w-auto w-full">
            Bekor qilish
          </Button>
          <Button size="lg" onClick={save} loading={saving} className="md:w-auto w-full">
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Aksiya turi" required error={errors.qty}>
          <div className="flex gap-2">
            {chip('1+1', '1+1')}
            {chip('2+1', '2+1')}
            {chip('custom', 'Boshqa')}
          </div>
        </Field>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sotib oladi (X)">
              <QtyStepper value={buy} onChange={setBuy} min={1} max={20} />
            </Field>
            <Field label="Bepul oladi (Y)">
              <QtyStepper value={get} onChange={setGet} min={1} max={20} />
            </Field>
          </div>
        )}

        {/* Live preview of the shared calc rule */}
        <div className="rounded-2xl bg-gold-soft px-4 py-3">
          <div className="text-[12px] font-bold uppercase tracking-wider text-gold-ink">Misol</div>
          <div className="text-[16px] font-extrabold text-ink tracking-tightest mt-0.5">
            {exampleQty} ta olsa: {preview.pay} ta to'laydi, {preview.free} ta bepul
          </div>
          <div className="text-[12px] text-gold-ink mt-1">
            Har {buy + get} tadan {get} tasi bepul. Yakuniy hisobni server qayta hisoblaydi.
          </div>
        </div>

        <Field label={`Qaysi ${w.products.toLowerCase()}ga amal qiladi`} required error={errors.products} hint={selected.length ? `${selected.length} ta tanlandi` : undefined}>
          <ProductPicker
            mode="select"
            products={products}
            loading={productsLoading}
            error={productsError}
            onRetry={onRetryProducts}
            selected={selected}
            onToggle={toggle}
            productWord={w.product}
          />
        </Field>

        <SettingRow
          className="border-t border-edge"
          title="Bepul mahsulot — xuddi shu mahsulot"
          description="Masalan: 1 ta lavash olsa, 1 ta lavash bepul"
          control={<Switch checked={sameProduct} onChange={setSameProduct} label="Xuddi shu mahsulot" />}
        />
        {!sameProduct && (
          <ApiGap
            block
            title="Kontraktda (API_CONTRACT_SETS_PROMOS.md) bepul beriladigan boshqa mahsulotni tanlash maydoni yo'q (masalan free_products). Hozircha server qaysi mahsulot bepul ekanini o'zi belgilaydi."
          >
            Bepul beriladigan boshqa mahsulotni tanlash hali API'da yo'q
          </ApiGap>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input type="date" label="Boshlanish" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" label="Tugash" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {errors.dates && <p className="text-[12px] font-medium text-danger-ink -mt-2">{errors.dates}</p>}

        <SettingRow
          className="border-t border-edge"
          title="Faol"
          description="O'chirilgan aksiya mijozlarga ko'rinmaydi"
          control={<Switch checked={isActive} onChange={setIsActive} label="Faol" />}
        />
      </div>
    </Sheet>
  );
};
