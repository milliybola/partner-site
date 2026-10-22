import React, { useEffect, useMemo, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button, Field, InlineAlert, Input, Sheet, SettingRow, Switch, Textarea } from '../../../core/ui';
import { formatMoney } from '../../../core/lib/format';
import { getErrorMessage, isMissingEndpoint } from '../../../core/lib/errors';
import { useToast } from '../../../core/components/ToastProvider';
import { wording } from '../../../core/lib/session';
import { ProductPicker } from './ProductPicker';
import { promotionsApi } from '../services/promotionsApi';
import type { CatalogProduct, ComboSet, SetPayload } from '../services/promotionsApi';

export const BACKEND_NOT_READY_MSG =
  "Backend hali tayyor emas: bu funksiya serverda ishga tushirilgach saqlash mumkin bo'ladi.";

export const SetEditorSheet: React.FC<{
  open: boolean;
  initial: ComboSet | null;
  products: CatalogProduct[];
  productsLoading: boolean;
  productsError: string | null;
  onRetryProducts: () => void;
  onClose: () => void;
  onSaved: (s: ComboSet) => void;
}> = ({ open, initial, products, productsLoading, productsError, onRetryProducts, onClose, onSaved }) => {
  const toast = useToast();
  const w = wording();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setDescription(initial?.description || '');
    setPrice(initial?.price !== undefined && initial?.price !== null ? String(initial.price) : '');
    const q: Record<string, number> = {};
    (initial?.items || []).forEach((it) => {
      if (it.product) q[it.product] = Math.max(1, it.quantity || 1);
    });
    setQuantities(q);
    setIsActive(initial?.is_active ?? true);
    setImageFile(null);
    setImagePreview(initial?.image || null);
    setErrors({});
  }, [open, initial]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const selectedItems = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => qty > 0),
    [quantities],
  );
  const productByUuid = useMemo(() => new Map(products.map((p) => [p.uuid, p])), [products]);

  // Sum of real catalog prices; items whose product is no longer in the catalog are excluded.
  const compositionTotal = useMemo(
    () => selectedItems.reduce((sum, [uuid, qty]) => sum + (productByUuid.get(uuid)?.price || 0) * qty, 0),
    [selectedItems, productByUuid],
  );
  const missingProducts = selectedItems.filter(([uuid]) => !productByUuid.has(uuid)).length;
  const priceNum = parseInt(price.replace(/\s/g, ''), 10);
  const savingsPct =
    compositionTotal > 0 && priceNum > 0 && priceNum < compositionTotal
      ? Math.round(((compositionTotal - priceNum) / compositionTotal) * 100)
      : 0;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Set nomini kiriting';
    if (!priceNum || priceNum <= 0) e.price = "Narx musbat butun son bo'lishi kerak";
    const totalQty = selectedItems.reduce((s, [, q]) => s + q, 0);
    if (selectedItems.length === 0) e.items = `Kamida bitta ${w.product.toLowerCase()} tanlang`;
    else if (totalQty < 2) e.items = "Set kamida 2 dona mahsulotdan iborat bo'lishi kerak";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    const payload: SetPayload = {
      name: name.trim(),
      description: description.trim(),
      price: priceNum,
      items: selectedItems.map(([product, quantity]) => ({ product, quantity })),
      is_active: isActive,
    };
    setSaving(true);
    try {
      const saved = initial?.uuid
        ? await promotionsApi.updateSet(initial.uuid, payload, imageFile)
        : await promotionsApi.createSet(payload, imageFile);
      toast.success(initial?.uuid ? 'Set yangilandi' : "Set qo'shildi");
      onSaved(saved);
    } catch (err) {
      toast.error(isMissingEndpoint(err) ? BACKEND_NOT_READY_MSG : getErrorMessage(err, "Setni saqlab bo'lmadi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      persistent={saving}
      size="lg"
      title={initial?.uuid ? 'Setni tahrirlash' : 'Yangi set'}
      subtitle="Bir nechta mahsulotni bitta narxda sotish"
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
        {/* Image */}
        <Field label="Rasm" hint="Ixtiyoriy. Kvadrat rasm tavsiya etiladi.">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-field overflow-hidden flex items-center justify-center shrink-0">
              {imagePreview ? <img src={imagePreview} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-subtle" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center justify-center h-11 px-4 rounded-xl bg-field text-ink text-[14px] font-bold cursor-pointer hover:bg-edge-strong">
                Rasm tanlash
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </label>
              {imageFile && (
                <Button variant="ghost" icon={<X className="w-4 h-4" />} onClick={() => { setImageFile(null); setImagePreview(initial?.image || null); }}>
                  Olib tashlash
                </Button>
              )}
            </div>
          </div>
        </Field>

        <Input label="Set nomi" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Oilaviy set" error={errors.name} />
        <Textarea
          label="Tavsif"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="2 ta lavash, 2 ta kartoshka fri, 1 litr cola"
          rows={2}
        />

        {/* Composition */}
        <Field label={`Tarkibi (${w.products.toLowerCase()})`} required error={errors.items}>
          <ProductPicker
            mode="quantity"
            products={products}
            loading={productsLoading}
            error={productsError}
            onRetry={onRetryProducts}
            quantities={quantities}
            onQuantityChange={(uuid, qty) => setQuantities((prev) => ({ ...prev, [uuid]: qty }))}
            productWord={w.product}
          />
        </Field>

        {missingProducts > 0 && (
          <InlineAlert tone="warning">
            {missingProducts} ta mahsulot menyuda topilmadi (o'chirilgan bo'lishi mumkin). Ular tarkib narxiga kiritilmagan.
          </InlineAlert>
        )}

        {/* Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Set narxi (so'm)"
            required
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="89000"
            error={errors.price}
          />
          <div className="rounded-2xl bg-field px-4 py-3">
            <div className="text-[12px] text-muted">Tarkib narxi (menyu bo'yicha)</div>
            <div className="text-[18px] font-black text-ink tracking-tightest">{formatMoney(compositionTotal)}</div>
            {savingsPct > 0 ? (
              <div className="text-[13px] font-bold text-brand">Mijoz {savingsPct}% tejaydi</div>
            ) : priceNum > 0 && compositionTotal > 0 && priceNum >= compositionTotal ? (
              <div className="text-[13px] font-bold text-warning-ink">Set narxi tarkib narxidan arzon emas</div>
            ) : null}
          </div>
        </div>

        <SettingRow
          className="border-t border-edge"
          title="Faol"
          description="O'chirilgan set mijozlarga ko'rinmaydi"
          control={<Switch checked={isActive} onChange={setIsActive} label="Faol" />}
        />
      </div>
    </Sheet>
  );
};
