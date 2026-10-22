import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  ChevronUp,
  FileText,
  FolderOpen,
  Lock,
  Minus,
  Plus,
  Printer,
  ShoppingBag,
  Trash2,
  Truck,
  Utensils,
  X,
} from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ordersApi, quotePosCart } from '../services/ordersApi';
import type { PosItemInput, PosQuote } from '../services/ordersApi';
import { tablesApi } from '../../tables/services/tablesApi';
import type { TableModel } from '../../tables/services/tablesApi';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { printPreCheck as printPreCheckUtil, printReceiptPreview as printReceiptPreviewUtil } from '../utils/printing';
import { useToast } from '../../../core/components/ToastProvider';
import {
  ApiGap,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  InlineAlert,
  Input,
  QtyStepper,
  SearchInput,
  Segmented,
  Sheet,
  Skeleton,
  Textarea,
} from '../../../core/ui';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney, maskPhoneInput } from '../../../core/lib/format';
import { getPartner, isShop, wording } from '../../../core/lib/session';
import { useTariff } from '../../../core/lib/tariff';
import { shiftApi } from '../../shifts/services/shiftApi';
import { ProductConfigSheet, isConfigurable, lineKey, unitPrice } from '../components/ProductConfigSheet';
import type { LineConfig, PosOptionGroup, PosPackaging, SelectedOption } from '../components/ProductConfigSheet';

interface Product {
  uuid: string;
  name: string;
  description: string;
  price: number;
  original_price: number;
  discount: number;
  is_available: boolean;
  image_url?: string | null;
  /** Variantlar, qadoq va kg — kassada alohida sozlash oynasi bilan tanlanadi */
  unit?: 'PIECE' | 'KG';
  step?: number;
  min_quantity?: number;
  option_groups?: PosOptionGroup[];
  packagings?: PosPackaging[];
  /** Aksiya (1+1 / 2+1) va set tarkibi — kartada ko'rsatiladi; hisobni server qiladi */
  promotion?: { label?: string } | null;
  kind?: 'SINGLE' | 'SET';
  set_items?: { name: string; quantity: number }[];
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
  /** Dona/kg yoki (qadoq tanlangan bo'lsa) qadoqlar soni */
  quantity: number;
  /** Qator identifikatori (mahsulot + variantlar + qadoq). Eski saqlangan savatlarda yo'q — product.uuid */
  key?: string;
  options?: SelectedOption[];
  packaging?: PosPackaging | null;
}

const keyOf = (i: CartItem) => i.key ?? i.product.uuid;
const linePrice = (i: CartItem) => unitPrice(i.product, i.options, i.packaging) * i.quantity;
const qtyText = (i: CartItem) =>
  i.packaging ? `${i.quantity} × ${i.packaging.name}` : i.product.unit === 'KG' ? `${Number(i.quantity.toFixed(3))} kg` : String(i.quantity);
/** Chekda ko'rinadigan nom: "Lavash (Achchiq, Katta)" */
const lineName = (i: CartItem) => (i.options?.length ? `${i.product.name} (${i.options.map((o) => o.name).join(', ')})` : i.product.name);

type ServiceType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';
type PaymentMethod = 'CASH' | 'CLICK' | 'PAYME' | 'UZCARD';

interface CartTab {
  id: string;
  name: string;
  serviceType: ServiceType;
  selectedTableUuid: string;
  contactName: string;
  contactPhone: string;
  address: string;
  comment: string;
  paymentMethod: PaymentMethod;
  cart: CartItem[];
  step: 'SERVICE_TYPE' | 'TABLE_SELECT' | 'MENU';
}

const CARTS_KEY = 'milliygo_active_carts';
const CART_ID_KEY = 'milliygo_active_cart_id';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Naqd' },
  { value: 'CLICK', label: 'Click' },
  { value: 'PAYME', label: 'Payme' },
  { value: 'UZCARD', label: 'Uzcard' },
];

const SERVICE_LABEL: Record<ServiceType, string> = {
  DELIVERY: 'Yetkazib berish',
  PICKUP: 'Olib ketish',
  DINE_IN: 'Zalda (stol)',
};

const newCartTab = (num: number, shop: boolean): CartTab => ({
  id: `cart-${Date.now()}-${num}`,
  name: `Savat ${num}`,
  serviceType: 'DELIVERY',
  selectedTableUuid: '',
  contactName: '',
  contactPhone: '',
  address: '',
  paymentMethod: 'CASH',
  comment: '',
  cart: [],
  // Shops only deliver — there is nothing to choose, go straight to the menu.
  step: shop ? 'MENU' : 'SERVICE_TYPE',
});

/** "+998 (90) 123-45-67" -> "901234567"; "" / "+998" -> ""; partial -> null (invalid) */
const normalizePhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length === 0) return '';
  if (local.length === 9) return local;
  return null;
};

const CreateOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const partnerDetails = useMemo(() => getPartner(), []);
  const shop = isShop(partnerDetails);
  const w = wording(partnerDetails);
  const allowedServices: ServiceType[] = shop ? ['DELIVERY'] : ['DELIVERY', 'PICKUP', 'DINE_IN'];
  // Tarifda yo'q xizmatlar qulf bilan ko'rinadi (bosilsa «Tarif» sahifasi); server ham baribir rad etadi
  // Restoran kassasi: smena ochiq bo'lishi shart (server ham tekshiradi). null — hali noma'lum.
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (shop) return;
    let alive = true;
    shiftApi
      .getCurrentShift()
      .then((s) => alive && setShiftOpen(!!s))
      .catch(() => alive && setShiftOpen(null));
    return () => {
      alive = false;
    };
  }, [shop]);
  const { tariff } = useTariff();
  const lockedService = (t: ServiceType) => (t === 'PICKUP' && !tariff.allow_pickup) || (t === 'DINE_IN' && !tariff.allow_dine_in);

  // Catalog
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [errorCatalog, setErrorCatalog] = useState<string | null>(null);

  // Tables
  const [tables, setTables] = useState<TableModel[]>([]);
  const [loadingTables, setLoadingTables] = useState(!shop);
  const [tablesError, setTablesError] = useState<string | null>(null);

  // Carts (multi-tab POS), persisted per browser
  const [activeCarts, setActiveCarts] = useState<CartTab[]>(() => {
    try {
      const saved = localStorage.getItem(CARTS_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Shops can't have pickup/dine-in carts (e.g. stale data from another account).
        return parsed.map((c: CartTab) =>
          shop && c.serviceType !== 'DELIVERY' ? { ...c, serviceType: 'DELIVERY', selectedTableUuid: '', step: 'MENU' } : c,
        );
      }
    } catch {
      /* corrupt storage — start fresh */
    }
    return [{ ...newCartTab(1, shop), id: 'cart-1' }];
  });
  const [activeCartId, setActiveCartId] = useState<string>(() => {
    try {
      return localStorage.getItem(CART_ID_KEY) || 'cart-1';
    } catch {
      return 'cart-1';
    }
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [printingPreCheck, setPrintingPreCheck] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  /* ------------------------------------------------------------ tables */
  const fetchTables = useCallback(async () => {
    if (shop) return;
    setLoadingTables(true);
    setTablesError(null);
    try {
      const response = await tablesApi.getTables();
      const sorted = response
        .filter((t) => t.is_active !== false)
        .sort((a, b) => {
          const oa = a.display_order ?? 0;
          const ob = b.display_order ?? 0;
          if (oa !== ob) return oa - ob;
          // natural sort: "ZAL | 10" after "ZAL | 9"
          return String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: 'base' });
        });
      setTables(sorted);
    } catch (err) {
      // BUGFIX: errors used to be swallowed, so the table step showed "no tables".
      setTablesError(getErrorMessage(err, "Stollarni yuklab bo'lmadi"));
    } finally {
      setLoadingTables(false);
    }
  }, [shop]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  /* ------------------------------------------------------- persistence */
  useEffect(() => {
    try {
      localStorage.setItem(CARTS_KEY, JSON.stringify(activeCarts));
      localStorage.setItem(CART_ID_KEY, activeCartId);
    } catch {
      /* quota / private mode */
    }
  }, [activeCarts, activeCartId]);

  const activeCart = useMemo(() => activeCarts.find((c) => c.id === activeCartId) || activeCarts[0], [activeCarts, activeCartId]);
  const { cart, serviceType, selectedTableUuid, contactName, contactPhone, address, paymentMethod, comment, step } = activeCart;
  const currentId = activeCart.id;

  const updateActiveCart = useCallback(
    (updates: Partial<CartTab>) => {
      setActiveCarts((prev) => prev.map((c) => (c.id === currentId ? { ...c, ...updates } : c)));
    },
    [currentId],
  );

  // Shops: never sit on the service-type step.
  useEffect(() => {
    if (shop && step !== 'MENU') updateActiveCart({ serviceType: 'DELIVERY', step: 'MENU' });
  }, [shop, step, updateActiveCart]);

  const selectedTable = tables.find((t) => t.uuid === selectedTableUuid);

  // Auto-name the active tab after the table / customer.
  useEffect(() => {
    const idx = activeCarts.findIndex((c) => c.id === currentId);
    const num = idx !== -1 ? idx + 1 : 1;
    let name = `Savat ${num}`;
    if (step !== 'SERVICE_TYPE') {
      if (serviceType === 'DINE_IN') name = selectedTable ? `Stol ${selectedTable.table_number}` : `Stol tanlash #${num}`;
      else if (serviceType === 'DELIVERY') name = contactName.trim() ? `Yetkazish: ${contactName.trim()}` : `Yetkazish #${num}`;
      else if (serviceType === 'PICKUP') name = contactName.trim() ? `Olib ketish: ${contactName.trim()}` : `Olib ketish #${num}`;
    }
    if (activeCart.name !== name) updateActiveCart({ name });
  }, [serviceType, selectedTable, contactName, step, activeCart.name, activeCarts, currentId, updateActiveCart]);

  /* ----------------------------------------------------------- catalog */
  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setErrorCatalog(null);
    try {
      const partnerUuid = getPartner()?.uuid;
      if (!partnerUuid) throw new Error("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");
      const res = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      const rawCats = res.data?.data?.categories || res.data?.categories || res.data?.data || res.data || [];
      const mapped: Category[] = Array.isArray(rawCats)
        ? rawCats.map((c: any) => ({
            id: c.id,
            uuid: c.uuid,
            name: c.category_details?.name || c.name || "Nomi yo'q",
            is_active: !!c.is_active,
            products: Array.isArray(c.products)
              ? c.products.map((p: any) => {
                  const raw = parseFloat(p.price || '0') || 0;
                  const disc = p.discount ? parseFloat(p.discount) || 0 : 0;
                  // Birlik narxi serverdan (`final_price`: aksiya narxi yoki chegirma hisobga olingan) — o'zimiz hisoblamaymiz
                  const serverPrice = p.final_price !== undefined && p.final_price !== null ? parseFloat(p.final_price) : NaN;
                  const price = Number.isFinite(serverPrice) ? serverPrice : disc > 0 ? raw * (1 - disc / 100) : raw;
                  return {
                    uuid: p.uuid,
                    name: p.name,
                    description: p.description || '',
                    price,
                    promotion: p.promotion && typeof p.promotion === 'object' ? { label: p.promotion.label } : null,
                    kind: p.kind === 'SET' ? 'SET' : 'SINGLE',
                    set_items: (Array.isArray(p.set_items) ? p.set_items : []).map((s: any) => ({ name: s.name, quantity: Number(s.quantity) || 1 })),
                    original_price: raw,
                    discount: raw > 0 && price < raw ? Math.round((1 - price / raw) * 100) : 0,
                    is_available: !!p.is_available && !!p.is_active,
                    image_url: p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null,
                    unit: p.unit === 'KG' ? 'KG' : 'PIECE',
                    step: p.step !== undefined ? Number(p.step) : undefined,
                    min_quantity: p.min_quantity !== undefined ? Number(p.min_quantity) : undefined,
                    option_groups: (Array.isArray(p.option_groups) ? p.option_groups : []).map((g: any) => ({
                      uuid: g.uuid,
                      name: g.name,
                      min_select: Number(g.min_select ?? 0),
                      max_select: Number(g.max_select ?? 1),
                      options: (Array.isArray(g.options) ? g.options : []).map((o: any) => ({
                        uuid: o.uuid,
                        name: o.name,
                        price_delta: parseFloat(o.price_delta || '0') || 0,
                        is_available: o.is_available !== false,
                      })),
                    })),
                    packagings: (Array.isArray(p.packagings) ? p.packagings : []).map((k: any) => ({
                      uuid: k.uuid,
                      name: k.name,
                      multiplier: Number(k.multiplier),
                      price: parseFloat(k.price || '0') || 0,
                    })),
                  } as Product;
                })
              : [],
          }))
        : [];
      setCategories(mapped.filter((c) => c.is_active));
    } catch (err) {
      setErrorCatalog(getErrorMessage(err, "Menyuni yuklashda xatolik yuz berdi."));
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // BUGFIX: carts persisted in localStorage kept stale prices/availability forever.
  // Once the live catalog loads, refresh every saved cart line from it.
  const productIndex = useMemo(() => {
    const m = new Map<string, Product>();
    categories.forEach((c) => c.products.forEach((p) => m.set(p.uuid, p)));
    return m;
  }, [categories]);

  useEffect(() => {
    if (productIndex.size === 0) return;
    setActiveCarts((prev) =>
      prev.map((c) => ({
        ...c,
        cart: c.cart.map((i) => {
          const live = productIndex.get(i.product.uuid);
          return live ? { ...i, product: live } : { ...i, product: { ...i.product, is_available: false } };
        }),
      })),
    );
  }, [productIndex]);

  /* -------------------------------------------------------------- cart */
  // Mahsulot kartochkasidagi son: shu mahsulotning barcha qatorlari (variant/qadoq farqidan qat'i nazar)
  const qtyOf = (uuid: string) => cart.filter((i) => i.product.uuid === uuid).reduce((s, i) => s + i.quantity, 0);

  /** Oddiy mahsulot (variant/qadoq/kg yo'q) — qator kaliti mahsulot uuid'sining o'zi */
  const setQty = (product: Product, qty: number) => {
    const exists = cart.some((i) => keyOf(i) === product.uuid);
    let next: CartItem[];
    if (qty <= 0) next = cart.filter((i) => keyOf(i) !== product.uuid);
    else if (exists) next = cart.map((i) => (keyOf(i) === product.uuid ? { ...i, quantity: qty } : i));
    else next = [...cart, { product, quantity: qty }];
    updateActiveCart({ cart: next });
  };

  /** Savatdagi qatorni kaliti bo'yicha yangilash (savat paneli) */
  const setLineQty = (key: string, qty: number) =>
    updateActiveCart({ cart: qty <= 0 ? cart.filter((i) => keyOf(i) !== key) : cart.map((i) => (keyOf(i) === key ? { ...i, quantity: qty } : i)) });

  const [configuring, setConfiguring] = useState<Product | null>(null);

  const addConfigured = (product: Product, cfg: LineConfig) => {
    const key = lineKey(product.uuid, cfg.options, cfg.packaging);
    const existing = cart.find((i) => keyOf(i) === key);
    const next = existing
      ? cart.map((i) => (keyOf(i) === key ? { ...i, quantity: Number((i.quantity + cfg.quantity).toFixed(3)) } : i))
      : [...cart, { product, quantity: cfg.quantity, key, options: cfg.options, packaging: cfg.packaging }];
    updateActiveCart({ cart: next });
    setConfiguring(null);
  };

  const addToCart = (product: Product) => {
    if (!product.is_available) return;
    if (isConfigurable(product)) {
      setConfiguring(product);
      return;
    }
    setQty(product, qtyOf(product.uuid) + 1);
  };

  const clearCart = () => {
    updateActiveCart({
      cart: [],
      contactName: '',
      contactPhone: '',
      address: '',
      selectedTableUuid: '',
      comment: '',
      step: shop ? 'MENU' : 'SERVICE_TYPE',
    });
  };

  const addNewCartTab = () => {
    const tab = newCartTab(activeCarts.length + 1, shop);
    setActiveCarts((prev) => [...prev, tab]);
    setActiveCartId(tab.id);
  };

  // BUGFIX: the old version called setActiveCartId inside a setState updater (side effect).
  const removeTab = (id: string) => {
    const idx = activeCarts.findIndex((c) => c.id === id);
    const filtered = activeCarts.filter((c) => c.id !== id);
    if (filtered.length === 0) return;
    setActiveCarts(filtered);
    if (currentId === id) setActiveCartId(filtered[Math.max(0, idx - 1)].id);
  };

  const closeCartTab = async (id: string) => {
    if (activeCarts.length <= 1) return;
    const target = activeCarts.find((c) => c.id === id);
    if (target && target.cart.length > 0) {
      const ok = await confirm(`"${target.name}" ichida mahsulotlar bor. Savatni yopasizmi?`, { danger: true, confirmText: 'Yopish' });
      if (!ok) return;
    }
    removeTab(id);
  };

  /* ---------------------------------------------------------- derived */
  const filteredProducts = useMemo(() => {
    let list: Product[] = [];
    if (activeCategoryUuid === 'all') {
      const seen = new Set<string>();
      categories.forEach((c) =>
        c.products.forEach((p) => {
          if (!seen.has(p.uuid)) {
            seen.add(p.uuid);
            list.push(p);
          }
        }),
      );
    } else {
      list = categories.find((c) => c.uuid === activeCategoryUuid)?.products || [];
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    return list;
  }, [categories, activeCategoryUuid, searchQuery]);

  // Kg qatori "1 ta buyurtma pozitsiyasi" hisoblanadi, kasr son emas
  const itemsCount = cart.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0);

  /** Savat qatorlari serverga yuboriladigan shaklda (quote va buyurtma yaratishda bir xil) */
  const buildItems = (lines: CartItem[]): PosItemInput[] =>
    lines.map((i) => ({
      product_uuid: i.product.uuid,
      quantity: i.quantity,
      ...(i.packaging ? { packaging: i.packaging.uuid } : {}),
      ...(i.options?.length ? { options: i.options.map((o) => o.uuid) } : {}),
    }));

  // Narxni SERVER hisoblaydi (1+1/2+1 aksiya, set variantlari, chegirma, kg/qadoq) — kassa o'zi taxmin qilmaydi.
  // Savat o'zgarsa 350 ms dan keyin qayta so'raladi; javob kelguncha taxminiy narx ko'rsatiladi.
  const quoteKey = JSON.stringify([buildItems(cart), serviceType]);
  const [quoteState, setQuoteState] = useState<{ key: string; quote: PosQuote | null; error: string | null } | null>(null);
  useEffect(() => {
    if (cart.length === 0) return;
    let alive = true;
    const t = setTimeout(() => {
      quotePosCart(buildItems(cart), serviceType)
        .then((quote) => alive && setQuoteState({ key: quoteKey, quote, error: null }))
        .catch((err) => alive && setQuoteState({ key: quoteKey, quote: null, error: getErrorMessage(err, "Narxni hisoblab bo'lmadi.") }));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);
  const quote = cart.length > 0 && quoteState?.key === quoteKey ? quoteState.quote : null;
  const quoteError = cart.length > 0 && quoteState?.key === quoteKey ? quoteState.error : null;
  const discountTotal = quote ? Number(quote.discount_amount) || 0 : 0;
  const quoteLine = (idx: number) => quote?.items[idx];

  const subtotal = quote ? Number(quote.subtotal) : cart.reduce((s, i) => s + linePrice(i), 0);

  // BUGFIX: the old code invented an 8 000 so'm fee / 50 000 threshold when the partner
  // profile didn't carry them. Now we only show a fee we actually know; otherwise the
  // server computes it and we say so.
  const knownFee = partnerDetails?.delivery_fee != null && partnerDetails.delivery_fee !== '' ? parseFloat(partnerDetails.delivery_fee) : null;
  const knownThreshold =
    partnerDetails?.free_delivery_threshold != null && partnerDetails.free_delivery_threshold !== ''
      ? parseFloat(partnerDetails.free_delivery_threshold)
      : null;
  const deliveryFee: number | null =
    serviceType !== 'DELIVERY'
      ? 0
      : knownFee === null || Number.isNaN(knownFee)
        ? null
        : knownThreshold !== null && knownThreshold > 0 && subtotal >= knownThreshold
          ? 0
          : knownFee;
  const total = subtotal + (deliveryFee || 0);

  const unavailableInCart = cart.filter((i) => !i.product.is_available);
  const isFormValid =
    cart.length > 0 && unavailableInCart.length === 0 && (serviceType !== 'DINE_IN' || selectedTableUuid.trim().length > 0);

  /* ------------------------------------------------------------ steps */
  const handleServiceSelect = (type: ServiceType) => {
    if (lockedService(type)) {
      toast.info(`${SERVICE_LABEL[type]} tarifingizda yo'q. Tarifni oshiring.`);
      navigate(`/plan?need=${type === 'PICKUP' ? 'pickup' : 'dine_in'}`);
      return;
    }
    updateActiveCart({ serviceType: type, step: type === 'DINE_IN' ? 'TABLE_SELECT' : 'MENU' });
  };

  const handleTableSelect = async (table: TableModel) => {
    if (table.status !== 'AVAILABLE') {
      const ok = await confirm(
        `Stol ${table.table_number} hozir "${table.status === 'OCCUPIED' ? 'band' : 'bron qilingan'}". Baribir shu stolga buyurtma ochasizmi?`,
      );
      if (!ok) return;
    }
    updateActiveCart({ selectedTableUuid: table.uuid, step: 'MENU' });
  };

  /* ---------------------------------------------------------- printing */
  const handlePrintPreCheck = async () => {
    if (cart.length === 0 || printingPreCheck) return;
    setPrintingPreCheck(true);
    try {
      await printPreCheckUtil({
        table_number: serviceType === 'DINE_IN' ? selectedTable?.table_number || null : null,
        total_price: total,
        items: cart.map((i, idx) => {
          const q = quoteLine(idx);
          // Aksiya hisobga olingan qator summasi: narx = jami / miqdor
          const unit = q ? Number(q.line_total) / (Number(q.quantity) || 1) : unitPrice(i.product, i.options, i.packaging);
          return { product_name: lineName(i), price_at_time_of_order: unit, quantity: i.quantity };
        }),
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Pre-chekni chop etishda xatolik'));
    } finally {
      setPrintingPreCheck(false);
    }
  };

  const handlePrintReceipt = async (includeOfdQr: boolean) => {
    if (cart.length === 0 || printingReceipt) return;
    setPrintingReceipt(true);
    try {
      await printReceiptPreviewUtil(
        {
          created_at: new Date().toLocaleString('uz-UZ'),
          contact_name: contactName.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
          address: serviceType === 'DELIVERY' ? address.trim() : undefined,
          delivery_type_display: SERVICE_LABEL[serviceType],
          table_number: serviceType === 'DINE_IN' ? selectedTable?.table_number || null : null,
          items: cart.map((i, idx) => {
            const q = quoteLine(idx);
            return {
              product_name: lineName(i),
              unit_price: q ? q.unit_price : unitPrice(i.product, i.options, i.packaging),
              quantity: i.quantity,
              unit: i.product.unit,
              packaging_name: i.packaging?.name,
              free_quantity: q?.free_quantity,
              promotion_label: q?.promotion_label,
              line_total: q ? q.line_total : linePrice(i),
            };
          }),
          subtotal,
          delivery_fee: deliveryFee ?? 0,
          total_price: total,
          payment_method_display: PAYMENT_OPTIONS.find((p) => p.value === paymentMethod)?.label || paymentMethod,
          description: comment.trim() || undefined,
          partner_name: partnerDetails?.name || partnerDetails?.partner_name,
          partner_address: partnerDetails?.address,
          partner_phone: partnerDetails?.phone,
        },
        includeOfdQr,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Chekni chop etishda xatolik'));
    } finally {
      setPrintingReceipt(false);
    }
  };

  /* ------------------------------------------------------------ submit */
  const handleSubmitOrder = async () => {
    if (!isFormValid || submitting) return;
    if (!shop && shiftOpen === false) {
      toast.error('Smena ochilmagan. Buyurtma yaratish uchun avval smenani oching.');
      navigate('/shift');
      return;
    }

    // BUGFIX: a phone field left at "+998" used to be sent as contact_phone "998".
    const phone = normalizePhone(contactPhone);
    if (phone === null) {
      setPhoneError("Telefon raqam to'liq emas: +998 (90) 123-45-67");
      setCartSheetOpen(true);
      return;
    }
    setPhoneError(null);
    setSubmitting(true);
    setSubmitError(null);

    // NOTE: there is no customer-location picker yet, so delivery orders carry the
    // venue's own coordinates (pre-existing behaviour). See report / API_GAPS.md.
    const lat = partnerDetails?.location_lat ? parseFloat(partnerDetails.location_lat) : 41.311081;
    const lng = partnerDetails?.location_long ? parseFloat(partnerDetails.location_long) : 69.240562;
    const items = buildItems(cart);

    try {
      if (serviceType === 'DELIVERY') {
        await ordersApi.createDeliveryOrder({
          contact_phone: phone || undefined,
          contact_name: contactName.trim() || undefined,
          address: address.trim() || undefined,
          latitude: lat,
          longitude: lng,
          payment_method: paymentMethod,
          description: comment.trim() || "Izoh yo'q",
          items,
        });
      } else if (serviceType === 'PICKUP') {
        await ordersApi.createPickupOrder({
          contact_phone: phone || undefined,
          contact_name: contactName.trim() || undefined,
          payment_method: paymentMethod,
          description: comment.trim() || undefined,
          items,
        });
      } else {
        await ordersApi.createDineInOrder({
          table: selectedTableUuid,
          payment_method: paymentMethod,
          contact_phone: phone || undefined,
          contact_name: contactName.trim() || undefined,
          description: comment.trim() || undefined,
          items,
        });
        if (selectedTableUuid) tablesApi.updateTableStatus(selectedTableUuid, 'OCCUPIED').catch(() => undefined);
      }

      setCartSheetOpen(false);
      setSubmitSuccess(true);
      if (activeCarts.length > 1) removeTab(currentId);
      else clearCart();
      redirectTimer.current = setTimeout(() => navigate('/orders'), 1800);
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Buyurtma yaratishda xatolik. Maydonlar va internetni tekshiring."));
    } finally {
      setSubmitting(false);
    }
  };

  /* =============================================================== UI */

  const cartTabsBar = (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 py-1">
      {activeCarts.map((c) => {
        const active = c.id === currentId;
        const count = c.cart.reduce((s, i) => s + i.quantity, 0);
        const Icon = c.serviceType === 'DINE_IN' ? Utensils : c.serviceType === 'PICKUP' ? ShoppingBag : Truck;
        return (
          <div
            key={c.id}
            className={`shrink-0 inline-flex items-center h-11 rounded-xl border text-[13px] font-bold transition ${
              active ? 'bg-ink text-white border-ink' : 'bg-surface text-ink border-edge hover:bg-field'
            }`}
          >
            <button type="button" onClick={() => setActiveCartId(c.id)} className="inline-flex items-center gap-2 h-full pl-3.5 pr-2 cursor-pointer">
              <Icon className="w-4 h-4 shrink-0" />
              <span className="max-w-[160px] truncate">{c.name}</span>
              {count > 0 && (
                <span className={`min-w-[22px] h-[22px] px-1.5 rounded-lg text-[12px] inline-flex items-center justify-center ${active ? 'bg-white/20' : 'bg-field text-muted'}`}>
                  {count}
                </span>
              )}
            </button>
            {activeCarts.length > 1 && (
              <button
                type="button"
                aria-label="Savatni yopish"
                onClick={() => closeCartTab(c.id)}
                className={`h-full w-9 flex items-center justify-center rounded-r-xl cursor-pointer ${active ? 'hover:bg-white/10' : 'text-muted hover:text-danger'}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addNewCartTab}
        className="shrink-0 inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl border border-dashed border-edge-strong text-[13px] font-bold text-muted hover:text-ink hover:bg-field cursor-pointer"
      >
        <Plus className="w-4 h-4" /> Yangi savat
      </button>
    </div>
  );

  /* ------------------------------------------------ step: service type */
  const renderServiceTypeStep = () => {
    const options: { type: ServiceType; title: string; desc: string; icon: React.ReactNode }[] = [
      { type: 'DELIVERY', title: 'Yetkazib berish', desc: 'Mijoz manziliga kuryer orqali', icon: <Truck className="w-7 h-7" /> },
      { type: 'PICKUP', title: 'Olib ketish', desc: "Mijoz o'zi kelib oladi", icon: <ShoppingBag className="w-7 h-7" /> },
      { type: 'DINE_IN', title: 'Zalda', desc: 'Stolga xizmat ko‘rsatish', icon: <Utensils className="w-7 h-7" /> },
    ];
    return (
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 animate-fade-in">
        <h2 className="text-[22px] md:text-[26px] font-black tracking-tightest">Buyurtma turi</h2>
        <p className="text-[14px] text-muted mt-1">Qanday xizmat ko'rsatiladi?</p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options
            .filter((o) => allowedServices.includes(o.type))
            .map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => handleServiceSelect(o.type)}
                className={`flex sm:flex-col items-center sm:items-start gap-4 p-4 sm:p-5 min-h-[84px] rounded-2xl bg-surface border border-edge text-left transition cursor-pointer ${
                  lockedService(o.type) ? 'opacity-70' : 'hover:border-brand/40 hover:shadow-card active:bg-brand-soft'
                }`}
              >
                <span className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${lockedService(o.type) ? 'bg-field text-subtle' : 'bg-brand-soft text-brand'}`}>
                  {lockedService(o.type) ? <Lock className="w-7 h-7" /> : o.icon}
                </span>
                <span>
                  <span className="block text-[16px] font-extrabold tracking-tightest">{o.title}</span>
                  <span className="block text-[13px] text-muted mt-0.5">{lockedService(o.type) ? "Tarifingizda yo'q — tarifni oshiring" : o.desc}</span>
                </span>
              </button>
            ))}
        </div>
        <div className="mt-6">
          <Button variant="ghost" onClick={() => navigate('/orders')}>
            Bekor qilish
          </Button>
        </div>
      </div>
    );
  };

  /* ------------------------------------------------ step: table select */
  const renderTableSelectStep = () => {
    const tone = (s?: string) =>
      s === 'OCCUPIED'
        ? { card: 'border-danger/30 bg-danger-soft/50', badge: 'danger' as const, label: 'Band' }
        : s === 'RESERVED'
          ? { card: 'border-gold/40 bg-gold-soft/50', badge: 'gold' as const, label: 'Bron' }
          : { card: 'border-edge bg-surface hover:border-brand/40', badge: 'success' as const, label: "Bo'sh" };
    return (
      <div className="pt-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Orqaga"
            onClick={() => updateActiveCart({ step: 'SERVICE_TYPE' })}
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center hover:bg-field cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-[20px] md:text-[24px] font-black tracking-tightest">Stolni tanlang</h2>
            {!loadingTables && !tablesError && (
              <p className="text-[13px] text-muted">
                Bo'sh: {tables.filter((t) => t.status === 'AVAILABLE').length} · Band: {tables.filter((t) => t.status === 'OCCUPIED').length} · Bron:{' '}
                {tables.filter((t) => t.status === 'RESERVED').length}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4">
          {loadingTables ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : tablesError ? (
            <div className="ui-card">
              <ErrorState message={tablesError} onRetry={fetchTables} />
            </div>
          ) : tables.length === 0 ? (
            <div className="ui-card">
              <EmptyState icon={<Utensils className="w-7 h-7" />} title="Stollar yo'q" description="Avval «Stollar» bo'limida stol qo'shing." />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {tables.map((t) => {
                const th = tone(t.status);
                return (
                  <button
                    key={t.uuid}
                    type="button"
                    onClick={() => handleTableSelect(t)}
                    className={`min-h-[112px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer ${th.card} ${
                      t.uuid === selectedTableUuid ? 'ring-2 ring-brand' : ''
                    }`}
                  >
                    <Badge tone={th.badge}>{th.label}</Badge>
                    <span className="text-[18px] font-black tracking-tightest break-words leading-tight">{t.table_number}</span>
                    <span className="text-[12px] text-muted">{t.capacity} kishilik</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------- checkout panel */
  const checkoutBody = (
    <div className="space-y-5">
      {cart.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title="Savat bo'sh" description={`Menyudan ${w.product.toLowerCase()} qo'shing`} className="py-8" />
      ) : (
        <div className="divide-y divide-edge">
          {cart.map((i, idx) => {
            const q = quoteLine(idx);
            const free = Number(q?.free_quantity) || 0;
            return (
            <div key={keyOf(i)} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-ink truncate" title={i.product.name}>
                  {i.product.name}
                  {i.product.kind === 'SET' && <span className="ml-1.5 align-middle"><Badge tone="info">Set</Badge></span>}
                </div>
                {i.options && i.options.length > 0 && <div className="text-[12px] text-muted truncate">{i.options.map((o) => o.name).join(', ')}</div>}
                <div className="text-[13px] text-muted">
                  {formatMoney(q ? q.unit_price : unitPrice(i.product, i.options, i.packaging))}
                  {(i.packaging || i.product.unit === 'KG') && <span> · {qtyText(i)}</span>}
                  {q && <span className="ml-2 font-bold text-ink tabular-nums">= {formatMoney(q.line_total)}</span>}
                  {!i.product.is_available && <span className="ml-2 text-danger-ink font-semibold">Tugagan</span>}
                </div>
                {(free > 0 || q?.promotion_label) && (
                  <div className="text-[12px] font-bold text-brand">
                    {q?.promotion_label || 'Aksiya'}{free > 0 && `: ${free} ta bepul`}
                  </div>
                )}
              </div>
              {i.product.unit === 'KG' && !i.packaging ? (
                <span className="px-3 h-11 inline-flex items-center rounded-xl bg-field text-[14px] font-extrabold tabular-nums">{qtyText(i)}</span>
              ) : (
                <QtyStepper value={i.quantity} min={0} onChange={(v) => setLineQty(keyOf(i), v)} />
              )}
              <button
                type="button"
                aria-label="O'chirish"
                onClick={() => setLineQty(keyOf(i), 0)}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-danger hover:bg-danger-soft cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            );
          })}
        </div>
      )}

      {quoteError && <InlineAlert tone="danger">{quoteError}</InlineAlert>}

      {unavailableInCart.length > 0 && (
        <InlineAlert tone="warning">
          Savatdagi {unavailableInCart.length} ta mahsulot hozir mavjud emas. Ularni olib tashlang.
        </InlineAlert>
      )}

      {serviceType === 'DINE_IN' && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-field">
          <div className="flex items-center gap-2.5 min-w-0">
            <Utensils className="w-5 h-5 text-brand shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] text-muted">Tanlangan stol</div>
              <div className="text-[15px] font-extrabold truncate">{selectedTable ? `Stol ${selectedTable.table_number}` : 'Tanlanmagan'}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => updateActiveCart({ step: 'TABLE_SELECT' })}>
            O'zgartirish
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        <Input
          label="Mijoz ismi"
          placeholder="Ixtiyoriy"
          value={contactName}
          onChange={(e) => updateActiveCart({ contactName: e.target.value })}
          autoComplete="off"
        />
        <Input
          label="Telefon"
          type="tel"
          inputMode="tel"
          placeholder="+998 (90) 123-45-67"
          value={contactPhone}
          error={phoneError}
          onFocus={() => {
            if (!contactPhone) updateActiveCart({ contactPhone: '+998' });
          }}
          onBlur={() => {
            if (normalizePhone(contactPhone) === '') updateActiveCart({ contactPhone: '' });
          }}
          onChange={(e) => {
            setPhoneError(null);
            updateActiveCart({ contactPhone: maskPhoneInput(e.target.value) });
          }}
        />
      </div>

      {serviceType === 'DELIVERY' && (
        <div className="space-y-2">
          <Textarea
            label="Yetkazish manzili"
            rows={2}
            placeholder="Ko'cha, uy, podyezd, qavat, mo'ljal"
            value={address}
            onChange={(e) => updateActiveCart({ address: e.target.value })}
          />
          <ApiGap title="Mijoz joylashuvini xaritadan tanlash yo'q: create-delivery so'roviga muassasa koordinatalari yuboriladi (latitude/longitude). Kuryer marshruti uchun mijoz koordinatasi kerak.">
            Xaritada joy tanlash
          </ApiGap>
        </div>
      )}

      <div>
        <div className="text-[13px] font-semibold text-ink mb-1.5">To'lov turi</div>
        <Segmented options={PAYMENT_OPTIONS} value={paymentMethod} onChange={(v) => updateActiveCart({ paymentMethod: v })} />
      </div>

      <Textarea
        label="Izoh"
        rows={2}
        placeholder="Masalan: piyozsiz, achchiq qo'shilmasin"
        value={comment}
        onChange={(e) => updateActiveCart({ comment: e.target.value })}
      />

      <div className="rounded-2xl bg-field p-4 space-y-2 text-[14px]">
        <div className="flex justify-between text-muted">
          <span>Mahsulotlar ({itemsCount} ta)</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        {discountTotal > 0 && (
          <div className="flex justify-between text-brand font-semibold">
            <span>Aksiya / chegirma (hisobga olingan)</span>
            <span>−{formatMoney(discountTotal)}</span>
          </div>
        )}
        {serviceType === 'DELIVERY' && (
          <div className="flex justify-between text-muted">
            <span>Yetkazib berish</span>
            <span>{deliveryFee === null ? 'Server hisoblaydi' : deliveryFee === 0 ? 'Bepul' : formatMoney(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-1 border-t border-edge-strong">
          <span className="font-bold">{deliveryFee === null ? 'Jami (yetkazishsiz)' : 'Jami'}</span>
          <span className="text-[20px] font-black tracking-tightest">{formatMoney(total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button size="md" variant="outline" className="px-2 text-[13px]" loading={printingPreCheck} disabled={cart.length === 0} onClick={handlePrintPreCheck} icon={<FileText className="w-4 h-4" />}>
          Pre-chek
        </Button>
        <Button size="md" variant="outline" className="px-2 text-[13px]" loading={printingReceipt} disabled={cart.length === 0} onClick={() => handlePrintReceipt(true)} icon={<Printer className="w-4 h-4" />}>
          QR bilan
        </Button>
        <Button size="md" variant="outline" className="px-2 text-[13px]" disabled={cart.length === 0 || printingReceipt} onClick={() => handlePrintReceipt(false)} icon={<Printer className="w-4 h-4" />}>
          QR siz
        </Button>
      </div>

      {submitError && <InlineAlert tone="danger">{submitError}</InlineAlert>}
    </div>
  );

  const submitButton = (
    <Button size="xl" block loading={submitting} disabled={!isFormValid} onClick={handleSubmitOrder} icon={!submitting ? <CheckCircle className="w-5 h-5" /> : undefined}>
      {submitting ? 'Yuborilmoqda...' : `Buyurtma berish · ${formatMoney(total)}`}
    </Button>
  );

  /* ------------------------------------------------------- step: menu */
  const renderMenuStep = () => {
    const headerTitle =
      serviceType === 'DINE_IN' ? `Stol ${selectedTable?.table_number || ''}`.trim() : SERVICE_LABEL[serviceType];
    return (
      <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 items-start">
        <div className="min-w-0">
          {/* Sticky search + categories */}
          <div className="sticky top-[var(--appbar-h,56px)] z-20 -mx-4 md:-mx-8 lg:mx-0 px-4 md:px-8 lg:px-0 pt-2 pb-3 bg-canvas/95 backdrop-blur">
            <div className="flex items-center gap-2 mb-2.5">
              {!shop && (
                <button
                  type="button"
                  aria-label="Orqaga"
                  onClick={() => updateActiveCart({ step: serviceType === 'DINE_IN' ? 'TABLE_SELECT' : 'SERVICE_TYPE' })}
                  className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center hover:bg-field cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[18px] md:text-[20px] font-black tracking-tightest truncate">{headerTitle}</div>
              </div>
              {cart.length > 0 && (
                <Button size="sm" variant="ghost" className="text-danger-ink" onClick={clearCart}>
                  Tozalash
                </Button>
              )}
            </div>
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={`${w.product} qidirish...`} />
            <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
              {[{ uuid: 'all', name: `Barcha ${w.products.toLowerCase()}` }, ...categories].map((c) => {
                const active = activeCategoryUuid === c.uuid;
                return (
                  <button
                    key={c.uuid}
                    type="button"
                    onClick={() => setActiveCategoryUuid(c.uuid)}
                    className={`shrink-0 h-10 px-4 rounded-xl text-[13px] font-bold whitespace-nowrap transition cursor-pointer ${
                      active ? 'bg-brand text-white' : 'bg-surface border border-edge text-ink hover:bg-field'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
              <span className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-dashed border-edge-strong text-[13px] font-bold text-subtle">
                Setlar
                <ApiGap title="Setlarni kassadan buyurtma qilish: GET /partner/my/sets/ va buyurtma items[].set hali backendda yo'q (D:\\Milliy\\API_CONTRACT_SETS_PROMOS.md)" />
              </span>
            </div>
          </div>

          {/* Product grid */}
          {loadingCatalog ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="ui-card overflow-hidden">
                  <Skeleton className="aspect-[4/3] rounded-none" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : errorCatalog ? (
            <div className="ui-card">
              <ErrorState title="Menyuni yuklab bo'lmadi" message={errorCatalog} onRetry={fetchCatalog} />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="ui-card">
              <EmptyState
                icon={<FolderOpen className="w-7 h-7" />}
                title={categories.length === 0 ? 'Menyu bo‘sh' : 'Hech narsa topilmadi'}
                description={categories.length === 0 ? "«Menyu» bo'limida faol kategoriya va mahsulot qo'shing." : "Kategoriya yoki qidiruvni o'zgartiring."}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const qty = qtyOf(p.uuid);
                return (
                  <div
                    key={p.uuid}
                    className={`bg-surface border rounded-2xl overflow-hidden flex flex-col ${
                      qty > 0 ? 'border-brand/40 ring-1 ring-brand/20' : 'border-edge'
                    } ${!p.is_available ? 'opacity-60' : ''}`}
                  >
                    <button
                      type="button"
                      disabled={!p.is_available}
                      onClick={() => addToCart(p)}
                      className="text-left flex-1 flex flex-col cursor-pointer disabled:cursor-not-allowed"
                    >
                      <div className="relative aspect-[4/3] bg-field flex items-center justify-center overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingBag className="w-8 h-8 text-subtle" />
                        )}
                        <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
                          {p.discount > 0 && <Badge tone="danger">-{p.discount}%</Badge>}
                          {p.promotion?.label && <Badge tone="gold">{p.promotion.label}</Badge>}
                          {p.kind === 'SET' && <Badge tone="info">Set</Badge>}
                        </span>
                        {!p.is_available && (
                          <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <Badge tone="neutral">Tugagan</Badge>
                          </span>
                        )}
                        {qty > 0 && (
                          <span className="absolute top-2 right-2 min-w-[28px] h-7 px-2 rounded-full bg-brand text-white text-[13px] font-extrabold flex items-center justify-center">
                            {qty}
                          </span>
                        )}
                      </div>
                      <div className="p-3 pb-2 flex-1">
                        <div className="text-[14px] font-bold text-ink leading-snug line-clamp-2">{p.name}</div>
                        {p.kind === 'SET' && p.set_items && p.set_items.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-muted line-clamp-2">{p.set_items.map((s) => `${s.quantity}× ${s.name}`).join(", ")}</div>
                        )}
                        <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[15px] font-extrabold text-ink">{formatMoney(p.price)}</span>
                          {p.discount > 0 && <span className="text-[12px] text-subtle line-through">{formatMoney(p.original_price, false)}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="px-3 pb-3">
                      {qty > 0 && !isConfigurable(p) ? (
                        <div className="flex items-center bg-brand-soft rounded-xl">
                          <button
                            type="button"
                            aria-label="Kamaytirish"
                            onClick={() => setQty(p, qty - 1)}
                            className="h-11 flex-1 flex items-center justify-center text-brand rounded-xl hover:bg-brand/10 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="text-[15px] font-extrabold text-brand tabular-nums min-w-[2rem] text-center">{qty}</span>
                          <button
                            type="button"
                            aria-label="Ko'paytirish"
                            disabled={!p.is_available}
                            onClick={() => addToCart(p)}
                            className="h-11 flex-1 flex items-center justify-center text-brand rounded-xl hover:bg-brand/10 cursor-pointer disabled:opacity-40"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <Button block variant="secondary" disabled={!p.is_available} onClick={() => addToCart(p)} icon={<Plus className="w-4 h-4" />}>
                          Qo'shish
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* space for floating cart bar */}
          {cart.length > 0 && <div className="lg:hidden h-20" aria-hidden />}
        </div>

        {/* Desktop cart column */}
        <aside className="hidden lg:flex flex-col sticky top-[calc(var(--appbar-h,56px)+12px)] max-h-[calc(100vh-var(--appbar-h,56px)-24px)] bg-surface border border-edge rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-edge flex items-center justify-between">
            <h3 className="text-[17px] font-extrabold tracking-tightest">Savat</h3>
            <span className="text-[13px] text-muted">{itemsCount} ta</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{checkoutBody}</div>
          <div className="border-t border-edge p-4">{submitButton}</div>
        </aside>

        <ProductConfigSheet product={configuring} onClose={() => setConfiguring(null)} onConfirm={(cfg) => configuring && addConfigured(configuring, cfg)} />

        {/* Mobile / tablet floating cart bar */}
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => setCartSheetOpen(true)}
            className="lg:hidden fixed z-30 left-4 right-4 md:left-auto md:right-8 md:w-[400px] bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+10px)] md:bottom-5 h-14 px-4 rounded-2xl bg-brand text-white shadow-pop flex items-center justify-between gap-3 cursor-pointer animate-slide-up"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="min-w-[28px] h-7 px-2 rounded-lg bg-white/20 text-[14px] font-extrabold flex items-center justify-center">{itemsCount}</span>
              <span className="text-[15px] font-extrabold truncate">Savat</span>
            </span>
            <span className="flex items-center gap-1.5 text-[16px] font-black tracking-tightest">
              {formatMoney(total)}
              <ChevronUp className="w-5 h-5" />
            </span>
          </button>
        )}

        <Sheet
          open={cartSheetOpen}
          onClose={() => setCartSheetOpen(false)}
          title="Savat"
          subtitle={`${headerTitle} · ${itemsCount} ta`}
          size="md"
          footer={submitButton}
        >
          {checkoutBody}
        </Sheet>
      </div>
    );
  };

  return (
    <div className="pt-3 animate-fade-in">
      {!shop && shiftOpen === false && (
        <InlineAlert tone="warning" className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">Smena ochilmagan — smenani ochmaguncha buyurtma yaratib bo'lmaydi.</span>
            <Button size="sm" onClick={() => navigate('/shift')}>Smenani ochish</Button>
          </div>
        </InlineAlert>
      )}
      {cartTabsBar}
      {step === 'SERVICE_TYPE' && !shop && renderServiceTypeStep()}
      {step === 'TABLE_SELECT' && !shop && renderTableSelectStep()}
      {(step === 'MENU' || shop) && renderMenuStep()}

      {submitSuccess && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-6 animate-fade-in" role="status">
          <div className="w-full max-w-sm bg-surface rounded-3xl shadow-pop p-7 text-center animate-slide-up">
            <span className="mx-auto w-16 h-16 rounded-full bg-brand-soft text-brand flex items-center justify-center">
              <CheckCircle className="w-9 h-9" />
            </span>
            <h3 className="mt-4 text-[20px] font-black tracking-tightest">Buyurtma yaratildi</h3>
            <p className="mt-1 text-[14px] text-muted">Buyurtmalar navbatiga o'tilmoqda...</p>
            <Button className="mt-5" block size="lg" onClick={() => navigate('/orders')}>
              Buyurtmalarga o'tish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateOrderPage;
