import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  Search, 
  MapPin, 
  Phone as PhoneIcon, 
  Utensils, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle, 
  AlertCircle,
  FolderOpen,
  ArrowLeft,
  FileText,
  User,
  X
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import apiClient from '../../../core/api/client';
import { ordersApi } from '../services/ordersApi';
import { tablesApi } from '../../tables/services/tablesApi';
import type { TableModel } from '../../tables/services/tablesApi';
import confetti from 'canvas-confetti';
import { useConfirm } from '../../../core/components/ConfirmProvider';

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

interface CartTab {
  id: string;
  name: string;
  serviceType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  selectedTableUuid: string;
  contactName: string;
  contactPhone: string;
  address: string;
  comment: string;
  paymentMethod: 'CASH' | 'CLICK' | 'PAYME' | 'UZCARD';
  cart: CartItem[];
  step: 'SERVICE_TYPE' | 'TABLE_SELECT' | 'MENU';
}

const CreateOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Catalog State
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [errorCatalog, setErrorCatalog] = useState<string | null>(null);

  // Tables list
  const [tables, setTables] = useState<TableModel[]>([]);

  // Restaurant details (for delivery calculations & coordinates)
  const [partnerDetails, setPartnerDetails] = useState<any>(null);

  // Active Carts (Tabs) State
  const [activeCarts, setActiveCarts] = useState<CartTab[]>(() => {
    try {
      const saved = localStorage.getItem('milliygo_active_carts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load active carts from local storage:", e);
    }
    return [
      {
        id: 'cart-1',
        name: 'Savat 1',
        serviceType: 'DELIVERY',
        selectedTableUuid: '',
        contactName: '',
        contactPhone: '',
        address: '',
        paymentMethod: 'CASH',
        comment: '',
        cart: [],
        step: 'SERVICE_TYPE'
      }
    ];
  });

  const [activeCartId, setActiveCartId] = useState<string>(() => {
    const savedId = localStorage.getItem('milliygo_active_cart_id');
    if (savedId) return savedId;
    return 'cart-1';
  });

  // Submit / API States
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Load static resources on mount
  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      setPartnerDetails(JSON.parse(data));
    }
    
    const fetchTables = async () => {
      try {
        const response = await tablesApi.getTables();
        setTables(response.filter(t => t.is_active !== false));
      } catch (err) {
        console.error("Failed to fetch tables:", err);
      }
    };
    fetchTables();
  }, []);

  // Save active carts state to localStorage
  useEffect(() => {
    localStorage.setItem('milliygo_active_carts', JSON.stringify(activeCarts));
    localStorage.setItem('milliygo_active_cart_id', activeCartId);
  }, [activeCarts, activeCartId]);

  // Derive current active cart from the tabs array
  const activeCart = useMemo(() => {
    return activeCarts.find(c => c.id === activeCartId) || activeCarts[0];
  }, [activeCarts, activeCartId]);

  const {
    cart,
    serviceType,
    selectedTableUuid,
    contactName,
    contactPhone,
    address,
    paymentMethod,
    comment,
    step
  } = activeCart;

  // Helper to update active cart fields
  const updateActiveCart = useCallback((updates: Partial<CartTab>) => {
    setActiveCarts((prev) =>
      prev.map((c) => (c.id === activeCartId ? { ...c, ...updates } : c))
    );
  }, [activeCartId]);

  // Auto-update active cart's display name based on selected table or customer name
  useEffect(() => {
    let newName = '';
    const index = activeCarts.findIndex((c) => c.id === activeCartId);
    const cartNum = index !== -1 ? index + 1 : 1;

    if (step === 'SERVICE_TYPE') {
      newName = `Savat ${cartNum}`;
    } else if (serviceType === 'DINE_IN') {
      if (selectedTableUuid) {
        const tableObj = tables.find((t) => t.uuid === selectedTableUuid);
        if (tableObj) {
          newName = `Stol ${tableObj.table_number}`;
        } else {
          newName = `Stol #${cartNum}`;
        }
      } else {
        newName = `Stol tanlash #${cartNum}`;
      }
    } else if (serviceType === 'DELIVERY') {
      if (contactName.trim()) {
        newName = `Yetkazish: ${contactName.trim()}`;
      } else {
        newName = `Yetkazish #${cartNum}`;
      }
    } else if (serviceType === 'PICKUP') {
      if (contactName.trim()) {
        newName = `Olib ketish: ${contactName.trim()}`;
      } else {
        newName = `Olib ketish #${cartNum}`;
      }
    }

    if (newName && activeCart.name !== newName) {
      setActiveCarts((prev) =>
        prev.map((c) => (c.id === activeCartId ? { ...c, name: newName } : c))
      );
    }
  }, [serviceType, selectedTableUuid, contactName, tables, activeCartId, activeCart.name, activeCarts, step]);

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
    const existing = cart.find((item) => item.product.uuid === product.uuid);
    let newCart;
    if (existing) {
      newCart = cart.map((item) => 
        item.product.uuid === product.uuid 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      );
    } else {
      newCart = [...cart, { product, quantity: 1 }];
    }
    updateActiveCart({ cart: newCart });
  };

  // Handle decreasing quantity in cart
  const decreaseQuantity = (productUuid: string) => {
    const existing = cart.find((item) => item.product.uuid === productUuid);
    if (!existing) return;
    let newCart;
    if (existing.quantity === 1) {
      newCart = cart.filter((item) => item.product.uuid !== productUuid);
    } else {
      newCart = cart.map((item) => 
        item.product.uuid === productUuid 
          ? { ...item, quantity: item.quantity - 1 } 
          : item
      );
    }
    updateActiveCart({ cart: newCart });
  };

  // Handle removing product from cart
  const removeFromCart = (productUuid: string) => {
    const newCart = cart.filter((item) => item.product.uuid !== productUuid);
    updateActiveCart({ cart: newCart });
  };

  // Clear Cart
  const clearCart = () => {
    updateActiveCart({
      cart: [],
      contactName: '',
      contactPhone: '',
      address: '',
      selectedTableUuid: '',
      comment: '',
      step: 'SERVICE_TYPE'
    });
  };

  // Multiple Carts Management (Tabs)
  const addNewCartTab = () => {
    const newId = `cart-${Date.now()}`;
    const nextNum = activeCarts.length + 1;
    const newCart: CartTab = {
      id: newId,
      name: `Savat ${nextNum}`,
      serviceType: 'DELIVERY',
      selectedTableUuid: '',
      contactName: '',
      contactPhone: '',
      address: '',
      paymentMethod: 'CASH',
      comment: '',
      cart: [],
      step: 'SERVICE_TYPE'
    };
    setActiveCarts((prev) => [...prev, newCart]);
    setActiveCartId(newId);
  };

  const closeCartTab = async (id: string) => {
    if (activeCarts.length <= 1) return;

    const targetCart = activeCarts.find(c => c.id === id);
    if (targetCart && targetCart.cart.length > 0) {
      const confirmClose = await confirm(`"${targetCart.name}" tarkibida taomlar bor. Uni yopib o'chirib yubormoqchimisiz?`, { danger: true, confirmText: "Yopish" });
      if (!confirmClose) return;
    }

    setActiveCarts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (activeCartId === id) {
        const closedIndex = prev.findIndex((c) => c.id === id);
        const nextActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0;
        setActiveCartId(filtered[nextActiveIndex].id);
      }
      return filtered;
    });
  };

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

  // Handle Wizard Steps Navigation
  const handleServiceSelect = (type: 'DELIVERY' | 'PICKUP' | 'DINE_IN') => {
    updateActiveCart({
      serviceType: type,
      step: type === 'DINE_IN' ? 'TABLE_SELECT' : 'MENU'
    });
  };

  const handleTableSelect = async (table: TableModel) => {
    if (table.status !== 'AVAILABLE') {
      const confirmNew = await confirm(
        `Diqqat! Stol ${table.table_number} hozirda "${table.status === 'OCCUPIED' ? 'Band' : 'Bron'}" holatda. Baribir ushbu stolda buyurtma yaratmoqchimisiz?`
      );
      if (!confirmNew) return;
    }
    updateActiveCart({
      selectedTableUuid: table.uuid,
      step: 'MENU'
    });
  };

  // Handle Order Submit
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    let cleanedPhone = contactPhone.trim().replace(/\D/g, '');
    if (cleanedPhone.startsWith('998') && cleanedPhone.length === 12) {
      cleanedPhone = cleanedPhone.slice(3);
    }

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

        if (selectedTableUuid) {
          tablesApi.updateTableStatus(selectedTableUuid, 'OCCUPIED').catch((err) => {
            console.error("Failed to mark table as occupied:", err);
          });
        }
      }

      setSubmitSuccess(true);
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      
      // Close completed tab and choose another, or clear it if it was the only tab
      if (activeCarts.length > 1) {
        const filtered = activeCarts.filter((c) => c.id !== activeCartId);
        const closedIndex = activeCarts.findIndex((c) => c.id === activeCartId);
        const nextActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0;
        setActiveCarts(filtered);
        setActiveCartId(filtered[nextActiveIndex].id);
      } else {
        clearCart();
      }

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

  // Render Step 1: Choose Service Type
  const renderServiceTypeStep = () => {
    return (
      <div className="max-w-4xl mx-auto py-10 pt-4 space-y-4 animate-fade-in text-center">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-ink tracking-tight flex items-center justify-center gap-3">
            Yangi buyurtma <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><Utensils className="w-6 h-6" /></span>
          </h2>
          <p className="text-sm text-slate-400">Buyurtma turini tanlang</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Yetkazish Card */}
          <button
            type="button"
            onClick={() => handleServiceSelect('DELIVERY')}
            className="p-8 rounded-3xl bg-darkCard border border-edge hover:border-emerald-500/30 transition-all duration-300 flex flex-col items-center justify-center text-center space-y-5 cursor-pointer group hover:shadow-2xl hover:shadow-emerald-500/5 hover:-translate-y-1"
          >
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform duration-300 border border-emerald-500/5">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124l-.847-13.56A1.125 1.125 0 0 0 19.5 3H16.5a1.125 1.125 0 0 0-1.125 1.125v12.75m0-12.75H12m3 0v4.5m-3-4.5V6a1.5 1.5 0 0 0-3 0v1.5m3-1.5H9.75M9 10.5h3m-3 3h3" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-ink text-lg group-hover:text-emerald-400 transition-colors">Yetkazish</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">Mijoz manziliga yetkazib berish xizmati</p>
            </div>
          </button>

          {/* Olib ketish Card */}
          <button
            type="button"
            onClick={() => handleServiceSelect('PICKUP')}
            className="p-8 rounded-3xl bg-darkCard border border-edge hover:border-amber-500/30 transition-all duration-300 flex flex-col items-center justify-center text-center space-y-5 cursor-pointer group hover:shadow-2xl hover:shadow-amber-500/5 hover:-translate-y-1"
          >
            <div className="w-24 h-24 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform duration-300 border border-amber-500/5">
              <ShoppingBag className="w-12 h-12 stroke-[1.2]" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-lg group-hover:text-amber-400 transition-colors">Olib ketish</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">Mijoz taomlarni o'zi kelib olib ketadi</p>
            </div>
          </button>

          {/* Stol uchun Card */}
          <button
            type="button"
            onClick={() => handleServiceSelect('DINE_IN')}
            className="p-8 rounded-3xl bg-darkCard border border-edge hover:border-purple-500/30 transition-all duration-300 flex flex-col items-center justify-center text-center space-y-5 cursor-pointer group hover:shadow-2xl hover:shadow-purple-500/5 hover:-translate-y-1"
          >
            <div className="w-24 h-24 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform duration-300 border border-purple-500/5">
              <Utensils className="w-12 h-12 stroke-[1.2]" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-lg group-hover:text-purple-400 transition-colors">Stol uchun</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">Restoran stolida o'tirib xizmat ko'rsatish</p>
            </div>
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 pt-6">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="px-6 py-3 rounded-xl bg-slate-900 border border-edge hover:border-edge-strong text-slate-400 hover:text-ink transition cursor-pointer font-bold text-xs"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    );
  };

  // Render Step 2: Choose Table (Grid)
  const renderTableSelectStep = () => {
    return (
      <div className="max-w-5xl mx-auto py-6 space-y-2 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-edge pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateActiveCart({ step: 'SERVICE_TYPE' })}
              className="p-2 rounded-xl bg-slate-900 border border-edge text-slate-400 hover:text-ink transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-ink tracking-tight">Stolni tanlang</h2>
              <p className="text-xs text-slate-400 mt-0.5">Xizmat ko'rsatiladigan stol raqamini tanlang</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Bo'sh: {tables.filter(t => t.status === 'AVAILABLE').length}
            </span>
            <span className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              Band: {tables.filter(t => t.status === 'OCCUPIED').length}
            </span>
            <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Bron: {tables.filter(t => t.status === 'RESERVED').length}
            </span>
          </div>
        </div>

        {tables.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.map((table) => {
              const isAvailable = table.status === 'AVAILABLE';
              const isOccupied = table.status === 'OCCUPIED';
              const isReserved = table.status === 'RESERVED';

              let cardStyles = '';
              let iconStyles = '';
              let badgeStyles = '';
              let badgeText = '';

              if (isAvailable) {
                cardStyles = 'border-edge bg-darkCard hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5';
                iconStyles = 'text-emerald-400 bg-emerald-500/10';
                badgeStyles = 'bg-emerald-500/10 text-emerald-400';
                badgeText = "Bo'sh";
              } else if (isOccupied) {
                cardStyles = 'border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40';
                iconStyles = 'text-rose-400 bg-rose-500/10';
                badgeStyles = 'bg-rose-500/10 text-rose-400';
                badgeText = 'Band';
              } else if (isReserved) {
                cardStyles = 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40';
                iconStyles = 'text-amber-400 bg-amber-500/10';
                badgeStyles = 'bg-amber-500/10 text-amber-400';
                badgeText = 'Bron';
              }

              return (
                <button
                  key={table.uuid}
                  type="button"
                  onClick={() => handleTableSelect(table)}
                  className={`p-5 rounded-2xl border text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center space-y-3 group hover:-translate-y-0.5 ${cardStyles}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${iconStyles}`}>
                    <Utensils className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-ink font-Outfit">Stol {table.table_number}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{table.capacity} kishilik</p>
                  </div>
                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md ${badgeStyles}`}>
                    {badgeText}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center bg-darkCard border border-dashed border-edge rounded-2xl space-y-2">
            <Utensils className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="font-bold text-ink text-sm">Bo'sh stollar topilmadi</h4>
            <p className="text-xs text-slate-400">Tizimda faol stollar mavjud emas.</p>
          </div>
        )}
      </div>
    );
  };

  // Render Step 3: Menu & Checkout POS
  const renderMenuStep = () => {
    let headerText = '';
    let headerColor = '';
    if (serviceType === 'DELIVERY') {
      headerText = 'Yetkazib berish buyurtmasi';
      headerColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (serviceType === 'PICKUP') {
      headerText = 'Olib ketish buyurtmasi';
      headerColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    } else if (serviceType === 'DINE_IN') {
      const tableObj = tables.find(t => t.uuid === selectedTableUuid);
      headerText = `Stol ${tableObj?.table_number || ''} buyurtmasi`;
      headerColor = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    }

    return (
      <div className="space-y-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 ">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                updateActiveCart({
                  step: serviceType === 'DINE_IN' ? 'TABLE_SELECT' : 'SERVICE_TYPE'
                });
              }} 
              className="p-2 rounded-xl bg-slate-900 border border-edge text-slate-400 hover:text-ink transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
                <span className={`text-xs font-extrabold uppercase px-2.5 py-1 rounded-xl border ${headerColor}`}>
                  {headerText}
                </span>
              </h1>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Side: Catalog Menu & Search (Col span: 7) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Filters Bar */}
            <div className="p-4 rounded-2xl bg-darkCard border border-edge space-y-4">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                  <Search className="w-4.5 h-4.5" />
                </span>
                <input
                  type="text"
                  placeholder="Taom nomini yozing..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/50 border border-edge hover:border-edge-strong focus:border-brand rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-ink placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              {/* Categories scrollable pills */}
              <div className="grid grid-rows-2 grid-flow-col gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  onClick={() => setActiveCategoryUuid('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                    activeCategoryUuid === 'all'
                      ? 'bg-brand text-white'
                      : 'bg-slate-900 text-slate-400 border border-edge hover:border-edge-strong hover:text-slate-200'
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
                        : 'bg-slate-900 text-slate-400 border border-edge hover:border-edge-strong hover:text-slate-200'
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
                <h4 className="font-bold text-ink">Taomlarni yuklab bo'lmadi</h4>
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
                          ? 'opacity-50 border-edge' 
                          : 'border-edge hover:border-edge-strong hover:shadow-lg'
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
                          <h4 className="font-bold text-ink text-sm truncate" title={prod.name}>
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
                      <div className="p-3 border-t border-edge bg-slate-900/20">
                        {cartQty > 0 ? (
                          <div className="flex items-center justify-between bg-slate-900 rounded-lg p-1 border border-edge">
                            <button
                              onClick={() => decreaseQuantity(prod.uuid)}
                              className="p-1 rounded bg-overlay text-slate-400 hover:text-ink hover:bg-overlay-strong transition cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold text-ink px-2">{cartQty} ta</span>
                            <button
                              onClick={() => addToCart(prod)}
                              className="p-1 rounded bg-overlay text-slate-400 hover:text-ink hover:bg-overlay-strong transition cursor-pointer"
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
              <div className="p-12 rounded-2xl bg-darkCard/50 border border-dashed border-edge text-center space-y-2">
                <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
                <h4 className="font-bold text-ink text-sm">Mos keladigan taomlar topilmadi</h4>
                <p className="text-xs text-slate-400">Turkum yoki qidiruv so'zini o'zgartirib ko'ring.</p>
              </div>
            )}
          </div>

          {/* Right Side: Cart Sidebar & Form Parameters (Col span: 5) */}
          <div className="sticky top-[100px] lg:col-span-4 space-y-6 overflow-y-auto">
            <div className="p-6 rounded-2xl bg-darkCard border border-edge space-y-6 shadow-xl text-left">
              <h3 className="font-bold text-ink text-lg flex items-center justify-between border-b border-edge pb-3">
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
                <div className="divide-y divide-edge max-h-56 overflow-y-auto pr-1 scrollbar-thin space-y-1">
                  {cart.map((item) => (
                    <div key={item.product.uuid} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1 flex flex-col items-start text-left">
                        <p className="font-bold text-ink truncate w-full" title={item.product.name}>
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
                        <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-edge">
                          <button
                            type="button"
                            onClick={() => decreaseQuantity(item.product.uuid)}
                            className="p-1 rounded text-slate-400 hover:text-ink transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-ink px-1.5 text-xs">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(item.product)}
                            className="p-1 rounded text-slate-400 hover:text-ink transition cursor-pointer"
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
                <div className="py-8 text-center text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-edge space-y-1">
                  <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-400">Savatcha bo'sh</p>
                  <p className="text-[10px]">Chap tomondan menyudan taom qo'shing</p>
                </div>
              )}

              {/* Form Input Fields */}
              <div className="space-y-4 border-t border-edge pt-4">
                {/* Selected Table banner (Dine-in only) */}
                {serviceType === 'DINE_IN' && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-edge flex items-center justify-between animate-fade-in text-left">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-brand/10 text-brand shrink-0">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex flex-col items-start">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Tanlangan stol</span>
                        <p className="text-xs font-bold text-ink truncate">
                          Stol {tables.find(t => t.uuid === selectedTableUuid)?.table_number || 'Tanlanmagan'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateActiveCart({ step: 'TABLE_SELECT' })}
                      className="text-xs font-bold text-brand hover:text-brand-dark transition cursor-pointer shrink-0"
                    >
                      O'zgartirish
                    </button>
                  </div>
                )}

                {/* Customer Name and Phone grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Customer Name input */}
                  <div className="space-y-1.5 flex flex-col items-start">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <User className={`w-3.5 h-3.5 ${serviceType !== 'DINE_IN' ? 'text-brand' : 'text-slate-500'}`} />
                      <span>Mijoz ismi {serviceType === 'DINE_IN' && '(Ixtiyoriy)'}</span>
                    </label>
                    <input
                      type="text"
                      required={serviceType !== 'DINE_IN'}
                      placeholder="Masalan: Anvar"
                      value={contactName}
                      onChange={(e) => updateActiveCart({ contactName: e.target.value })}
                      className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>

                  {/* Customer Phone input */}
                  <div className="space-y-1.5 flex flex-col items-start">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <PhoneIcon className={`w-3.5 h-3.5 ${serviceType !== 'DINE_IN' ? 'text-brand' : 'text-slate-500'}`} />
                      <span>Mijoz telefoni {serviceType === 'DINE_IN' && '(Ixtiyoriy)'}</span>
                    </label>
                    <input
                      type="text"
                      required={serviceType !== 'DINE_IN'}
                      placeholder="+998901234567"
                      value={contactPhone}
                      onChange={(e) => updateActiveCart({ contactPhone: e.target.value })}
                      className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* Address field for Delivery */}
                {serviceType === 'DELIVERY' && (
                  <div className="space-y-1.5 animate-fade-in flex flex-col items-start">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-brand" />
                      <span>Yetkazish manzili</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Ko'cha, uy, kvartira, podyezd, qavat, mo'ljal..."
                      value={address}
                      onChange={(e) => updateActiveCart({ address: e.target.value })}
                      className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink placeholder-slate-500 focus:outline-none transition h-16 resize-none"
                    />
                  </div>
                )}

                {/* Payment Method */}
                {/* <div className="space-y-1.5 flex flex-col items-start">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-brand" />
                    <span>To'lov turi</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => updateActiveCart({ paymentMethod: e.target.value as any })}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-3 py-2.5 text-xs font-bold text-ink focus:outline-none transition cursor-pointer"
                  >
                    <option value="CASH" className="bg-slate-900 text-ink">Naqd (CASH)</option>
                    <option value="CLICK" className="bg-slate-900 text-ink">CLICK</option>
                    <option value="PAYME" className="bg-slate-900 text-ink">Payme</option>
                    <option value="UZCARD" className="bg-slate-900 text-ink">Uzcard</option>
                  </select>
                </div> */}

                {/* Comment field */}
                <div className="space-y-1.5 flex flex-col items-start">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>Qo'shimcha izoh</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Buyurtma uchun maxsus izohlar..."
                    value={comment}
                    onChange={(e) => updateActiveCart({ comment: e.target.value })}
                    className="w-full bg-slate-900 border border-edge focus:border-brand rounded-xl px-4 py-2.5 text-xs font-semibold text-ink placeholder-slate-500 focus:outline-none transition h-16 resize-none"
                  />
                </div>
              </div>

              {/* Calculations and Breakdown */}
              <div className="pt-4 border-t border-edge space-y-2 text-xs">
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

                <div className="flex justify-between font-bold text-ink text-sm pt-1 border-t border-edge">
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
                type="button"
                onClick={handleSubmitOrder}
                disabled={!isFormValid || submitting}
                className={`w-full py-3.5 rounded-xl font-bold text-xs transition cursor-pointer flex justify-center items-center gap-1.5 ${
                  isFormValid && !submitting
                    ? 'bg-brand hover:bg-brand-dark text-white shadow-lg shadow-brand/10 hover:shadow-brand/20 hover:scale-[1.01]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-edge'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-edge-strong border-t-white rounded-full animate-spin" />
                    <span>Kiritilmoqda...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Buyurtmani tasdiqlash</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2 font-Outfit text-left animate-fade-in relative min-h-[85vh]">
      {/* Success Modal Overlay */}
      {submitSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-darkCard border border-emerald-500/20 rounded-2xl shadow-2xl p-8 text-center space-y-4 animate-slide-up">
            <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-ink font-Outfit">Buyurtma Qabul Qilindi!</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Telefon orqali tushgan buyurtma tizimga muvaffaqiyatli kiritildi.
            </p>
            <div className="text-xs text-brand bg-brand/10 py-1.5 px-3 rounded-lg inline-block font-semibold">
              Kanalga/Karta bo'limiga o'tilmoqda...
            </div>
          </div>
        </div>
      )}

      {/* POS Cart Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin select-none font-Outfit">
        {activeCarts.map((c) => {
          const isActive = activeCartId === c.id;
          const isDelivery = c.serviceType === 'DELIVERY';
          const isPickup = c.serviceType === 'PICKUP';
          const isDineIn = c.serviceType === 'DINE_IN';

          let tabStyle = '';
          let Icon = ShoppingBag;

          if (isDelivery) {
            Icon = MapPin;
            tabStyle = isActive
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/15'
              : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10 hover:border-emerald-500/20';
          } else if (isPickup) {
            Icon = ShoppingBag;
            tabStyle = isActive
              ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/15'
              : 'bg-amber-500/5 text-amber-400 border-amber-500/10 hover:border-amber-500/20';
          } else if (isDineIn) {
            Icon = Utensils;
            tabStyle = isActive
              ? 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/15'
              : 'bg-purple-500/5 text-purple-400 border-purple-500/10 hover:border-purple-500/20';
          }

          const itemsCount = c.cart ? c.cart.reduce((sum: number, item: any) => sum + item.quantity, 0) : 0;

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCartId(c.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-2 border ${tabStyle}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{c.name}</span>
              {itemsCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
                  isActive ? (isPickup ? 'bg-slate-950 text-amber-400 animate-pulse' : 'bg-white text-brand animate-pulse') : 'bg-slate-800/80 text-slate-300'
                }`}>
                  {itemsCount}
                </span>
              )}
              {activeCarts.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeCartTab(c.id);
                  }}
                  className="hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                  title="Savatni yopish"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={addNewCartTab}
          className="px-4 py-2 rounded-2xl text-xs font-bold transition shrink-0 cursor-pointer bg-slate-900 border border-dashed border-edge-strong text-slate-400 hover:text-ink hover:border-edge-strong flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Yangi savat</span>
        </button>
      </div>

      {step === 'SERVICE_TYPE' && renderServiceTypeStep()}
      {step === 'TABLE_SELECT' && renderTableSelectStep()}
      {step === 'MENU' && renderMenuStep()}
    </div>
  );
};

export default CreateOrderPage;
