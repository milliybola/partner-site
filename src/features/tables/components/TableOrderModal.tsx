import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  ShoppingBag,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  CreditCard,
  User,
  Phone as PhoneIcon,
  FolderOpen
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ordersApi } from '../../orders/services/ordersApi';
import { printReceipt as printReceiptUtil, printPreCheck as printPreCheckUtil } from '../../orders/utils/printing';
import apiClient from '../../../core/api/client';
import { STORAGE_KEYS } from '../../../core/config/constants';
import type { TableModel } from '../services/tablesApi';

interface Product {
  uuid: string;
  name: string;
  description: string;
  price: number;
  original_price: number;
  discount: number;
  is_available: boolean;
  image_url?: string | null;
}

interface Category {
  uuid: string;
  name: string;
  is_active: boolean;
  products: Product[];
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface TableOrderModalProps {
  table: TableModel;
  onClose: (refresh: boolean) => void;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Naqd pul', icon: '💵' },
  { value: 'CLICK', label: 'Click', icon: '📱' },
  { value: 'PAYME', label: 'Payme', icon: '💳' },
  { value: 'UZCARD', label: 'Uzcard', icon: '🏦' },
] as const;

export const TableOrderModal: React.FC<TableOrderModalProps> = ({ table, onClose }) => {
  const isEditMode = !!table.current_order;
  const orderUuid = table.current_order?.uuid;

  // Catalog states (shared by both modes)
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [errorCatalog, setErrorCatalog] = useState<string | null>(null);

  // CREATE mode states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [comment, setComment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CLICK' | 'PAYME' | 'UZCARD'>('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // EDIT mode states (active order)
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(isEditMode);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [printingPreCheck, setPrintingPreCheck] = useState(false);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState<'CASH' | 'CLICK' | 'PAYME' | 'UZCARD'>(
    (table.current_order?.payment_method as any) || 'CASH'
  );
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Fetch catalog (categories + products)
  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setErrorCatalog(null);
    try {
      const partnerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA) || '{}');
      const partnerUuid = partnerData.uuid;
      if (!partnerUuid) throw new Error("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");

      const catsResponse = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      const rawCats = catsResponse.data?.data?.categories || catsResponse.data?.categories || catsResponse.data?.data || catsResponse.data || [];

      const mappedCats: Category[] = Array.isArray(rawCats) ? rawCats.map((c: any) => ({
        uuid: c.uuid,
        name: c.category_details?.name || c.name || "Nomi yo'q",
        is_active: !!c.is_active,
        products: Array.isArray(c.products) ? c.products.map((p: any) => {
          const rawPrice = parseFloat(p.price || '0');
          const discountPercent = p.discount ? parseFloat(p.discount) : 0;
          const finalPrice = discountPercent > 0 ? rawPrice * (1 - discountPercent / 100) : rawPrice;
          return {
            uuid: p.uuid,
            name: p.name,
            description: p.description || '',
            price: finalPrice,
            original_price: rawPrice,
            discount: discountPercent,
            is_available: !!p.is_available && !!p.is_active,
            image_url: p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null
          };
        }) : []
      })) : [];

