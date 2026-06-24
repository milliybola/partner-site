import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  ShoppingBag, 
  Eye,
  EyeOff,
  PlusCircle,
  AlertCircle,
  RefreshCw,
  Settings,
  FolderOpen
} from 'lucide-react';
import ProductFormModal from '../components/ProductFormModal';
import type { ProductData } from '../components/ProductFormModal';
import { STORAGE_KEYS } from '../../../core/config/constants';
import apiClient from '../../../core/api/client';

interface Product {
  uuid?: string;
  id?: number | string;
  name: string;
  description: string;
  price: number;
  category: number | string;
  is_available: boolean;
  is_active: boolean;
  image_url?: string;
}

interface Category {
  id: number | string;
  uuid: string;
  baseCategoryUuid?: string;
  name: string;
  is_active: boolean;
  products: Product[];
}

interface BaseCategory {
  uuid: string;
  name: string;
  logo: string | null;
  description: string;
}

const CatalogPage: React.FC = () => {
  const isManager = (() => {
    try {
      const partnerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA) || '{}');
      return partnerData.role === 'manager';
    } catch {
      return false;
    }
  })();

  const [categories, setCategories] = useState<Category[]>([]);
  const [baseCategories, setBaseCategories] = useState<BaseCategory[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'menu' | 'categories'>('menu');
  const [loading, setLoading] = useState(true);
  const [loadingBaseCats, setLoadingBaseCats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  const fetchCatalogData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const partnerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA) || '{}');
      const partnerUuid = partnerData.uuid;

      if (!partnerUuid) throw new Error("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");

      const catsResponse = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      
      const rawCats = catsResponse.data?.data?.categories || catsResponse.data?.categories || catsResponse.data?.data || catsResponse.data || [];
      
      const mappedCats: Category[] = Array.isArray(rawCats) ? rawCats.map((c: any) => ({
        id: c.id,
        uuid: c.uuid,
        baseCategoryUuid: c.category_details?.uuid || '',
        name: c.category_details?.name || c.name || "Nomi yo'q",
        is_active: !!c.is_active,
        products: Array.isArray(c.products) ? c.products.map((p: any) => ({
          id: p.id,
          uuid: p.uuid,
          category: p.category,
          name: p.name,
          description: p.description || '',
          price: parseFloat(p.price || '0'),
          is_available: !!p.is_available,
          is_active: !!p.is_active,
          image_url: p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null
        })) : []
      })) : [];

      setCategories(mappedCats);

      // Set first active category UUID
      if (mappedCats.length > 0) {
        const firstActive = mappedCats.find(c => c.is_active) || mappedCats[0];
        setActiveCategoryUuid(prev => {
          const stillExists = mappedCats.some(c => c.uuid === prev);
          return stillExists ? prev : (firstActive ? firstActive.uuid : '');
        });
      }
    } catch (err: any) {
      console.error("Failed to load catalog data:", err);
      setError(
        err.response?.data?.message || 
        err.message || 
        "Katalog ma'lumotlarini yuklashda xatolik yuz berdi. Internet aloqasini tekshiring."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBaseCategories = useCallback(async () => {
    setLoadingBaseCats(true);
    try {
      const partnerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA) || '{}');
      const partnerType = partnerData.partner_type || '';
      const response = await apiClient.get(`base-categories/?partner_type=${partnerType}`);
      const raw = response.data?.data?.categories || response.data?.categories || response.data?.data || response.data?.results || response.data || [];
      
      const mapped: BaseCategory[] = Array.isArray(raw) ? raw.map((e: any) => ({
        uuid: e.uuid,
        name: e.name,
        logo: e.logo || e.image_url || null,
        description: e.description || ''
      })) : [];
      setBaseCategories(mapped);
    } catch (err) {
      console.error("Failed to load base categories:", err);
    } finally {
      setLoadingBaseCats(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogData();
    if (!isManager) {
      fetchBaseCategories();
    }
  }, [fetchCatalogData, fetchBaseCategories, isManager]);

  useEffect(() => {
    if (isManager && activeTab === 'categories') {
      setActiveTab('menu');
    }
  }, [isManager, activeTab]);

  // Derived state
  const activeCategory = categories.find((c) => c.uuid === activeCategoryUuid) || categories[0] || null;
  const activeCategoryProducts = activeCategory ? activeCategory.products : [];

  const handleCategorySelect = (catUuid: string) => {
    setActiveCategoryUuid(catUuid);
  };

  // Toggle Category Activation / Association on Backend
  const handleToggleCategoryOnBackend = async (categoryUuidOrBaseUuid: string, isLinking: boolean) => {
    const linkedCat = categories.find(
      (c) => c.uuid === categoryUuidOrBaseUuid || c.baseCategoryUuid === categoryUuidOrBaseUuid
    );

    // Check if unlinking and category has products
    if (!isLinking) {
      if (linkedCat && linkedCat.products.length > 0) {
        alert("Ushbu turkumda taomlar bor. Uni o'chirishdan oldin undagi barcha taomlarni o'chirishingiz yoki boshqa turkumga o'tkazishingiz kerak.");
        return;
      }
    }

    const uuidToSend = linkedCat ? (linkedCat.baseCategoryUuid || linkedCat.uuid) : categoryUuidOrBaseUuid;

    try {
      await apiClient.post('partner/category/', {
        categories: [
          {
            uuid: uuidToSend,
            is_active: isLinking
          }
        ]
      });
      // Refresh local categories state
      await fetchCatalogData();
    } catch (err) {
      alert("Kategoriya holatini o'zgartirib bo'lmadi.");
    }
  };

  // Save Product (Create / Update)
  const handleSaveProduct = async (formDataOrData: any) => {
    try {
      const partnerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA) || '{}');
      
      if (selectedProduct) {
        // Edit API call
        await apiClient.put(`products/${selectedProduct.uuid}/`, formDataOrData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        // Create API call
        if (formDataOrData instanceof FormData) {
          formDataOrData.append('partner', partnerData.uuid);
        }
        await apiClient.post('products/', formDataOrData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      
      // Reload everything
      await fetchCatalogData();
    } catch (err) {
      alert("Taomni saqlashda xatolik yuz berdi.");
    }
  };

  // Toggle Product Availability
  const handleToggleAvailability = async (productUuid: string, currentVal: boolean) => {
    const nextVal = !currentVal;

    try {
      await apiClient.put(`products/${productUuid}/`, { is_available: nextVal });
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          products: c.products.map((p) =>
            p.uuid === productUuid ? { ...p, is_available: nextVal } : p
          )
        }))
      );
    } catch (err) {
      alert("Mavjudlik holatini o'zgartirib bo'lmadi.");
    }
  };

  // Delete Product
  const handleDeleteProduct = async (productUuid: string) => {
    if (!window.confirm("Haqiqatan ham bu taomni o'chirmoqchimisiz?")) return;

    try {
      await apiClient.delete(`products/${productUuid}/`);
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          products: c.products.filter((p) => p.uuid !== productUuid)
        }))
      );
    } catch (err) {
      alert("Taomni o'chirishda xatolik yuz berdi.");
    }
  };

  const formatUzS = (amount: number | string | null | undefined) => {
    const num = Number(amount);
    if (isNaN(num)) {
      return "0 UZS";
    }
    return num.toLocaleString('uz-UZ') + " UZS";
  };

  return (
    <div className="space-y-8 font-Outfit">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3 text-left">
            Katalog <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><ShoppingBag className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-left text-sm mt-1">Muassasa turkumlari, taomlar va menyuni boshqaring</p>
        </div>

        {activeTab === 'menu' && categories.length > 0 && (
          <button
            onClick={() => {
              setSelectedProduct(null);
              setProductModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/15 hover:shadow-brand/25 transition cursor-pointer self-start sm:self-auto hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            <span>Taom qo'shish</span>
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex gap-6 border-b border-white/5 pb-1">
        <button
          onClick={() => setActiveTab('menu')}
          className={`pb-3 text-sm font-bold border-b-2 transition duration-200 cursor-pointer flex items-center gap-2 ${
            activeTab === 'menu'
              ? 'text-brand border-brand font-extrabold'
              : 'text-slate-400 border-transparent hover:text-slate-300'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Mening menyu taomlarim</span>
        </button>
        
        {!isManager && (
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 text-sm font-bold border-b-2 transition duration-200 cursor-pointer flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'text-brand border-brand font-extrabold'
                : 'text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Turkumlarni sozlash</span>
          </button>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center">
          <AlertCircle className="w-12 h-12 mb-3 animate-pulse" />
          <h4 className="font-bold text-white text-base mb-1">Xatolik yuz berdi</h4>
          <p className="text-sm max-w-sm mb-4 text-slate-400">{error}</p>
          <button
            onClick={() => {
              fetchCatalogData();
              fetchBaseCategories();
            }}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 justify-center mx-auto"
          >
            <RefreshCw className="w-4 h-4 animate-[spin_4s_linear_infinite]" />
            <span>Qayta urinish</span>
          </button>
        </div>
      ) : activeTab === 'menu' ? (
        // Tab 1: Menu List
        categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-darkCard/30 border border-dashed border-white/5 rounded-2xl">
            <Settings className="w-16 h-16 stroke-[1.2] mb-4 text-slate-600 animate-pulse" />
            <h3 className="font-bold text-white mb-2 text-lg">Faol turkumlar topilmadi</h3>
            <p className="text-sm px-6 text-center text-slate-400 max-w-md">
              {isManager
                ? "Sizda hali menyu turkumlari faol emas. Iltimos, tizim superadmini (restoran egasi) orqali menyu turkumlarini faollashtiring."
                : "Sizda hali menyu turkumlari faol emas. Taomlar qo'shishdan oldin menyuingizga mos turkumlarni sozlang."}
            </p>
            {!isManager && (
              <button
                onClick={() => setActiveTab('categories')}
                className="mt-6 flex items-center gap-2 px-5 py-3 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold transition cursor-pointer border border-brand/10"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Turkumlarni sozlash bo'limiga o'tish</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            {/* Left Side: Category List */}
            <div className="lg:col-span-1 p-5 rounded-2xl bg-darkCard border border-white/5 space-y-4">
              <h3 className="font-bold text-white text-base text-left">Sizning turkumlar</h3>
              
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.uuid}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition ${
                      activeCategory?.uuid === cat.uuid
                        ? 'bg-brand/5 border-brand text-white shadow-sm shadow-brand/5'
                        : 'bg-slate-900 border-white/5 text-slate-300 hover:border-white/10'
                    }`}
                  >
                    <button
                      onClick={() => handleCategorySelect(cat.uuid)}
                      className="flex-1 font-semibold text-sm truncate text-left cursor-pointer font-Outfit"
                    >
                      {cat.name}
                    </button>

                    {/* Quick switch to toggle Category active state */}
                    <button
                      onClick={() => !isManager && handleToggleCategoryOnBackend(cat.uuid, !cat.is_active)}
                      disabled={isManager}
                      className={`text-slate-400 transition p-0.5 ml-2 ${isManager ? 'cursor-default opacity-90' : 'hover:text-white cursor-pointer'}`}
                      title={isManager ? "Faqat ko'rish uchun" : (cat.is_active ? "O'chirish" : "Yoqish")}
                    >
                      {cat.is_active ? (
                        <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-md">Faol</span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-md">Yopiq</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Side: Products in Active Category */}
            <div className="lg:col-span-3 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-lg flex items-center gap-2 text-left">
                  <span>{activeCategory?.name || 'Turkum'}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-400 rounded-lg">
                    {activeCategoryProducts.length} ta taom
                  </span>
                </h3>
                {activeCategory && !activeCategory.is_active && (
                  <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/10 animate-pulse">
                    Ushbu turkum mijozlarga ko'rinmaydi (yopiq)
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="w-8 h-8 border-3 border-brand/20 border-t-brand rounded-full animate-spin" />
                </div>
              ) : activeCategoryProducts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {activeCategoryProducts.map((prod) => (
                    <div
                      key={prod.uuid}
                      className="rounded-2xl border border-white/5 bg-darkCard overflow-hidden hover:border-white/10 transition duration-200 flex flex-col justify-between"
                    >
                      {/* Image/Details */}
                      <div>
                        <div className="h-44 bg-slate-900 relative overflow-hidden flex items-center justify-center">
                          {prod.image_url ? (
                            <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                          ) : (
                            <ShoppingBag className="w-12 h-12 text-slate-600 stroke-[1.2]" />
                          )}
                          
                          {/* Availability status badge over image */}
                          <button
                            onClick={() => handleToggleAvailability(prod.uuid!, prod.is_available)}
                            className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                              prod.is_available
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20 shadow-sm shadow-emerald-500/10'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/20'
                            }`}
                          >
                            {prod.is_available ? "Sotuvda bor" : "Tugagan"}
                          </button>
                        </div>

                        <div className="p-4 space-y-2 text-left">
                          <h4 className="font-bold text-white text-base leading-tight truncate">{prod.name}</h4>
                          <p className="text-xs text-slate-400 line-clamp-2 min-h-8">
                            {prod.description || "Taom uchun tavsif berilmagan."}
                          </p>
                          <h5 className="font-bold text-brand text-lg pt-1">{formatUzS(prod.price)}</h5>
                        </div>
                      </div>

                      {/* Footer actions */}
                      <div className="p-4 border-t border-white/5 flex items-center justify-between bg-slate-900/30">
                        <span className="flex items-center gap-1">
                          {prod.is_active ? (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase">
                              <Eye className="w-3.5 h-3.5 text-brand" /> Faol
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 flex items-center gap-1 font-semibold uppercase">
                              <EyeOff className="w-3.5 h-3.5" /> No-faol
                            </span>
                          )}
                        </span>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedProduct(prod);
                              setProductModalOpen(true);
                            }}
                            className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:border-white/10 transition cursor-pointer"
                            title="Tahrirlash"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod.uuid!)}
                            className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition cursor-pointer"
                            title="O'chirish"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-darkCard/50 border border-dashed border-white/5 rounded-2xl">
                  <ShoppingBag className="w-16 h-16 stroke-[1.2] mb-3 text-slate-600" />
                  <h3 className="font-bold text-white mb-1">Turkumda taomlar yo'q</h3>
                  <p className="text-sm px-6 text-center">Bu turkumga hali hech qanday taom qo'shilmagan.</p>
                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setProductModalOpen(true);
                    }}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold transition cursor-pointer border border-brand/10"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Taom qo'shish</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        // Tab 2: Manage Categories (Unattached Categories)
        <div className="space-y-6">
          <div className="text-left max-w-2xl">
            <h3 className="font-bold text-white text-lg">Umumiy turkumlarni menyuga biriktirish</h3>
            <p className="text-slate-400 text-sm mt-1">
              Menyuingizda faollashtirmoqchi bo'lgan turkumlarni yoqing. Biriktirilgan turkumlar darhol menyu sahifasida namoyon bo'ladi.
            </p>
          </div>

          {loadingBaseCats ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-3 border-brand/20 border-t-brand rounded-full animate-spin" />
            </div>
          ) : baseCategories.length === 0 ? (
            <div className="text-slate-500 text-sm py-10">Tizimda umumiy kategoriyalar topilmadi.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 text-left">
              {baseCategories.map((baseCat) => {
                const linkedCat = categories.find((c) => c.baseCategoryUuid === baseCat.uuid || c.uuid === baseCat.uuid);
                const isLinked = !!linkedCat && linkedCat.is_active;
                const productCount = linkedCat ? linkedCat.products.length : 0;
                
                return (
                  <div 
                    key={baseCat.uuid}
                    className={`p-5 rounded-2xl border transition duration-200 flex flex-col justify-between h-44 bg-darkCard ${
                      isLinked 
                        ? 'border-brand/30 shadow-md shadow-brand/5' 
                        : 'border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex gap-4 items-start">
                      {/* Logo container */}
                      <div className="w-16 h-16 rounded-xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                        {baseCat.logo ? (
                          <img src={baseCat.logo} alt={baseCat.name} className="w-full h-full object-cover animate-fade-in" />
                        ) : (
                          <ShoppingBag className="w-6 h-6 text-slate-500" />
                        )}
                      </div>
                      
                      <div className="space-y-1 truncate flex-1">
                        <h4 className="font-bold text-white text-base truncate">{baseCat.name}</h4>
                        <p className="text-xs text-slate-400 line-clamp-2 pr-2 leading-relaxed whitespace-normal">
                          {baseCat.description || "Ushbu turkum uchun tavsif berilmagan."}
                        </p>
                        {isLinked && (
                          <span className="inline-block text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-md mt-1 animate-fade-in">
                            {productCount} ta taom biriktirilgan
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Toggle switch for linking category */}
                    <div className="flex items-center justify-between border-t border-white/5 pt-3.5 mt-2">
                      <span className="text-xs text-slate-400 font-semibold font-Outfit">
                        {isLinked ? 'Sizning menyuda faol' : 'Menyuga qo\'shilmagan'}
                      </span>
                      
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryOnBackend(baseCat.uuid, !isLinked)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isLinked ? 'bg-brand shadow-md shadow-brand/20' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                            isLinked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Forms Modal */}
      <ProductFormModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        onSave={handleSaveProduct}
        product={selectedProduct}
        categories={categories.map((c) => ({ id: c.id, name: c.name, uuid: c.uuid }))}
      />
    </div>
  );
};

export default CatalogPage;
