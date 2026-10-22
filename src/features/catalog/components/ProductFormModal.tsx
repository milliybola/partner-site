import React, { useEffect, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button, Input, InlineAlert, Select, SettingRow, Sheet, Switch, Textarea } from '../../../core/ui';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import { wording } from '../../../core/lib/session';
import { filialApi } from '../../orders/services/filialApi';
import { catalogApi } from '../services/catalogApi';
import type { OptionGroupInput, ProductPackaging, ProductUnit } from '../services/catalogApi';
import { OptionGroupsEditor, groupsToRows, rowsToGroups, validateGroups } from './OptionGroupsEditor';
import type { GroupRow } from './OptionGroupsEditor';

export interface ProductData {
  uuid?: string;
  name: string;
  description: string;
  price: number;
  category: number | string; // numeric ID or UUID
  is_available: boolean;
  is_active: boolean;
  image_url?: string | null;
  stock?: number | null;
  /** Do'kon (supermarket): sotuv birligi, qadam, identifikatorlar va qadoqlar. */
  unit?: ProductUnit;
  step?: number;
  min_quantity?: number;
  barcode?: string;
  sku?: string;
  brand?: string;
  packagings?: ProductPackaging[];
  option_groups?: OptionGroupInput[];
}

/** Asosiy formadan tashqari saqlanadiganlar (do'kon): qadoqlar va filiallar bo'yicha qoldiq. */
export interface ProductExtras {
  packagings?: ProductPackaging[];
  stocks?: Array<{ filial: string; quantity: number }>;
  /** Restoran: variantlar (sous, o'lcham, qo'shimcha) */
  optionGroups?: OptionGroupInput[];
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Must throw on failure so the sheet stays open and shows the error. */
  onSave: (formData: FormData, extras?: ProductExtras) => Promise<void>;
  product?: ProductData | null;
  categories: Array<{ id: number | string; name: string; uuid: string }>;
  defaultCategoryId?: number | string;
  isShop?: boolean;
}

interface PackRow {
  key: string;
  uuid?: string;
  name: string;
  multiplier: string;
  price: string;
  barcode: string;
}