      setCategories(mappedCats.filter((c) => c.is_active));
    } catch (err: any) {
      console.error("Failed to load catalog in TableOrderModal:", err);
      setErrorCatalog(
        err.response?.data?.message ||
        err.message ||
        "Katalog ma'lumotlarini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  // Fetch active order items (Edit mode only)
  const fetchOrderItems = useCallback(async () => {
    if (!orderUuid) return;
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
      setOrderItems(itemsList);
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

  useEffect(() => {
    fetchCatalog();
    if (isEditMode) {
      fetchOrderItems();
    }
  }, [fetchCatalog, fetchOrderItems, isEditMode]);

  // Flattened products with active category filtering and search query
  const filteredProducts = useMemo(() => {
    let list: Product[] = [];
    if (activeCategoryUuid === 'all') {
      categories.forEach((cat) => {
        cat.products.forEach((prod) => {
          if (!list.some((p) => p.uuid === prod.uuid)) {
            list.push(prod);
          }
        });
      });
    } else {
      const targetCat = categories.find((c) => c.uuid === activeCategoryUuid);
      if (targetCat) list = targetCat.products;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    }

    return list;
  }, [categories, activeCategoryUuid, searchQuery]);

  const formatUzS = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return '0 UZS';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    return isNaN(num) ? '0 UZS' : num.toLocaleString('uz-UZ') + ' UZS';
  };

  // --- CREATE mode cart helpers ---
  const addToCart = (product: Product) => {
    if (!product.is_available) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.uuid === product.uuid);
      if (existing) {
        return prev.map((item) =>
          item.product.uuid === product.uuid ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const decreaseCartQuantity = (productUuid: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.uuid === productUuid);
      if (!existing) return prev;
      if (existing.quantity === 1) {
        return prev.filter((item) => item.product.uuid !== productUuid);
      }
      return prev.map((item) =>
        item.product.uuid === productUuid ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  };

  const removeFromCart = (productUuid: string) => {
    setCart((prev) => prev.filter((item) => item.product.uuid !== productUuid));
  };

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  );

  // Submit a brand-new dine-in order for this table
  const handleCreateOrder = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleanedPhone = contactPhone.trim().replace(/\D/g, '');
      await ordersApi.createDineInOrder({
        table: table.uuid,
        payment_method: paymentMethod,
        contact_phone: cleanedPhone || undefined,
        contact_name: contactName.trim() || undefined,
        description: comment.trim() || undefined,
        items: cart.map((item) => ({ product_uuid: item.product.uuid, quantity: item.quantity })),
      });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose(true);
    } catch (err: any) {
      console.error("Failed to create dine-in order:", err);
      setSubmitError(
        err.response?.data?.message ||
        err.message ||
        "Buyurtma yaratishda xatolik yuz berdi."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // --- EDIT mode (active order) helpers ---
  const editItemsTotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const price = Number(item.price_at_time_of_order || item.product?.price || 0);
      return sum + price * (item.quantity || 0);
    }, 0);
  }, [orderItems]);

  const handleAddProductToOrder = async (productUuid: string) => {
    if (!orderUuid) return;
    setActionLoading(productUuid);
    try {
      await ordersApi.addOrderItems(orderUuid, { items: [{ product_uuid: productUuid, quantity: 1 }] });
      await fetchOrderItems();
    } catch (err: any) {
      console.error("Failed to add product to order:", err);
      alert(err.response?.data?.message || err.message || "Mahsulot qo'shishda xatolik yuz berdi.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateItemQuantity = async (itemUuid: string, newQuantity: number) => {
    if (!orderUuid) return;
    setActionLoading(itemUuid);
    try {
      await ordersApi.updateOrderItemQuantity(orderUuid, itemUuid, { quantity: newQuantity });
      await fetchOrderItems();
    } catch (err: any) {
      console.error("Failed to update item quantity:", err);
      alert(err.response?.data?.message || err.message || "Miqdorni yangilashda xatolik yuz berdi.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveOrderItem = async (itemUuid: string, currentQuantity: number) => {
    if (!orderUuid) return;
    if (!window.confirm("Haqiqatan ham ushbu mahsulotni buyurtmadan o'chirmoqchimisiz?")) return;
    setActionLoading(itemUuid);
    try {
      await ordersApi.removeOrderItems(orderUuid, { items: [{ item_uuid: itemUuid, quantity: currentQuantity }] });
      await fetchOrderItems();
    } catch (err: any) {
      console.error("Failed to remove item:", err);
      alert(err.response?.data?.message || err.message || "Mahsulotni o'chirishda xatolik yuz berdi.");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPreCheck = () => {
    setPrintingPreCheck(true);
    try {
      printPreCheckUtil({
        table_number: table.table_number,
        total_price: editItemsTotal,
        items: orderItems,
      });
    } finally {
      setPrintingPreCheck(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!orderUuid || paymentSaving) return;
    setPaymentSaving(true);
    try {
      await ordersApi.markOrderPaid(orderUuid, { payment_method: editPaymentMethod, is_paid: true });
      await ordersApi.completeOrder(orderUuid);
      await printReceiptUtil(orderUuid);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose(true);
    } catch (err: any) {
      console.error("Payment confirmation failed:", err);
      alert(err.response?.data?.message || err.message || "To'lovni yakunlashda xatolik yuz berdi.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const headerSubtitle = isEditMode
    ? `Buyurtma: ${table.current_order?.order_number}`
    : "Yangi buyurtma";

  return (
    <div
      onClick={() => onClose(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl bg-darkCard border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-left animate-[slideUp_0.3s_ease-out]"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              Stol {table.table_number}
              {isEditMode && (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Band
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{headerSubtitle}</p>
          </div>
          <button
            onClick={() => onClose(false)}
            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
          {/* Left: Catalog / Menu */}
          <div className="lg:col-span-7 p-5 flex flex-col min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-white/5">
            <div className="space-y-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Taom nomini yozing..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/50 border border-white/5 hover:border-white/10 focus:border-brand rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  onClick={() => setActiveCategoryUuid('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                    activeCategoryUuid === 'all'
                      ? 'bg-brand text-white'
                      : 'bg-slate-900 text-slate-400 border border-white/5 hover:border-white/10 hover:text-slate-200'
                  }`}
                >
                  Barcha taomlar
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.uuid}
                    onClick={() => setActiveCategoryUuid(cat.uuid)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                      activeCategoryUuid === cat.uuid
                        ? 'bg-brand text-white'
                        : 'bg-slate-900 text-slate-400 border border-white/5 hover:border-white/10 hover:text-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 pr-1 scrollbar-thin">
              {loadingCatalog ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="w-8 h-8 text-brand animate-spin" />
                </div>
              ) : errorCatalog ? (
                <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/10 text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-rose-400 mx-auto animate-pulse" />
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">{errorCatalog}</p>
                  <button
                    onClick={fetchCatalog}
                    className="px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs hover:bg-brand-dark transition cursor-pointer"
                  >
                    Qayta urinish
                  </button>
                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredProducts.map((prod) => {
                    const cartQty = isEditMode
                      ? 0
                      : cart.find((item) => item.product.uuid === prod.uuid)?.quantity || 0;
                    const isAdding = actionLoading === prod.uuid;

                    return (
                      <div
                        key={prod.uuid}
                        className={`rounded-2xl border bg-darkCard overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                          !prod.is_available
                            ? 'opacity-50 border-white/5'
                            : 'border-white/5 hover:border-white/10 hover:shadow-lg'
                        }`}
                      >
                        <div>
                          <div className="h-24 bg-slate-900 relative overflow-hidden flex items-center justify-center">
                            {prod.image_url ? (
                              <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                            ) : (
                              <ShoppingBag className="w-8 h-8 text-slate-600 stroke-[1.2]" />
                            )}
                            {!prod.is_available && (
                              <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-bold text-rose-300">
                                Tugagan
                              </span>
                            )}
                          </div>
                          <div className="p-3 space-y-1">
                            <h4 className="font-bold text-white text-xs truncate" title={prod.name}>
                              {prod.name}
                            </h4>
                            <h5 className="font-bold text-brand text-xs">{formatUzS(prod.price)}</h5>
                          </div>
                        </div>

                        <div className="p-2.5 border-t border-white/5 bg-slate-900/20">
                          {isEditMode ? (
                            <button
                              onClick={() => handleAddProductToOrder(prod.uuid)}
                              disabled={!prod.is_available || !!actionLoading}
                              className={`w-full py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer flex items-center justify-center gap-1 ${
                                prod.is_available
                                  ? 'bg-brand hover:bg-brand-dark text-white shadow-md shadow-brand/10'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                              <span>Qo'shish</span>
                            </button>
                          ) : cartQty > 0 ? (
                            <div className="flex items-center justify-between bg-slate-900 rounded-lg p-1 border border-white/5">
                              <button
                                onClick={() => decreaseCartQuantity(prod.uuid)}
                                className="p-1 rounded bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-bold text-white px-2">{cartQty} ta</span>
                              <button
                                onClick={() => addToCart(prod)}
                                className="p-1 rounded bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(prod)}
                              disabled={!prod.is_available}
                              className={`w-full py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer flex items-center justify-center gap-1 ${
                                prod.is_available
                                  ? 'bg-brand hover:bg-brand-dark text-white shadow-md shadow-brand/10'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Savatga</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-10 rounded-2xl bg-darkCard/50 border border-dashed border-white/5 text-center space-y-2">
                  <FolderOpen className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">Mos keladigan taomlar topilmadi</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Cart / Order + Actions */}
          <div className="lg:col-span-5 p-5 flex flex-col min-h-0 overflow-hidden">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5 shrink-0">
              <ShoppingBag className="w-3.5 h-3.5 text-brand" />
              {isEditMode ? "Buyurtma tarkibi" : "Savatcha"}
            </h4>

            {isEditMode ? (
              /* --- EDIT MODE: live order items list --- */
              loadingItems ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-brand mb-2" />
                  <span className="text-xs">Mahsulotlar yuklanmoqda...</span>
                </div>
              ) : itemsError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium my-auto text-center font-bold">
                  {itemsError}
                </div>
              ) : orderItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 border border-dashed border-white/5 rounded-xl text-slate-500 text-xs">
                  Savat bo'sh. Chapdan mahsulot qo'shing.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                  {orderItems.map((item, idx) => {
                    const itemUuid = item.uuid;
                    const productName = item.product_name || item.name || item.product?.name || "Noma'lum taom";
                    const productPrice = Number(item.price_at_time_of_order || item.product?.price || 0);
                    const quantity = item.quantity;
                    const isModifying = actionLoading === itemUuid;

                    return (
                      <div
                        key={itemUuid || idx}
                        className="p-3 bg-slate-900 border border-white/5 rounded-xl flex items-center justify-between gap-3 text-sm transition-all"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{productName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatUzS(productPrice)} x {quantity} = <span className="text-slate-200 font-medium">{formatUzS(productPrice * quantity)}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              if (quantity > 1) {
                                handleUpdateItemQuantity(itemUuid, quantity - 1);
                              } else {
                                handleRemoveOrderItem(itemUuid, quantity);
                              }
                            }}
                            disabled={!!actionLoading}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <span className="w-6 text-center font-bold text-white text-xs">
                            {isModifying ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto text-brand" /> : quantity}
                          </span>

                          <button
                            onClick={() => handleUpdateItemQuantity(itemUuid, quantity + 1)}
                            disabled={!!actionLoading}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleRemoveOrderItem(itemUuid, quantity)}
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
              )
            ) : (
              /* --- CREATE MODE: local cart list --- */
              cart.length > 0 ? (
                <div className="flex-1 overflow-y-auto divide-y divide-white/5 pr-1 scrollbar-thin">
                  {cart.map((item) => (
                    <div key={item.product.uuid} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white truncate" title={item.product.name}>{item.product.name}</p>
                        <p className="text-slate-400 font-medium mt-0.5">
                          {formatUzS(item.product.price)} x {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-white/5">
                          <button
                            onClick={() => decreaseCartQuantity(item.product.uuid)}
                            className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-white px-1.5 text-xs">{item.quantity}</span>
                          <button
                            onClick={() => addToCart(item.product)}
                            className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.uuid)}
                          className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-white/5 space-y-1">
                  <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-400">Savatcha bo'sh</p>
                  <p className="text-[10px]">Chap tomondan menyudan taom qo'shing</p>
                </div>
              )
            )}

            {/* Footer: form + totals + actions */}
            <div className="shrink-0 mt-4 pt-4 border-t border-white/5 space-y-4">
              {!isEditMode && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" />
                        Mijoz ismi (Ixtiyoriy)
                      </label>
                      <input
                        type="text"
                        placeholder="Masalan: Anvar"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <PhoneIcon className="w-3 h-3 text-slate-500" />
                        Telefon (Ixtiyoriy)
                      </label>
                      <input
                        type="text"
                        placeholder="+998901234567"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-500" />
                      Qo'shimcha izoh
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Buyurtma uchun maxsus izohlar..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-slate-500" />
                      To'lov turi
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_METHODS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPaymentMethod(opt.value)}
                          className={`py-2 rounded-lg border font-bold text-[10px] transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            paymentMethod === opt.value
                              ? 'border-brand bg-brand/10 text-brand'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                          }`}
                        >
                          <span className="text-sm">{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Payment panel for EDIT mode */}
              {isEditMode && showPaymentPanel && (
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3 animate-fade-in">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">To'lov turini tanlang</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PAYMENT_METHODS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setEditPaymentMethod(opt.value)}
                        className={`py-2 rounded-lg border font-bold text-[10px] transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          editPaymentMethod === opt.value
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <span className="text-sm">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowPaymentPanel(false)}
                      disabled={paymentSaving}
                      className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-[11px] transition cursor-pointer disabled:opacity-40"
                    >
                      Bekor qilish
                    </button>
                    <button
                      onClick={handleConfirmPayment}
                      disabled={paymentSaving}
                      className="py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[11px] transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {paymentSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Tasdiqlash
                    </button>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="flex justify-between font-bold text-white text-sm pt-1 border-t border-white/5">
                <span>Jami:</span>
                <span className="text-emerald-400 text-base">
                  {formatUzS(isEditMode ? editItemsTotal : cartSubtotal)}
                </span>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Action buttons */}
              {isEditMode ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handlePrintPreCheck}
                    disabled={printingPreCheck || orderItems.length === 0}
                    className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-300" />
                    Pre-chek
                  </button>
                  <button
                    onClick={() => setShowPaymentPanel(true)}
                    disabled={orderItems.length === 0 || showPaymentPanel}
                    className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 disabled:opacity-50"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    To'lov qilish
                  </button>
                  <button
                    onClick={() => onClose(true)}
                    className="col-span-2 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Saqlash
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCreateOrder}
                  disabled={cart.length === 0 || submitting}
                  className={`w-full py-3 rounded-xl font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 ${
                    cart.length > 0 && !submitting
                      ? 'bg-brand hover:bg-brand-dark text-white shadow-lg shadow-brand/10'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Yaratilmoqda...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Buyurtma yaratish</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
