import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, Pencil, Plus, Settings2, ShoppingBag, Trash2 } from 'lucide-react';
import ProductFormModal from '../components/ProductFormModal';
import type { ProductData, ProductExtras } from '../components/ProductFormModal';
import { catalogApi } from '../services/catalogApi';
import type { BaseCategory, CatalogCategory, CatalogProduct } from '../services/catalogApi';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  SearchInput,
  SkeletonList,
  Switch,
  Tabs,
} from '../../../core/ui';
import { getPartner, isManager as isManagerFn, isShop as isShopFn, wording } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';

type View = 'menu' | 'categories';

const promoLabel = (p: CatalogProduct) => {
  const pr = p.promotion;
  if (!pr) return null;
  if (pr.label) return pr.label;
  if (pr.buy_quantity && pr.get_quantity) return `${pr.buy_quantity}+${pr.get_quantity}`;
  return null;
};

/* ------------------------------------------------------------ Product card */
const ProductCard: React.FC<{
  product: CatalogProduct;
  isShop: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ product, isShop, busy, onToggle, onEdit, onDelete }) => {
  const promo = promoLabel(product);
  return (
    <div className={`bg-surface border border-edge rounded-2xl p-3 flex gap-3 ${!product.is_available ? 'bg-surface2' : ''}`}>
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-field overflow-hidden shrink-0 flex items-center justify-center">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            className={`w-full h-full object-cover ${!product.is_available ? 'grayscale opacity-60' : ''}`}
          />
        ) : (
          <ShoppingBag className="w-7 h-7 text-subtle" />
        )}
        {promo && (
          <span className="absolute top-1 left-1 h-5 px-1.5 rounded-md bg-gold text-ink text-[11px] font-black flex items-center">{promo}</span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-[15px] font-bold text-ink leading-snug line-clamp-2">{product.name}</h4>
            {product.description && <p className="text-[12px] text-muted line-clamp-1 mt-0.5">{product.description}</p>}
          </div>
          <div className="flex -mr-1.5 -mt-1.5 shrink-0">
            <IconButton label="Tahrirlash" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </IconButton>
            <IconButton label="O'chirish" variant="danger-soft" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        </div>

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[16px] font-black text-ink tracking-tightest">
              {formatMoney(product.price)}
              {isShop && product.unit === 'KG' && <span className="text-[12px] font-semibold text-muted"> / kg</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {!product.is_active && <Badge>Yashirin</Badge>}
              {isShop && product.stock !== null && product.stock !== undefined && (
                <Badge tone={product.stock > 0 ? 'neutral' : 'danger'}>
                  {product.stock > 0 ? `Qoldiq: ${product.stock} ${product.unit === 'KG' ? 'kg' : 'dona'}` : 'Tugagan'}
                </Badge>
              )}
              {isShop && product.packagings && product.packagings.length > 0 && (
                <Badge>{product.packagings.map((k) => k.name).join(', ')}</Badge>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none min-h-[44px]">
            <span className={`text-[12px] font-bold ${product.is_available ? 'text-brand' : 'text-danger-ink'}`}>
              {product.is_available ? 'Sotuvda' : 'Tugagan'}
            </span>
            <Switch checked={product.is_available} onChange={onToggle} disabled={busy} label="Sotuvda bor" />
          </label>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- Page */
const CatalogPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const partner = getPartner();
  const isManager = isManagerFn(partner);
  const isShop = isShopFn(partner);
  const w = wording(partner);

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [baseCategories, setBaseCategories] = useState<BaseCategory[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('');
  const [view, setView] = useState<View>('menu');
  const [loading, setLoading] = useState(true);
  const [loadingBaseCats, setLoadingBaseCats] = useState(false);
  const [baseCatsError, setBaseCatsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyUuids, setBusyUuids] = useState<Set<string>>(new Set());
  const [togglingCats, setTogglingCats] = useState<Set<string>>(new Set());

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  const fetchCatalogData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const partnerUuid = getPartner()?.uuid;
      if (!partnerUuid) throw new Error("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");
      const mapped = await catalogApi.getCategories(partnerUuid);
      setCategories(mapped);
      setActiveCategoryUuid((prev) => {
        if (mapped.some((c) => c.uuid === prev)) return prev;
        return (mapped.find((c) => c.is_active) || mapped[0])?.uuid || '';
      });
    } catch (err) {
      setError(getErrorMessage(err, `${w.menu} ma'lumotlarini yuklashda xatolik yuz berdi.`));
    } finally {
      setLoading(false);
    }
  }, [w.menu]);

  const fetchBaseCategories = useCallback(async () => {
    setLoadingBaseCats(true);
    setBaseCatsError(null);
    try {
      setBaseCategories(await catalogApi.getBaseCategories(String(getPartner()?.partner_type || '')));
    } catch (err) {
      // BUGFIX: errors here used to be silently logged and showed "no categories".
      setBaseCatsError(getErrorMessage(err, "Umumiy turkumlarni yuklab bo'lmadi."));
    } finally {
      setLoadingBaseCats(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogData();
    if (!isManager) fetchBaseCategories();
  }, [fetchCatalogData, fetchBaseCategories, isManager]);

  const activeCategory = categories.find((c) => c.uuid === activeCategoryUuid) || categories[0] || null;
  const q = search.trim().toLowerCase();

  // When searching, search across all categories; otherwise show the active one.
  const visibleProducts = useMemo(() => {
    if (q) {
      return categories.flatMap((c) =>
        c.products.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
      );
    }
    return activeCategory?.products || [];
  }, [q, categories, activeCategory]);

  const totalProducts = categories.reduce((a, c) => a + c.products.length, 0);
  const unavailableCount = categories.reduce((a, c) => a + c.products.filter((p) => !p.is_available).length, 0);

  /* --------------------------------------------------------- category link */
  const handleToggleCategory = async (categoryUuidOrBaseUuid: string, isLinking: boolean) => {
    const linkedCat = categories.find((c) => c.uuid === categoryUuidOrBaseUuid || c.baseCategoryUuid === categoryUuidOrBaseUuid);
    if (!isLinking && linkedCat && linkedCat.products.length > 0) {
      toast.error(`Bu turkumda ${linkedCat.products.length} ta ${w.product.toLowerCase()} bor. Avval ularni o'chiring yoki boshqa turkumga o'tkazing.`);
      return;
    }
    const uuidToSend = linkedCat ? linkedCat.baseCategoryUuid || linkedCat.uuid : categoryUuidOrBaseUuid;
    setTogglingCats((s) => new Set(s).add(categoryUuidOrBaseUuid));
    try {
      await catalogApi.setCategoryActive(uuidToSend, isLinking);
      await fetchCatalogData(true);
      toast.success(isLinking ? 'Turkum menyuga qo‘shildi' : 'Turkum menyudan olindi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Turkum holatini o'zgartirib bo'lmadi."));
    } finally {
      setTogglingCats((s) => {
        const n = new Set(s);
        n.delete(categoryUuidOrBaseUuid);
        return n;
      });
    }
  };

  /* --------------------------------------------------------------- product */
  const handleSaveProduct = async (formData: FormData, extras?: ProductExtras) => {
    let uuid = selectedProduct?.uuid;
    if (uuid) {
      await catalogApi.updateProduct(uuid, formData);
      toast.success('Saqlandi');
    } else {
      const partnerUuid = getPartner()?.uuid;
      if (partnerUuid) formData.append('partner', partnerUuid);
      uuid = await catalogApi.createProduct(formData);
      toast.success(`${w.product} qo'shildi`);
    }
    // Do'kon: qadoqlar va filiallar bo'yicha qoldiq alohida endpointlarga saqlanadi. Mahsulotning o'zi
    // allaqachon saqlangan, shuning uchun bu yerdagi xato oynani yopmaydi, balki aniq aytiladi (qayta
    // saqlash takroriy mahsulot yaratmasin).
    if (extras && uuid) {
      try {
        if (extras.packagings && (extras.packagings.length > 0 || selectedProduct?.uuid)) await catalogApi.savePackagings(uuid, extras.packagings);
        if (extras.stocks && extras.stocks.length > 0) await catalogApi.saveStock(uuid, extras.stocks);
        // Variantlar: tahrirlashda bo'sh ro'yxat ham yuboriladi (hammasi o'chirilgan bo'lishi mumkin)
        if (extras.optionGroups && (extras.optionGroups.length > 0 || selectedProduct?.uuid)) await catalogApi.saveOptionGroups(uuid, extras.optionGroups);
      } catch (err) {
        toast.error(getErrorMessage(err, `${w.product} saqlandi, lekin qadoq/qoldiq/variantlar saqlanmadi. Tahrirlab qayta urinib ko'ring.`));
      }
    }
    await fetchCatalogData(true);
  };

  const setBusy = (uuid: string, on: boolean) =>
    setBusyUuids((s) => {
      const n = new Set(s);
      if (on) n.add(uuid);
      else n.delete(uuid);
      return n;
    });

  const patchProduct = (uuid: string, patch: Partial<CatalogProduct>) =>
    setCategories((prev) => prev.map((c) => ({ ...c, products: c.products.map((p) => (p.uuid === uuid ? { ...p, ...patch } : p)) })));

  const handleToggleAvailability = async (product: CatalogProduct) => {
    if (!product.uuid) return;
    const next = !product.is_available;
    setBusy(product.uuid, true);
    patchProduct(product.uuid, { is_available: next }); // optimistic
    try {
      await catalogApi.setAvailability(product.uuid, next);
    } catch (err) {
      patchProduct(product.uuid, { is_available: !next });
      toast.error(getErrorMessage(err, "Mavjudlik holatini o'zgartirib bo'lmadi."));
    } finally {
      setBusy(product.uuid, false);
    }
  };

  const handleDeleteProduct = async (product: CatalogProduct) => {
    if (!product.uuid) return;
    const ok = await confirm(`"${product.name}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`, {
      title: `${w.product}ni o'chirish`,
      danger: true,
      confirmText: "O'chirish",
    });
    if (!ok) return;
    try {
      await catalogApi.deleteProduct(product.uuid);
      setCategories((prev) => prev.map((c) => ({ ...c, products: c.products.filter((p) => p.uuid !== product.uuid) })));
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(getErrorMessage(err, `${w.product}ni o'chirishda xatolik yuz berdi.`));
    }
  };

  const openCreate = () => {
    setSelectedProduct(null);
    setProductModalOpen(true);
  };

  const openEdit = (p: CatalogProduct) => {
    setSelectedProduct({ ...p });
    setProductModalOpen(true);
  };

  const canAddProduct = categories.length > 0;

  /* ----------------------------------------------------------------- render */
  const header = (
    <PageHeader
      title={w.menu}
      subtitle={
        loading ? 'Yuklanmoqda...' : `${totalProducts} ta ${w.product.toLowerCase()}${unavailableCount ? ` · ${unavailableCount} ta tugagan` : ''}`
      }
      actions={
        view === 'menu' && canAddProduct ? (
          <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate} className="hidden md:inline-flex">
            {w.product} qo'shish
          </Button>
        ) : null
      }
    >
      {!isManager && (
        <Tabs<View>
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'menu', label: w.menu, icon: <FolderOpen className="w-4 h-4" /> },
            { value: 'categories', label: 'Turkumlarni sozlash', icon: <Settings2 className="w-4 h-4" /> },
          ]}
        />
      )}
    </PageHeader>
  );

  if (error) {
    return (
      <div>
        {header}
        <ErrorState
          message={error}
          onRetry={() => {
            fetchCatalogData();
            if (!isManager) fetchBaseCategories();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      {header}

      {view === 'menu' ? (
        loading ? (
          <SkeletonList rows={5} className="mt-2" />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={<Settings2 className="w-7 h-7" />}
            title="Faol turkumlar yo'q"
            description={
              isManager
                ? "Menyu turkumlari hali yoqilmagan. Muassasa egasidan turkumlarni faollashtirishni so'rang."
                : `${w.products} qo'shishdan oldin menyuga mos turkumlarni yoqing.`
            }
            action={!isManager ? <Button onClick={() => setView('categories')}>Turkumlarni sozlash</Button> : undefined}
          />
        ) : (
          <div className="md:grid md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr] md:gap-6 md:items-start">
            {/* Desktop category list */}
            <aside className="hidden md:block sticky top-[calc(var(--appbar-h)+130px)] bg-surface border border-edge rounded-2xl p-2 max-h-[calc(100vh-220px)] overflow-y-auto">
              {categories.map((cat) => {
                const active = !q && activeCategory?.uuid === cat.uuid;
                return (
                  <button
                    key={cat.uuid}
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setActiveCategoryUuid(cat.uuid);
                    }}
                    className={`w-full flex items-center justify-between gap-2 h-11 px-3 rounded-xl text-left text-[14px] font-semibold cursor-pointer ${
                      active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-field'
                    }`}
                  >
                    <span className={`truncate ${!cat.is_active ? 'text-subtle' : ''}`}>{cat.name}</span>
                    <span className={`text-[12px] font-bold tabular-nums ${active ? 'text-brand' : 'text-muted'}`}>{cat.products.length}</span>
                  </button>
                );
              })}
            </aside>

            <section className="min-w-0">
              <SearchInput value={search} onChange={setSearch} placeholder={`${w.product} qidirish...`} className="mb-3" />

              {/* Mobile category chips */}
              {!q && (
                <div
                  className="md:hidden sticky z-10 -mx-4 px-4 py-2 bg-canvas/95 backdrop-blur"
                  style={{ top: `calc(var(--appbar-h) + ${isManager ? 70 : 116}px)` }}
                >
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {categories.map((cat) => {
                      const active = activeCategory?.uuid === cat.uuid;
                      return (
                        <button
                          key={cat.uuid}
                          type="button"
                          onClick={() => setActiveCategoryUuid(cat.uuid)}
                          className={`shrink-0 h-10 px-3.5 rounded-full text-[14px] font-bold whitespace-nowrap cursor-pointer ${
                            active ? 'bg-ink text-white' : 'bg-surface border border-edge text-ink'
                          } ${!cat.is_active && !active ? 'text-subtle' : ''}`}
                        >
                          {cat.name}
                          <span className={`ml-1.5 text-[12px] ${active ? 'text-white/70' : 'text-muted'}`}>{cat.products.length}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 my-2">
                <h2 className="text-[17px] font-extrabold tracking-tightest truncate">
                  {q ? `Qidiruv natijalari (${visibleProducts.length})` : activeCategory?.name}
                </h2>
                {!q && activeCategory && !activeCategory.is_active && <Badge tone="danger">Mijozlarga ko'rinmaydi</Badge>}
              </div>

              {visibleProducts.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag className="w-7 h-7" />}
                  title={q ? 'Hech narsa topilmadi' : `Bu turkumda ${w.products.toLowerCase()} yo'q`}
                  description={q ? "Boshqa so'z bilan qidirib ko'ring." : undefined}
                  action={!q ? <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>{w.product} qo'shish</Button> : undefined}
                />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                  {visibleProducts.map((p) => (
                    <ProductCard
                      key={p.uuid}
                      product={p}
                      isShop={isShop}
                      busy={!!p.uuid && busyUuids.has(p.uuid)}
                      onToggle={() => handleToggleAvailability(p)}
                      onEdit={() => openEdit(p)}
                      onDelete={() => handleDeleteProduct(p)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )
      ) : (
        /* --------------------------------------------- Category settings */
        <div className="space-y-3">
          <p className="text-[14px] text-muted max-w-2xl">
            Menyuingizda ko'rinadigan turkumlarni yoqing. Ichida {w.products.toLowerCase()} bor turkumni o'chirishdan oldin ularni o'chiring.
          </p>
          {loadingBaseCats ? (
            <SkeletonList rows={6} />
          ) : baseCatsError ? (
            <ErrorState message={baseCatsError} onRetry={fetchBaseCategories} />
          ) : baseCategories.length === 0 ? (
            <EmptyState title="Umumiy turkumlar topilmadi" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {baseCategories.map((baseCat) => {
                const linkedCat = categories.find((c) => c.baseCategoryUuid === baseCat.uuid || c.uuid === baseCat.uuid);
                const isLinked = !!linkedCat && linkedCat.is_active;
                const productCount = linkedCat ? linkedCat.products.length : 0;
                return (
                  <div
                    key={baseCat.uuid}
                    className={`bg-surface border rounded-2xl p-3 flex items-center gap-3 ${isLinked ? 'border-brand/30' : 'border-edge'}`}
                  >
                    <div className="w-14 h-14 rounded-xl bg-field overflow-hidden flex items-center justify-center shrink-0">
                      {baseCat.logo ? (
                        <img src={baseCat.logo} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingBag className="w-6 h-6 text-subtle" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[15px] font-bold text-ink truncate">{baseCat.name}</h4>
                      <p className="text-[12px] text-muted truncate">
                        {isLinked ? `Menyuda · ${productCount} ta ${w.product.toLowerCase()}` : baseCat.description || "Menyuga qo'shilmagan"}
                      </p>
                    </div>
                    <Switch
                      checked={isLinked}
                      disabled={togglingCats.has(baseCat.uuid)}
                      onChange={() => handleToggleCategory(baseCat.uuid, !isLinked)}
                      label={baseCat.name}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mobile primary action */}
      {view === 'menu' && canAddProduct && !loading && (
        <button
          type="button"
          onClick={openCreate}
          aria-label={`${w.product} qo'shish`}
          className="md:hidden fixed right-4 bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+16px)] z-30 h-14 pl-4 pr-5 rounded-2xl bg-brand text-white font-extrabold text-[15px] shadow-pop flex items-center gap-2 active:bg-brand-dark"
        >
          <Plus className="w-5 h-5" /> {w.product}
        </button>
      )}

      <ProductFormModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        onSave={handleSaveProduct}
        product={selectedProduct}
        isShop={isShop}
        defaultCategoryId={activeCategory?.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name, uuid: c.uuid }))}
      />
    </div>
  );
};

export default CatalogPage;
