import React, { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { ApiGap, Button, Input, InlineAlert, Select, SettingRow, Sheet, Switch, Textarea } from '../../../core/ui';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import { wording } from '../../../core/lib/session';

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
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Must throw on failure so the sheet stays open and shows the error. */
  onSave: (formData: FormData) => Promise<void>;
  product?: ProductData | null;
  categories: Array<{ id: number | string; name: string; uuid: string }>;
  defaultCategoryId?: number | string;
  isShop?: boolean;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

  useEffect(() => {
    if (!isOpen) return;
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(product.price ? String(product.price) : '');
      setCategory(String(product.category ?? ''));
      setIsAvailable(product.is_available);
      setIsActive(product.is_active);
      setImagePreview(product.image_url || null);
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
    }
    setImageFile(null);
    setErrors({});
    setSubmitError(null);
    setSaving(false);
  }, [product, isOpen, categories, defaultCategoryId]);

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

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nomini kiriting';
    const n = Number(price);
    if (!price || !Number.isFinite(n) || n <= 0) e.price = "Narx 0 dan katta bo'lishi kerak";
    if (!category) e.category = 'Turkumni tanlang';
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

    setSaving(true);
    setSubmitError(null);
    try {
      await onSave(formData);
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
            label="Narxi (so'm)"
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
          <div>
            <span className="block text-[13px] font-semibold text-ink mb-1.5">
              Qoldiq (ombordagi soni) <ApiGap className="ml-1" title="Mahsulot uchun stock/qoldiq maydoni backendda yo'q (products/ da stock field). API_GAPS.md" />
            </span>
            <div className="ui-input flex items-center text-subtle bg-field/60 cursor-not-allowed">
              {product?.stock !== undefined && product?.stock !== null ? `${product.stock} dona` : 'Backend qoldiqni qabul qilmaydi'}
            </div>
          </div>
        )}

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