interface StockRow {
  filial: string;
  name: string;
  quantity: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const unitText = (u: ProductUnit) => (u === 'KG' ? 'kg' : 'dona');
let rowSeq = 0;
const nextKey = () => `r${++rowSeq}`;

const ProductFormModal: React.FC<ProductFormModalProps> = ({ isOpen, onClose, onSave, product, categories, defaultCategoryId, isShop }) => {
  const w = wording();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Do'kon (supermarket)
  const [unit, setUnit] = useState<ProductUnit>('PIECE');
  const [step, setStep] = useState('');
  const [minQty, setMinQty] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('');
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  // Restoran: variantlar (sous, o'lcham, qo'shimcha)
  const [groups, setGroups] = useState<GroupRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setGroups(groupsToRows(product?.option_groups));
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(product.price ? String(product.price) : '');
      setCategory(String(product.category ?? ''));
      setIsAvailable(product.is_available);
      setIsActive(product.is_active);
      setImagePreview(product.image_url || null);
      setUnit(product.unit === 'KG' ? 'KG' : 'PIECE');
      setStep(product.unit === 'KG' && product.step ? String(product.step) : '');
      setMinQty(product.unit === 'KG' && product.min_quantity ? String(product.min_quantity) : '');
      setBarcode(product.barcode || '');
      setSku(product.sku || '');
      setBrand(product.brand || '');
      setPacks(
        (product.packagings || []).map((k) => ({
          key: nextKey(),
          uuid: k.uuid,
          name: k.name,
          multiplier: String(k.multiplier),
          price: String(k.price),
          barcode: k.barcode || '',
        })),
      );
    } else {
      setName('');
      setDescription('');
      setPrice('');
      // BUGFIX: new products defaulted to the first category even when the user
      // was looking at another one.
      setCategory(String(defaultCategoryId ?? categories[0]?.id ?? ''));
      setIsAvailable(true);
      setIsActive(true);
      setImagePreview(null);
      setUnit('PIECE');
      setStep('');
      setMinQty('');
      setBarcode('');
      setSku('');
      setBrand('');
      setPacks([]);
    }
    setImageFile(null);
    setErrors({});
    setSubmitError(null);
    setSaving(false);
  }, [product, isOpen, categories, defaultCategoryId]);

  // Do'kon: filiallar ro'yxati va (tahrirlashda) hozirgi qoldiqlar
  useEffect(() => {
    if (!isOpen || !isShop) return;
    let cancelled = false;
    (async () => {
      setStockLoading(true);
      try {
        const filials = (await filialApi.getFilials()).filter((f) => f.filial_status === 'ACTIVE');
        const current = product?.uuid ? await catalogApi.getStock(product.uuid) : [];
        if (cancelled) return;
        const byFilial = new Map(current.map((s) => [s.filial, s.quantity]));
        setStocks(
          filials.map((f) => ({
            filial: f.uuid,
            name: f.filial_name,
            quantity: byFilial.has(f.uuid) ? String(byFilial.get(f.uuid)) : '0',
          })),
        );
      } catch {
        if (!cancelled) setStocks([]);
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isShop, product?.uuid]);

  // Revoke object URLs for picked files
  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((p) => ({ ...p, image: 'Faqat rasm fayllari (JPG, PNG, WEBP).' }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((p) => ({ ...p, image: "Rasm hajmi 5 MB dan oshmasligi kerak." }));
      return;
    }
    setErrors((p) => ({ ...p, image: '' }));
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const updatePack = (key: string, patch: Partial<PackRow>) =>
    setPacks((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nomini kiriting';
    const n = Number(price);
    if (!price || !Number.isFinite(n) || n <= 0) e.price = "Narx 0 dan katta bo'lishi kerak";
    if (!category) e.category = 'Turkumni tanlang';

    if (isShop) {
      if (unit === 'KG') {
        if (step && !(Number(step) > 0)) e.step = "Qadam 0 dan katta bo'lishi kerak";
        if (minQty && !(Number(minQty) > 0)) e.minQty = "Eng kam miqdor 0 dan katta bo'lishi kerak";
        if (step && minQty && Number(step) > 0) {
          const ratio = Number(minQty) / Number(step);
          if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
            e.minQty = 'Eng kam miqdor qadamga karrali bo‘lishi kerak (masalan 0.5 kg qadam bilan 0.5, 1, 1.5)';
          }
        }
      }
      const names = new Set<string>();
      for (const [i, row] of packs.entries()) {
        const label = `${i + 1}-qadoq`;
        const key = row.name.trim().toLowerCase();
        if (!key) e.packs = `${label}: nomini kiriting (masalan Quti)`;
        else if (names.has(key)) e.packs = `${label}: bunday nom allaqachon bor`;
        else if (!(Number(row.multiplier) > 0)) e.packs = `${label}: qadoqda nechta ${unitText(unit)} borligini kiriting`;
        else if (unit === 'PIECE' && !Number.isInteger(Number(row.multiplier))) e.packs = `${label}: dona soni butun bo‘lishi kerak`;
        else if (row.price === '' || !(Number(row.price) >= 0)) e.packs = `${label}: narxini kiriting`;
        names.add(key);
        if (e.packs) break;
      }
      for (const row of stocks) {
        const q = Number(row.quantity);
        if (row.quantity === '' || !Number.isFinite(q) || q < 0) e.stock = `«${row.name}»: qoldiq 0 yoki undan katta son bo‘lishi kerak`;
        else if (unit === 'PIECE' && !Number.isInteger(q)) e.stock = `«${row.name}»: dona hisobida qoldiq butun son bo‘lishi kerak`;
        if (e.stock) break;
      }
    }
    if (!isShop) {
      const groupError = validateGroups(groups);
      if (groupError) e.options = groupError;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (saving || !validate()) return;

    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('description', description.trim());
    formData.append('price', String(Math.round(Number(price))));
    formData.append('category', category);
    formData.append('is_available', String(isAvailable));
    formData.append('is_active', String(isActive));
    if (imageFile) formData.append('uploaded_images', imageFile);

    let extras: ProductExtras | undefined;
    if (isShop) {
      formData.append('unit', unit);
      if (unit === 'KG') {
        if (step) formData.append('step', step);
        if (minQty) formData.append('min_quantity', minQty);
      }
      formData.append('barcode', barcode.trim());
      formData.append('sku', sku.trim());
      formData.append('brand', brand.trim());
      extras = {
        packagings: packs.map((r, i) => ({
          uuid: r.uuid,
          name: r.name.trim(),
          multiplier: Number(r.multiplier),
          price: Math.round(Number(r.price)),
          barcode: r.barcode.trim(),
          order: i,
        })) as ProductPackaging[],
        stocks: stocks.map((r) => ({ filial: r.filial, quantity: Number(r.quantity) })),
      };
    } else {
      extras = { optionGroups: rowsToGroups(groups) };
    }

    setSaving(true);
    setSubmitError(null);
    try {
      await onSave(formData, extras);
      onClose();
    } catch (err) {
      // BUGFIX: the old modal closed immediately and swallowed save errors.
      setSubmitError(getErrorMessage(err, `${w.product}ni saqlashda xatolik yuz berdi.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      persistent={saving}
      size="md"
      title={product ? `${w.product}ni tahrirlash` : `Yangi ${w.product.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving} className="md:w-auto w-full">
            Bekor qilish
          </Button>
          <Button size="lg" onClick={() => handleSubmit()} loading={saving} className="md:w-auto w-full">
            Saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {submitError && <InlineAlert>{submitError}</InlineAlert>}

        {/* Image */}
        <div>
          <span className="block text-[13px] font-semibold text-ink mb-1.5">Rasm</span>
          <div className="flex items-center gap-4">
            <label className="relative w-28 h-28 rounded-2xl bg-field border-2 border-dashed border-edge-strong overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:border-brand/40">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-7 h-7 text-subtle" />
              )}
              <input type="file" onChange={handleImageChange} accept="image/*" className="sr-only" />
            </label>
            <div className="min-w-0 space-y-2">
              <label className="inline-flex items-center h-11 px-4 rounded-xl bg-field hover:bg-edge-strong text-[14px] font-bold text-ink cursor-pointer">
                {imagePreview ? 'Rasmni almashtirish' : 'Rasm tanlash'}
                <input type="file" onChange={handleImageChange} accept="image/*" className="sr-only" />
              </label>
              {imageFile && (
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(product?.image_url || null);
                  }}
                  className="flex items-center gap-1 text-[13px] font-semibold text-danger-ink"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Tanlovni bekor qilish
                </button>
              )}
              <p className="text-[12px] text-muted">JPG, PNG yoki WEBP, 5 MB gacha</p>
            </div>
          </div>
          {errors.image && <p className="mt-1.5 text-[12px] font-medium text-danger-ink">{errors.image}</p>}
        </div>

        <Input
          label="Nomi"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isShop ? 'Masalan: Coca-Cola 1 l' : 'Masalan: Lavash'}
          error={errors.name}
          maxLength={120}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={isShop ? `Narxi (so'm / 1 ${unitText(unit)})` : "Narxi (so'm)"}
            required
            type="number"
            inputMode="numeric"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="25000"
            error={errors.price}
            hint={price && Number(price) > 0 ? formatMoney(price) : undefined}
          />
          <Select label="Turkum" required value={category} onChange={(e) => setCategory(e.target.value)} error={errors.category}>
            <option value="" disabled>
              Turkumni tanlang
            </option>
            {categories.map((cat) => (
              <option key={cat.uuid} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Tavsif"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isShop ? 'Hajmi, ishlab chiqaruvchi...' : "Tarkibi: mol go'shti, pishloq, pomidor..."}
          rows={3}
        />

        {isShop && (
          <>
            {/* Sotuv birligi */}
            <div className="rounded-2xl border border-edge p-4 space-y-4">
              <div>
                <h3 className="text-[14px] font-extrabold text-ink">Sotuv birligi</h3>
                <p className="text-[12px] text-muted mt-0.5">Narx va qoldiq shu birlikda yuritiladi.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select label="Birlik" value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
                  <option value="PIECE">Dona</option>
                  <option value="KG">Kilogramm (tarozi)</option>
                </Select>
                {unit === 'KG' && (
                  <>
                    <Input
                      label="Qadam (kg)"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={step}
                      onChange={(e) => setStep(e.target.value)}
                      placeholder="0.1"
                      error={errors.step}
                      hint="Bitta bosishda qo'shiladigan miqdor"
                    />
                    <Input
                      label="Eng kam miqdor (kg)"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={minQty}
                      onChange={(e) => setMinQty(e.target.value)}
                      placeholder="0.1"
                      error={errors.minQty}
                    />
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="Shtrix-kod" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="4780001234567" maxLength={64} />
                <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="COLA-1L" maxLength={64} />
                <Input label="Brend" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Coca-Cola" maxLength={100} />
              </div>
            </div>

            {/* Qadoqlar */}
            <div className="rounded-2xl border border-edge p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-extrabold text-ink">Qadoqlar (quti, blok)</h3>
                  <p className="text-[12px] text-muted mt-0.5">
                    Masalan: 1 quti = 12 {unitText(unit)}. Qoldiq {unitText(unit)} hisobida yuritiladi, quti sotilsa 12 tasi ayriladi.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPacks((rows) => [...rows, { key: nextKey(), name: '', multiplier: '', price: '', barcode: '' }])}
                >
                  <Plus className="w-4 h-4" /> Qo‘shish
                </Button>
              </div>
              {packs.map((row) => (
                <div key={row.key} className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] gap-2 items-end">
                  <Input label="Nomi" value={row.name} onChange={(e) => updatePack(row.key, { name: e.target.value })} placeholder="Quti" maxLength={60} />
                  <Input
                    label={`Soni (${unitText(unit)})`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={unit === 'KG' ? '0.1' : '1'}
                    value={row.multiplier}
                    onChange={(e) => updatePack(row.key, { multiplier: e.target.value })}
                    placeholder="12"
                  />
                  <Input
                    label="Narxi (so'm)"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={row.price}
                    onChange={(e) => updatePack(row.key, { price: e.target.value.replace(/[^\d]/g, '') })}
                    placeholder="90000"
                  />
                  <button
                    type="button"
                    aria-label="Qadoqni o'chirish"
                    onClick={() => setPacks((rows) => rows.filter((r) => r.key !== row.key))}
                    className="h-11 w-11 flex items-center justify-center rounded-xl text-danger-ink hover:bg-danger-soft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {errors.packs && <p className="text-[12px] font-medium text-danger-ink">{errors.packs}</p>}
            </div>

            {/* Qoldiq */}
            <div className="rounded-2xl border border-edge p-4 space-y-3">
              <div>
                <h3 className="text-[14px] font-extrabold text-ink">Qoldiq ({unitText(unit)})</h3>
                <p className="text-[12px] text-muted mt-0.5">Har filialdagi ombor qoldig'i. 0 bo'lsa mijozga «Tugagan» ko'rinadi.</p>
              </div>
              {stockLoading ? (
                <p className="text-[13px] text-muted">Yuklanmoqda…</p>
              ) : stocks.length === 0 ? (
                <p className="text-[13px] text-muted">Faol filial topilmadi.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {stocks.map((row) => (
                    <Input
                      key={row.filial}
                      label={row.name}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={unit === 'KG' ? '0.1' : '1'}
                      value={row.quantity}
                      onChange={(e) =>
                        setStocks((rows) => rows.map((r) => (r.filial === row.filial ? { ...r, quantity: e.target.value } : r)))
                      }
                      placeholder="0"
                    />
                  ))}
                </div>
              )}
              {errors.stock && <p className="text-[12px] font-medium text-danger-ink">{errors.stock}</p>}
            </div>
          </>
        )}

        {!isShop && <OptionGroupsEditor rows={groups} onChange={setGroups} error={errors.options} />}

        <div className="rounded-2xl border border-edge px-4 divide-y divide-edge">
          <SettingRow
            title="Sotuvda bor"
            description="O'chirilsa, mijozlar buyurtma bera olmaydi (vaqtincha tugagan)"
            control={<Switch checked={isAvailable} onChange={setIsAvailable} label="Sotuvda bor" />}
          />
          <SettingRow
            title={`${w.menu}da ko'rinadi`}
            description="O'chirilsa, mahsulot mijoz ilovasida umuman ko'rinmaydi"
            control={<Switch checked={isActive} onChange={setIsActive} label="Faol" />}
          />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
};

export default ProductFormModal;
