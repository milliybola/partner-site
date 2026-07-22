import React, { useState, useEffect } from 'react';
import { X, Upload, Check } from 'lucide-react';

export interface ProductData {
  uuid?: string;
  name: string;
  description: string;
  price: number;
  category: number | string; // numeric ID or UUID
  is_available: boolean;
  is_active: boolean;
  image_url?: string;
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: FormData | ProductData) => void;
  product?: ProductData | null;
  categories: Array<{ id: number | string; name: string; uuid: string }>;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  product,
  categories,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [category, setCategory] = useState<number | string>('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(product.price);
      setCategory(product.category || '');
      setIsAvailable(product.is_available);
      setIsActive(product.is_active);
      setImagePreview(product.image_url || null);
    } else {
      setName('');
      setDescription('');
      setPrice(0);
      setCategory(categories[0]?.id || '');
      setIsAvailable(true);
      setIsActive(true);
      setImagePreview(null);
    }
    setImageFile(null);
  }, [product, isOpen, categories]);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;
    if (price <= 0) return;
    if (!category) return;



    // Build FormData for multipart request
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('price', price.toString());
    formData.append('category', category.toString());
    formData.append('is_available', isAvailable.toString());
    formData.append('is_active', isActive.toString());
    if (imageFile) {
      formData.append('uploaded_images', imageFile);
    }

    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-darkCard border border-edge-strong w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-[fade-in_0.25s_ease-out] text-left">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-edge bg-slate-900/50">
          <h3 className="font-bold text-ink text-lg">
            {product ? "Taomni Tahrirlash" : "Yangi Taom Qo'shish"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-ink transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Image Upload box */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Taom Rasmi</label>
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 rounded-xl bg-slate-900 border border-edge-strong overflow-hidden flex items-center justify-center shrink-0">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Upload className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div className="flex-1">
                <label className="inline-flex items-center px-4 py-2 rounded-xl bg-overlay border border-edge-strong hover:bg-overlay-strong text-xs font-semibold text-ink transition cursor-pointer">
                  <span>Rasm tanlash</span>
                  <input type="file" onChange={handleImageChange} accept="image/*" className="hidden" />
                </label>
                <p className="text-slate-500 text-[10px] mt-1.5 uppercase">Formatlar: JPG, PNG. Maksimal: 5MB</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Nomi</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-edge-strong text-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition"
                placeholder="Masalan: Lavash MilliyGo"
                required
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Narxi (UZS)</label>
              <input
                type="number"
                value={price || ''}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-edge-strong text-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition"
                placeholder="25000"
                min="0"
                required
              />
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Turkum (Kategoriya)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-edge-strong text-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition cursor-pointer"
              required
            >
              <option value="" disabled>Kategoriyani tanlang</option>
              {categories.map((cat) => (
                <option key={cat.uuid} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Tavsif (Description)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-edge-strong text-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition h-20 resize-none"
              placeholder="Masalan: Mol go'shti, pishloq, pomidor, maxsus sous..."
            />
          </div>

          {/* Switches (Available & Active) */}
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-300 select-none">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand/30"
              />
              <div>
                <p>Mavjud</p>
                <p className="text-[10px] text-slate-500">Mijozlar buyurtma bera olishi</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-300 select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand/30"
              />
              <div>
                <p>Faol</p>
                <p className="text-[10px] text-slate-500">Menyuda ko'rinishi</p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-edge flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-transparent hover:bg-overlay border border-edge text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-bold shadow-lg shadow-brand/10 transition cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductFormModal;
