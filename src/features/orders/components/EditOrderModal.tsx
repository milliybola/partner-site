import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Loader2, 
  ShoppingBag,
  X
} from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import apiClient from '../../../core/api/client';
import { STORAGE_KEYS } from '../../../core/config/constants';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';

interface EditOrderModalProps {
  orderUuid: string;
  orderNumber: string;
  onClose: (refresh: boolean) => void;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  orderUuid,
  orderNumber,
  onClose,
}) => {
  const toast = useToast();
  const confirm = useConfirm();
  // Edit states
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Catalog states
  const [catalogCategories, setCatalogCategories] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Fetch Order Items
  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    setItemsError(null);
    try {
      const response = await ordersApi.getOrderItems(orderUuid);
      const itemsList = Array.isArray(response) 
        ? response 
        : response.items 
        ? response.items 
        : response.data?.items 
        ? response.data.items 
        : response.data 
        ? (Array.isArray(response.data) ? response.data : [])
        : [];
      setItems(itemsList);
    } catch (err: any) {
      console.error("Failed to fetch order items:", err);
      setItemsError(
        err.response?.data?.message || 
        err.message || 
        "Buyurtma mahsulotlarini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoadingItems(false);
    }
  }, [orderUuid]);

  // Fetch Catalog Categories and Products
  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const partnerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA) || '{}');
      const partnerUuid = partnerData.uuid;
      if (!partnerUuid) return;

      const catsResponse = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      const rawCats = catsResponse.data?.data?.categories || catsResponse.data?.categories || catsResponse.data?.data || catsResponse.data || [];
      const mappedCats = Array.isArray(rawCats) ? rawCats.map((c: any) => ({
        uuid: c.uuid,
        name: c.category_details?.name || c.name || "Nomi yo'q",
        is_active: !!c.is_active,
        products: Array.isArray(c.products) ? c.products.map((p: any) => ({
          uuid: p.uuid,
          name: p.name,
          price: parseFloat(p.price || '0'),
          is_available: !!p.is_available && !!p.is_active,
        })) : []
      })) : [];
      setCatalogCategories(mappedCats.filter((c: any) => c.is_active));
    } catch (err) {
      console.error("Failed to load catalog in EditOrderModal:", err);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  // Initialize editing data
  useEffect(() => {
    fetchItems();
    fetchCatalog();
  }, [fetchItems, fetchCatalog]);

  // Update quantity handler
  const handleUpdateQuantity = async (itemUuid: string, newQuantity: number) => {
    setActionLoading(itemUuid);
    try {
      await ordersApi.updateOrderItemQuantity(orderUuid, itemUuid, { quantity: newQuantity });
      setHasChanges(true);
      await fetchItems();
    } catch (err: any) {
      console.error("Failed to update item quantity:", err);
      toast.error(err.response?.data?.message || err.message || "Miqdorni yangilashda xatolik yuz berdi.");
    } finally {
      setActionLoading(null);
    }
  };

  // Remove/Delete item handler
  const handleRemoveItem = async (itemUuid: string, currentQuantity: number) => {
    const ok = await confirm("Haqiqatan ham ushbu mahsulotni buyurtmadan o'chirmoqchimisiz?", { danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    setActionLoading(itemUuid);
    try {
      await ordersApi.removeOrderItems(orderUuid, { items: [{ item_uuid: itemUuid, quantity: currentQuantity }] });
      setHasChanges(true);
      await fetchItems();
    } catch (err: any) {
      console.error("Failed to remove item:", err);
      toast.error(err.response?.data?.message || err.message || "Mahsulotni o'chirishda xatolik yuz berdi.");
    } finally {
      setActionLoading(null);
    }
  };

  // Add catalog product handler
  const handleAddProduct = async (productUuid: string) => {
    setActionLoading(productUuid);
    try {
      await ordersApi.addOrderItems(orderUuid, { items: [{ product_uuid: productUuid, quantity: 1 }] });
      setHasChanges(true);
      await fetchItems();
    } catch (err: any) {
      console.error("Failed to add product:", err);
      toast.error(err.response?.data?.message || err.message || "Mahsulot qo'shishda xatolik yuz berdi.");
    } finally {
      setActionLoading(null);
    }
  };

  // Filter products by search query
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      // Return structured catalog
      return catalogCategories.map(cat => ({
        ...cat,
        products: cat.products.filter((p: any) => p.is_available)
      })).filter(cat => cat.products.length > 0);
    }

    // Return flat search result grouped in a single virtual category
    const foundProducts: any[] = [];
    catalogCategories.forEach(cat => {
      cat.products.forEach((p: any) => {
        if (p.is_available && p.name.toLowerCase().includes(query)) {
          foundProducts.push(p);
        }
      });
    });

    return foundProducts.length > 0 ? [{ name: "Qidiruv natijalari", products: foundProducts }] : [];
  }, [catalogCategories, catalogSearch]);

  const formatUzS = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return '0 UZS';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    return isNaN(num) ? '0 UZS' : num.toLocaleString('uz-UZ') + ' UZS';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-darkCard border border-edge-strong rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-left animate-[slideUp_0.3s_ease-out]"
      >
        {/* Header */}
        <div className="p-5 border-b border-edge flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-ink">Buyurtmani Tahrirlash</h3>
            <p className="text-xs text-slate-400 mt-0.5">Buyurtma: {orderNumber}</p>
          </div>
          <button
            onClick={() => onClose(hasChanges)}
            className="p-2 rounded-lg bg-overlay text-slate-400 hover:text-ink transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0">
          
          {/* Left side: Current items */}
          <div className="md:col-span-7 p-5 flex flex-col min-h-0 overflow-hidden border-b md:border-b-0 border-edge">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5 shrink-0">
              <ShoppingBag className="w-3.5 h-3.5 text-brand" />
              Buyurtma tarkibi
            </h4>

            {loadingItems ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-brand mb-2" />
                <span className="text-xs">Mahsulotlar yuklanmoqda...</span>
              </div>
            ) : itemsError ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium my-auto text-center font-bold">
                {itemsError}
              </div>
            ) : items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 border border-dashed border-edge rounded-xl text-slate-500 text-xs">
                Savat bo'sh. Mahsulot qo'shing.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {items.map((item, idx) => {
                  const itemUuid = item.uuid;
                  const productName = item.product_name || item.name || item.product?.name || "Noma'lum taom";
                  const productPrice = Number(item.price_at_time_of_order || item.product?.price || 0);
                  const quantity = item.quantity;
                  const isModifying = actionLoading === itemUuid;

                  return (
                    <div 
                      key={itemUuid || idx} 
                      className="p-3 bg-slate-900 border border-edge rounded-xl flex items-center justify-between gap-3 text-sm transition-all"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{productName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatUzS(productPrice)} x {quantity} = <span className="text-slate-200 font-medium">{formatUzS(productPrice * quantity)}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Decrease quantity */}
                        <button
                          onClick={() => {
                            if (quantity > 1) {
                              handleUpdateQuantity(itemUuid, quantity - 1);
                            } else {
                              handleRemoveItem(itemUuid, quantity);
                            }
                          }}
                          disabled={!!actionLoading}
                          className="p-1.5 rounded-lg bg-overlay hover:bg-overlay-strong text-slate-300 hover:text-ink transition disabled:opacity-50 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <span className="w-6 text-center font-bold text-ink text-xs">
                          {isModifying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto text-brand" />
                          ) : (
                            quantity
                          )}
                        </span>

                        {/* Increase quantity */}
                        <button
                          onClick={() => handleUpdateQuantity(itemUuid, quantity + 1)}
                          disabled={!!actionLoading}
                          className="p-1.5 rounded-lg bg-overlay hover:bg-overlay-strong text-slate-300 hover:text-ink transition disabled:opacity-50 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete completely */}
                        <button
                          onClick={() => handleRemoveItem(itemUuid, quantity)}
                          disabled={!!actionLoading}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50 cursor-pointer ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right side: Catalog addition */}
          <div className="md:col-span-5 p-5 border-t md:border-t-0 md:border-l border-edge flex flex-col min-h-0 overflow-hidden">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 shrink-0">Mahsulot qo'shish</h4>
            
            {/* Catalog Search */}
            <div className="relative mb-3 shrink-0">
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Taom qidirish..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-900 border border-edge text-ink placeholder-slate-500 text-xs focus:border-brand/40 focus:ring-1 focus:ring-brand/40 transition outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {loadingCatalog ? (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-brand mb-1.5" />
                <span className="text-[10px]">Katalog yuklanmoqda...</span>
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-8 border border-dashed border-edge rounded-xl text-slate-500 text-xs">
                Mahsulot topilmadi
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 animate-[fadeIn_0.2s_ease-out]">
                {filteredCatalog.map((cat, catIdx) => (
                  <div key={catIdx} className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
                      {cat.name}
                    </span>
                    <div className="space-y-1">
                      {cat.products.map((product: any) => {
                        const isAdding = actionLoading === product.uuid;
                        return (
                          <div 
                            key={product.uuid} 
                            className="p-2.5 bg-slate-900/60 hover:bg-slate-900 border border-edge hover:border-edge-strong rounded-xl flex items-center justify-between gap-2 text-xs transition"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-medium text-slate-200 truncate">{product.name}</p>
                              <p className="text-[10px] text-emerald-400 font-bold mt-0.5">{formatUzS(product.price)}</p>
                            </div>
                            <button
                              onClick={() => handleAddProduct(product.uuid)}
                              disabled={!!actionLoading}
                              className="px-2.5 py-1.5 rounded-lg bg-brand/10 hover:bg-brand text-brand hover:text-slate-950 border border-brand/20 hover:border-brand font-bold text-[10px] transition disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1"
                            >
                              {isAdding ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              Qo'shish
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-edge flex items-center justify-end bg-slate-900/40 shrink-0">
          <button
            onClick={() => onClose(hasChanges)}
            className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg shadow-brand/10"
          >
            Tugatish
          </button>
        </div>
      </div>
    </div>
  );
};
