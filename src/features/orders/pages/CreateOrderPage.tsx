import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  Search, 
  MapPin, 
  Phone as PhoneIcon, 
  CreditCard, 
  Utensils, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle, 
  AlertCircle,
  FolderOpen,
  ArrowLeft,
  FileText,
  User
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import apiClient from '../../../core/api/client';
import { ordersApi } from '../services/ordersApi';
import { tablesApi } from '../../tables/services/tablesApi';
import type { TableModel } from '../../tables/services/tablesApi';
import confetti from 'canvas-confetti';

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
  id: number | string;
  uuid: string;
  name: string;
  is_active: boolean;
  products: Product[];
}

interface CartItem {
  product: Product;
  quantity: number;
}

const CreateOrderPage: React.FC = () => {
  const navigate = useNavigate();

  // Catalog State
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [errorCatalog, setErrorCatalog] = useState<string | null>(null);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Checkout Form State
  const [serviceType, setServiceType] = useState<'DELIVERY' | 'PICKUP' | 'DINE_IN'>('DELIVERY');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tables, setTables] = useState<TableModel[]>([]);
  const [selectedTableUuid, setSelectedTableUuid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CLICK' | 'PAYME' | 'UZCARD'>('CASH');
  const [comment, setComment] = useState('');

  // Submit / API States
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Restaurant details (for delivery calculations & coordinates)
  const [partnerDetails, setPartnerDetails] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      setPartnerDetails(JSON.parse(data));
    }
    
    const fetchTables = async () => {
      try {
        const response = await tablesApi.getTables();
        setTables(response.filter(t => t.is_active !== false && t.status === 'AVAILABLE'));
      } catch (err) {
        console.error("Failed to fetch tables:", err);
      }
    };
    fetchTables();
  }, []);

  // Fetch Catalog items
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
        id: c.id,
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

      // Filter categories to only keep active ones
      const activeCats = mappedCats.filter(c => c.is_active);
      setCategories(activeCats);
    } catch (err: any) {
      console.error("Failed to load catalog:", err);
      setErrorCatalog(
        err.response?.data?.message || 
        err.message || 
        "Katalog ma'lumotlarini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Handle adding product to cart
  const addToCart = (product: Product) => {
    if (!product.is_available) return;
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.uuid === product.uuid);
      if (existing) {
        return prevCart.map((item) => 
          item.product.uuid === product.uuid 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
  };

  // Handle decreasing quantity in cart
  const decreaseQuantity = (productUuid: string) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.uuid === productUuid);
      if (!existing) return prevCart;
      if (existing.quantity === 1) {
        return prevCart.filter((item) => item.product.uuid !== productUuid);
      }
      return prevCart.map((item) => 
        item.product.uuid === productUuid 
          ? { ...item, quantity: item.quantity - 1 } 
          : item
      );
    });
  };

  // Handle removing product from cart
  const removeFromCart = (productUuid: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.product.uuid !== productUuid));
  };

  // Clear Cart
  const clearCart = () => setCart([]);

  // Flattened products with active category filtering and search query
  const filteredProducts = useMemo(() => {
    let list: Product[] = [];
    if (activeCategoryUuid === 'all') {
      // Gather all products
      categories.forEach((cat) => {
        cat.products.forEach((prod) => {
          if (!list.some((p) => p.uuid === prod.uuid)) {
            list.push(prod);
          }
        });
      });
    } else {
      const targetCat = categories.find((c) => c.uuid === activeCategoryUuid);
      if (targetCat) {
        list = targetCat.products;
      }
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

  // Price calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  const deliveryFee = useMemo(() => {
    if (serviceType !== 'DELIVERY') return 0;
    
    const fee = partnerDetails?.delivery_fee ? parseFloat(partnerDetails.delivery_fee) : 8000;
    const threshold = partnerDetails?.free_delivery_threshold ? parseFloat(partnerDetails.free_delivery_threshold) : 50000;
    
    if (subtotal >= threshold) return 0;
    return fee;
  }, [subtotal, serviceType, partnerDetails]);

  const total = subtotal + deliveryFee;

  // Format currency
  const formatUzS = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + " UZS";
  };

  // Validate form
  const isFormValid = useMemo(() => {
    if (cart.length === 0) return false;
    
    if (serviceType === 'DELIVERY') {
      return contactName.trim().length >= 2 && contactPhone.trim().length >= 7 && address.trim().length >= 3;
    } else if (serviceType === 'PICKUP') {
      return contactName.trim().length >= 2 && contactPhone.trim().length >= 7;
    } else if (serviceType === 'DINE_IN') {
      return selectedTableUuid.trim().length > 0;
    }
    return false;
  }, [cart, serviceType, contactName, contactPhone, address, selectedTableUuid]);

  // Handle Order Submit
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    // Clean phone number: remove non-digits, and convert 998901234567 to 901234567 (9 digits) if code included
    let cleanedPhone = contactPhone.trim().replace(/\D/g, '');
    if (cleanedPhone.startsWith('998') && cleanedPhone.length === 12) {
      cleanedPhone = cleanedPhone.slice(3);
    }

    // Default coordinates to restaurant coordinates or Tashkent coordinates
    const latVal = partnerDetails?.location_lat ? parseFloat(partnerDetails.location_lat) : 41.311081;
    const lngVal = partnerDetails?.location_long ? parseFloat(partnerDetails.location_long) : 69.240562;

    const commonItems = cart.map((item) => ({
      product_uuid: item.product.uuid,
      quantity: item.quantity,
    }));

    try {
      if (serviceType === 'DELIVERY') {
        const payload = {
          contact_phone: cleanedPhone,
          contact_name: contactName.trim(),
          address: address.trim(),
          latitude: latVal,
          longitude: lngVal,
          payment_method: paymentMethod,
          description: comment.trim() || "Izoh yo'q",
          items: commonItems,
        };
        await ordersApi.createDeliveryOrder(payload);
      } else if (serviceType === 'PICKUP') {
        const payload = {
          contact_phone: cleanedPhone,
          contact_name: contactName.trim(),
          payment_method: paymentMethod,
          description: comment.trim() || undefined,
          items: commonItems,
        };
        await ordersApi.createPickupOrder(payload);
      } else if (serviceType === 'DINE_IN') {
        const payload = {
          table: selectedTableUuid,
          payment_method: paymentMethod,
          contact_phone: cleanedPhone || undefined,
          contact_name: contactName.trim() || undefined,
          description: comment.trim() || undefined,
          items: commonItems,
        };
        await ordersApi.createDineInOrder(payload);
      }

      setSubmitSuccess(true);
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      clearCart();
      
      // Redirect to orders board after 2 seconds
      setTimeout(() => {
        navigate('/orders');
      }, 2000);
    } catch (err: any) {
      console.error("Order creation failed:", err);
      setSubmitError(
        err.response?.data?.message || 
        err.message || 
        "Buyurtma yaratishda xatolik yuz berdi. Iltimos maydonlar to'g'riligini va internetni tekshiring."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-Outfit text-left animate-fade-in relative min-h-[85vh]">
      {/* Success Modal Overlay */}
      {submitSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-darkCard border border-emerald-500/20 rounded-2xl shadow-2xl p-8 text-center space-y-4 animate-slide-up">
            <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-white">Buyurtma Qabul Qilindi!</h3>
            <p className="text-sm text-slate-400">
              Telefon orqali tushgan buyurtma tizimga muvaffaqiyatli kiritildi.
            </p>
            <div className="text-xs text-brand bg-brand/10 py-1.5 px-3 rounded-lg inline-block font-semibold">
              Kanalga/Karta bo'limiga o'tilmoqda...
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <button 
            onClick={() => navigate('/orders')} 
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer mb-2.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ortga buyurtmalarga</span>
          </button>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Yangi buyurtma <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><Utensils className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Telefondan tushgan buyurtmalarni tezkor tizimga kiritish</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Catalog Menu & Search (Col span: 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-darkCard border border-white/5 space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                <Search className="w-4.5 h-4.5" />
              </span>
              <input
                type="text"
                placeholder="Taom nomini yozing..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/50 border border-white/5 hover:border-white/10 focus:border-brand rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none transition"
              />
            </div>

            {/* Categories scrollable pills */}
            <div className="grid grid-rows-2 grid-flow-col gap-2 overflow-x-auto pb-1 scrollbar-thin">
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

          {/* Product Items Display */}
          {loadingCatalog ? (
            <div className="flex justify-center items-center py-24">
              <div className="w-10 h-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
            </div>
          ) : errorCatalog ? (
            <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/10 text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-rose-400 mx-auto animate-pulse" />
              <h4 className="font-bold text-white">Taomlarni yuklab bo'lmadi</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">{errorCatalog}</p>
              <button
                onClick={fetchCatalog}
                className="px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs hover:bg-brand-dark transition cursor-pointer"
              >
                Qayta urinish
              </button>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredProducts.map((prod) => {
                const cartQty = cart.find((item) => item.product.uuid === prod.uuid)?.quantity || 0;
                
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
                      {/* Image / Icon container */}
                      <div className="h-32 bg-slate-900 relative overflow-hidden flex items-center justify-center">
                        {prod.image_url ? (
                          <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingBag className="w-10 h-10 text-slate-600 stroke-[1.2]" />
                        )}
                        {!prod.is_available && (
                          <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold text-rose-300">
                            Tugagan (Faol emas)
                          </span>
                        )}
                      </div>

                      {/* Content details */}
                      <div className="p-4 space-y-1">
                        <h4 className="font-bold text-white text-sm truncate" title={prod.name}>
                          {prod.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2 h-7">
                          {prod.description || "Taom tavsifi kiritilmagan."}
                        </p>
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <h5 className="font-bold text-brand text-sm">{formatUzS(prod.price)}</h5>
                          {prod.discount > 0 && (
                            <>
                              <span className="text-[10px] text-slate-500 line-through">
                                {formatUzS(prod.original_price)}
                              </span>
                              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                -{prod.discount}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer add button action */}
                    <div className="p-3 border-t border-white/5 bg-slate-900/20">
                      {cartQty > 0 ? (
                        <div className="flex items-center justify-between bg-slate-900 rounded-lg p-1 border border-white/5">
                          <button
                            onClick={() => decreaseQuantity(prod.uuid)}
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
                          className={`w-full py-2 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
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
            <div className="p-12 rounded-2xl bg-darkCard/50 border border-dashed border-white/5 text-center space-y-2">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="font-bold text-white text-sm">Mos keladigan taomlar topilmadi</h4>
              <p className="text-xs text-slate-400">Turkum yoki qidiruv so'zini o'zgartirib ko'ring.</p>
            </div>
          )}
        </div>

        {/* Right Side: Cart Sidebar & Form Parameters (Col span: 5) */}
        <div className="lg:col-span-5 space-y-6">
          <form onSubmit={handleSubmitOrder} className="p-6 rounded-2xl bg-darkCard border border-white/5 space-y-6 shadow-xl">
            <h3 className="font-bold text-white text-lg flex items-center justify-between border-b border-white/5 pb-3">
              <span className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-brand" />
                <span>Savatcha</span>
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition cursor-pointer"
                >
                  Tozalash
                </button>
              )}
            </h3>

            {/* Cart Items List */}
            {cart.length > 0 ? (
              <div className="divide-y divide-white/5 max-h-56 overflow-y-auto pr-1 scrollbar-thin space-y-1">
                {cart.map((item) => (
                  <div key={item.product.uuid} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white truncate" title={item.product.name}>
                        {item.product.name}
                      </p>
                      <p className="text-slate-400 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{formatUzS(item.product.price)} x {item.quantity}</span>
                        {item.product.discount > 0 && (
                          <span className="text-[10px] text-slate-500 line-through">
                            ({formatUzS(item.product.original_price)})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-white/5">
                        <button
                          type="button"
                          onClick={() => decreaseQuantity(item.product.uuid)}
                          className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-white px-1.5 text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(item.product)}
                          className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.uuid)}
                        className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="O'chirish"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-white/5 space-y-1">
                <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-400">Savatcha bo'sh</p>
                <p className="text-[10px]">Chap tomondan menyudan taom qo'shing</p>
              </div>
            )}

            {/* Service Type Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Xizmat turi</label>
              <div className="grid grid-cols-3 gap-2 bg-slate-900 p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setServiceType('DELIVERY')}
                  className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    serviceType === 'DELIVERY'
                      ? 'bg-brand text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Yetkazish
                </button>
                <button
                  type="button"
                  onClick={() => setServiceType('PICKUP')}
                  className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    serviceType === 'PICKUP'
                      ? 'bg-brand text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Olib ketish
                </button>
                <button
                  type="button"
                  onClick={() => setServiceType('DINE_IN')}
                  className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    serviceType === 'DINE_IN'
                      ? 'bg-brand text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Stol
                </button>
              </div>
            </div>

            {/* Conditional Form Fields */}
            <div className="space-y-4">
              {/* Customer Name and Phone grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer Name input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <User className={`w-3.5 h-3.5 ${serviceType !== 'DINE_IN' ? 'text-brand' : 'text-slate-500'}`} />
                    <span>Mijoz ismi {serviceType === 'DINE_IN' && '(Ixtiyoriy)'}</span>
                  </label>
                  <input
                    type="text"
                    required={serviceType !== 'DINE_IN'}
                    placeholder="Masalan: Anvar"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                {/* Customer Phone input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <PhoneIcon className={`w-3.5 h-3.5 ${serviceType !== 'DINE_IN' ? 'text-brand' : 'text-slate-500'}`} />
                    <span>Mijoz telefoni {serviceType === 'DINE_IN' && '(Ixtiyoriy)'}</span>
                  </label>
                  <input
                    type="text"
                    required={serviceType !== 'DINE_IN'}
                    placeholder="+998901234567"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Address field for Delivery */}
              {serviceType === 'DELIVERY' && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-brand" />
                    <span>Yetkazish manzili</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Ko'cha, uy, kvartira, podyezd, qavat, mo'ljal..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition h-16 resize-none"
                  />
                </div>
              )}

              {/* Table number for Dine-in */}
              {serviceType === 'DINE_IN' && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Utensils className="w-3.5 h-3.5 text-brand" />
                    <span>Stolni tanlang</span>
                  </label>
                  <select
                    required
                    value={selectedTableUuid}
                    onChange={(e) => setSelectedTableUuid(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none transition cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-slate-500">Stolni tanlang...</option>
                    {tables.map((t) => (
                      <option key={t.uuid} value={t.uuid} className="bg-slate-900 text-white">
                        {t.table_number}-stol ({t.capacity} kishilik) - {t.status_display || t.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Payment Method */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-brand" />
                  <span>To'lov turi</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none transition cursor-pointer"
                >
                  <option value="CASH" className="bg-slate-900 text-white">Naqd (CASH)</option>
                  <option value="CLICK" className="bg-slate-900 text-white">CLICK</option>
                  <option value="PAYME" className="bg-slate-900 text-white">Payme</option>
                  <option value="UZCARD" className="bg-slate-900 text-white">Uzcard</option>
                </select>
              </div>

              {/* Comment field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Qo'shimcha izoh</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Buyurtma uchun maxsus izohlar..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-slate-900 border border-white/5 focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition h-16 resize-none"
                />
              </div>
            </div>

            {/* Calculations and Breakdown */}
            <div className="pt-4 border-t border-white/5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Savatcha summasi:</span>
                <span>{formatUzS(subtotal)}</span>
              </div>
              
              {serviceType === 'DELIVERY' && (
                <div className="flex justify-between text-slate-400">
                  <span>Yetkazib berish xizmati:</span>
                  <span>{deliveryFee === 0 ? "Bepul" : formatUzS(deliveryFee)}</span>
                </div>
              )}

              <div className="flex justify-between font-bold text-white text-sm pt-1 border-t border-white/5">
                <span>Jami:</span>
                <span className="text-emerald-400 text-base">{formatUzS(total)}</span>
              </div>
            </div>

            {/* Error Message Alert */}
            {submitError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2.5 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-normal">{submitError}</span>
              </div>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className={`w-full py-3.5 rounded-xl font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 ${
                isFormValid && !submitting
                  ? 'bg-brand hover:bg-brand-dark text-white shadow-lg shadow-brand/10 hover:shadow-brand/20 hover:scale-[1.01]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Kiritilmoqda...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Buyurtmani tasdiqlash</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateOrderPage;
