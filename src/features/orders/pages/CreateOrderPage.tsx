import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderOpen,
  Lock,
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
import type { Order, PaymentPart, PosItemInput, PosQuote } from '../services/ordersApi';
import { PaymentSheet } from '../components/queue/PaymentSheet';
import { tablesApi } from '../../tables/services/tablesApi';
import type { TableModel } from '../../tables/services/tablesApi';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { printKitchenTicket, printPreCheck as printPreCheckUtil, printReceipt as printReceiptUtil, printReceiptPreview as printReceiptPreviewUtil } from '../utils/printing';
import { currentFilial, enqueueOrder, isNetworkError, newClientUuid, withCache, type QueuedKind } from '../../../core/lib/offline';
import { useToast } from '../../../core/components/ToastProvider';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  InlineAlert,
  Input,
  QtyStepper,
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../../../core/ui';
import { classifyError, getErrorMessage, isShiftClosed } from '../../../core/lib/errors';
import { formatMoney, maskPhoneInput } from '../../../core/lib/format';
import { getPartner, isOwner, isShop, wording } from '../../../core/lib/session';
import { useOwnerFilials, useWorkingFilial } from '../../../core/lib/useWorkingFilial';
import { useTariff } from '../../../core/lib/tariff';
import { shiftApi } from '../../shifts/services/shiftApi';
import { callsApi } from '../../calls/callsApi';
import { PhoneCustomerInput } from '../../customers/PhoneCustomerInput';
import { t } from '../../../core/i18n';
import { ProductConfigSheet, isConfigurable, lineKey, unitPrice } from '../components/ProductConfigSheet';
import { priceRange } from '../utils/posCart';
import type { LineConfig } from '../components/ProductConfigSheet';
import { CartTotals } from '../components/CartTotals';
import { flyToCart as flyToCartUtil } from '../utils/flyToCart';
import {
  buildPosItems,
  cartSummary,
  countItems,
  dealNote,
  deliveryFeeFor,
  filterProducts,
  giftOf,
  keyOf,
  lineName,
  linePrice,
  mapCategories,
  mapPosProduct,
  orderTotal,
  qtyText,
} from '../utils/posCart';
import type { CartLine, CatalogCategory, CatalogProduct } from '../utils/posCart';

type Product = CatalogProduct;
type Category = CatalogCategory;
type CartItem = CartLine;

type ServiceType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

interface CartTab {
  id: string;
  name: string;
  serviceType: ServiceType;
  selectedTableUuid: string;
  contactName: string;
  contactPhone: string;
  address: string;
  comment: string;
  /** Qo'ng'iroqdan ochilgan buyurtma: yaratilgach shu call yozuvi `resolve` qilinadi */
  callUuid?: string;
  /** O'z-o'ziga xizmat zali (stol o'rniga): buyurtma stolsiz, xizmat haqisiz */
  hallUuid?: string;
  hallName?: string;
  cart: CartItem[];
  step: 'SERVICE_TYPE' | 'TABLE_SELECT' | 'MENU';
}

const CARTS_KEY = 'milliygo_active_carts';
const CART_ID_KEY = 'milliygo_active_cart_id';

const SERVICE_LABEL: Record<ServiceType, string> = {
  DELIVERY: t('type.delivery'),
  PICKUP: t('type.pickup'),
  DINE_IN: t('type.tableOrder'),
};

/** Oxirgi buyurtma turi — QURILMA bo'yicha eslab qolinadi (kassada bitta odam ishlaydi): keyingi savat shu turdan boshlanadi */
const LAST_TYPE_KEY = 'milliygo_pos_last_type';
interface LastType {
  serviceType: ServiceType;
  hallUuid?: string;
  hallName?: string;
  /** O'z-o'ziga xizmat zali qaysi filialniki — boshqa filialda zal eslab qolinmaydi */
  filial?: string;
}
const readLastType = (): LastType | null => {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_TYPE_KEY) || 'null');
    if (v && (v.serviceType === 'DELIVERY' || v.serviceType === 'PICKUP' || v.serviceType === 'DINE_IN')) return v as LastType;
  } catch {
    /* buzilgan yozuv — tanlov ekrani ko'rsatiladi */
  }
  return null;
};
const saveLastType = (t: LastType) => {
  try {
    localStorage.setItem(LAST_TYPE_KEY, JSON.stringify(t));
  } catch {
    /* localStorage ishlamasa — har safar tur so'raladi */
  }
};

/** Savatning boshlang'ich turi va qadami (eslab qolingan turdan) */
type CartStart = Pick<CartTab, 'serviceType' | 'hallUuid' | 'hallName' | 'step'>;

const newCartTab = (num: number, shop: boolean, start?: CartStart): CartTab => ({
  id: `cart-${Date.now()}-${num}`,
  name: `Savat ${num}`,
  serviceType: 'DELIVERY',
  selectedTableUuid: '',
  contactName: '',
  contactPhone: '',
  address: '',
  comment: '',
  cart: [],
  // Shops only deliver — there is nothing to choose, go straight to the menu.
  step: shop ? 'MENU' : 'SERVICE_TYPE',
  ...(shop ? {} : start),
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
  // A3: qaysi filial smenasi tekshirilishi — pastda (buyurtma filiali aniqlangach)
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const { tariff } = useTariff();
  const lockedService = (t: ServiceType) => (t === 'PICKUP' && !tariff.allow_pickup) || (t === 'DINE_IN' && !tariff.allow_dine_in);
  /** Eslab qolingan tur: Olib ketish/Yetkazish/o'z-o'ziga xizmat zali → menyu; stol → stol tanlash; yo'q/qulflangan → tur tanlash */
  const startOfCart = (): CartStart | undefined => {
    if (shop) return undefined;
    const last = readLastType();
    if (!last || !allowedServices.includes(last.serviceType) || lockedService(last.serviceType)) return undefined;
    if (last.serviceType !== 'DINE_IN') return { serviceType: last.serviceType, hallUuid: undefined, hallName: undefined, step: 'MENU' };
    if (last.hallUuid) {
      if (last.filial !== (currentFilial() || '')) return undefined;
      return { serviceType: 'DINE_IN', hallUuid: last.hallUuid, hallName: last.hallName || 'Zal', step: 'MENU' };
    }
    return { serviceType: 'DINE_IN', hallUuid: undefined, hallName: undefined, step: 'TABLE_SELECT' };
  };

  // Catalog
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
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
    return [{ ...newCartTab(1, shop, startOfCart()), id: 'cart-1' }];
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
  /** Xato turi qayta urinishga arziydimi (server nosozligi, javob kelmadi) — «Qayta urinish» tugmasi */
  const [submitRetryable, setSubmitRetryable] = useState(false);
  /** Oxirgi yuborish urinishi: shu buyurtma qayta yuborilsa client_uuid o'zgarmaydi (ikki marta yaratilmasin) */
  const retryAttempt = useRef<{ key: string; uuid: string } | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  /** Oxirgi buyurtma internet yo'qligi sababli navbatga yozildi */
  const [queuedOffline, setQueuedOffline] = useState(false);
  /** Menyu/stollar keshdan (internet yo'q) */
  const [fromCache, setFromCache] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Rahbar (bir nechta filial): buyurtma qaysi filialga yozilishini tanlaydi. Tanlangan ishlayotgan filial yoki asosiy filial — boshlang'ich.
  const owner = isOwner();
  const { filials: ownerFilials } = useOwnerFilials();
  const [workingFilial, setWorkingFilial] = useWorkingFilial();
  const [filialChoice, setFilialChoice] = useState<string>('');
  const needFilialChoice = owner && ownerFilials.length > 1;
  const effectiveFilial = needFilialChoice
    ? filialChoice || workingFilial || ownerFilials.find((f) => f.is_main)?.uuid || ownerFilials[0]?.uuid || ''
    : '';
  const [printingPreCheck, setPrintingPreCheck] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  /** Mijoz, telefon, manzil, izoh — odatda yashirin (stol savatidagidek) */
  const [showExtra, setShowExtra] = useState(false);

  /** Mahsulot bosilganda rasmi savat tomon uchib boradi (savat ko'rinmasa — animatsiya yo'q) */
  const flyToCart = (card: HTMLElement) => flyToCartUtil(card, document.getElementById('new-order-cart-panel'));
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  /* ------------------------------------- qo'ng'iroqdan buyurtma ochish */
  // `/new-order?phone=+998…&name=…&call=<uuid>` — hamkor telefonidagi ilova qo'ng'iroqni aniqlagan va
  // alert-kartadan "Buyurtma ochish" bosilgan. Bo'sh savat bo'lsa shuni to'ldiramiz, bo'lmasa yangi savat ochamiz.
  const [searchParams, setSearchParams] = useSearchParams();
  const prefilled = useRef('');
  useEffect(() => {
    const key = `${searchParams.get('phone') || ''}|${searchParams.get('call') || ''}`;
    if (prefilled.current === key) return;
    const rawPhone = searchParams.get('phone');
    if (!rawPhone) return;
    prefilled.current = key;
    const patch = {
      contactPhone: maskPhoneInput(rawPhone),
      contactName: searchParams.get('name') || '',
      callUuid: searchParams.get('call') || undefined,
    };
    const current = activeCarts.find((c) => c.id === activeCartId) || activeCarts[0];
    if (current && current.cart.length === 0 && normalizePhone(current.contactPhone) === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL'dagi bir martalik qo'ng'iroq ma'lumotini savatga ko'chirish
      setActiveCarts((prev) => prev.map((c) => (c.id === current.id ? { ...c, ...patch } : c)));
      setActiveCartId(current.id);
    } else {
      const tab = { ...newCartTab(activeCarts.length + 1, shop), ...patch };
      setActiveCarts((prev) => [...prev, tab]);
      setActiveCartId(tab.id);
    }
    // URL tozalanadi: sahifa yangilansa qayta to'ldirilmasin
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, activeCarts, activeCartId, shop]);

  // `/new-order?type=PICKUP|DELIVERY` — kassadagi «Saboy» / «Dostavka» bo'limidan: shu turdagi savat ochiladi
  const typeParam = searchParams.get('type');
  const hallParam = searchParams.get('hall') || '';
  const hallNameParam = searchParams.get('hall_name') || '';
  const typeApplied = useRef('');
  useEffect(() => {
    const selfService = typeParam === 'DINE_IN' && !!hallParam;
    if ((typeParam !== 'PICKUP' && typeParam !== 'DELIVERY' && !selfService) || shop) return;
    const applyKey = `${typeParam}|${hallParam}`;
    if (typeApplied.current === applyKey) return;
    typeApplied.current = applyKey;
    const svc = typeParam as ServiceType;
    const hall = selfService ? { hallUuid: hallParam, hallName: hallNameParam || 'Zal' } : { hallUuid: undefined, hallName: undefined };
    saveLastType({ serviceType: svc, ...hall, ...(selfService ? { filial: currentFilial() || '' } : {}) });
    const current = activeCarts.find((c) => c.id === activeCartId) || activeCarts[0];
    if (current && current.cart.length === 0 && normalizePhone(current.contactPhone) === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL'dagi bir martalik tanlovni savatga ko'chirish
      setActiveCarts((prev) => prev.map((c) => (c.id === current.id ? { ...c, serviceType: svc, selectedTableUuid: '', ...hall, step: 'MENU' as const } : c)));
      setActiveCartId(current.id);
    } else {
      const tab = { ...newCartTab(activeCarts.length + 1, shop), serviceType: svc, ...hall, step: 'MENU' as const };
      setActiveCarts((prev) => [...prev, tab]);
      setActiveCartId(tab.id);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('type');
    next.delete('hall');
    next.delete('hall_name');
    setSearchParams(next, { replace: true });
  }, [typeParam, hallParam, hallNameParam, searchParams, setSearchParams, activeCarts, activeCartId, shop]);

  /* ------------------------------------------------------------ tables */
  const fetchTables = useCallback(async () => {
    if (shop) return;
    setLoadingTables(true);
    setTablesError(null);
    try {
      const { data: response, fromCache: cached } = await withCache(`tables:${currentFilial() || getPartner()?.uuid || '-'}`, () => tablesApi.getTables());
      if (cached) setFromCache(true);
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
  const { cart, serviceType, selectedTableUuid, contactName, contactPhone, address, comment, step } = activeCart;
  /** O'z-o'ziga xizmat zali buyurtmasi: stol tanlanmaydi, xizmat haqi yo'q */
  const selfHall = serviceType === 'DINE_IN' && activeCart.hallUuid ? { uuid: activeCart.hallUuid, name: activeCart.hallName || 'Zal' } : null;
  const currentId = activeCart.id;

  // A3: restoran kassasi — buyurtma TUSHADIGAN filialda smena ochiq bo'lishi shart (server ham tekshiradi, SHIFT_CLOSED).
  // Xodim: o'z filiali (server biladi). Rahbar (bir nechta filial): tanlangan filial; stol buyurtmasi — ishlayotgan filial.
  // Rahbar «Barcha filiallar»da stol tanlasa — stol filiali oldindan noma'lum: oldindan bloklamaymiz, server hal qiladi.
  const dineInAnyFilial = needFilialChoice && serviceType === 'DINE_IN' && !workingFilial;
  const shiftFilial = needFilialChoice && !dineInAnyFilial ? (serviceType === 'DINE_IN' ? workingFilial || '' : effectiveFilial) : '';
  const shiftFilialName = shiftFilial ? ownerFilials.find((f) => f.uuid === shiftFilial)?.filial_name : undefined;
  useEffect(() => {
    if (shop) return;
    if (dineInAnyFilial) {
      setShiftOpen(null);
      return;
    }
    let alive = true;
    shiftApi
      // Ishlayotgan filialdan boshqa filial so'rovi kassa pastidagi smena holatiga tegmasin
      .getCurrentShift(shiftFilial || undefined, { silent: !!shiftFilial && shiftFilial !== workingFilial })
      .then((s) => alive && setShiftOpen(!!s))
      .catch(() => alive && setShiftOpen(null));
    return () => {
      alive = false;
    };
  }, [shop, shiftFilial, dineInAnyFilial, workingFilial]);
  const shiftClosedText = shiftFilialName ? t('cart.shiftClosedFilial', { name: shiftFilialName }) : t('cart.shiftClosed');
  /** «Smenani ochish»: rahbar boshqa filial uchun ochsa — umumiy filtr o'sha filialga o'tadi, Smena sahifasi shu filialni ko'rsatadi */
  const goOpenShift = () => {
    if (shiftFilial && shiftFilial !== workingFilial) setWorkingFilial(shiftFilial);
    navigate('/shift');
  };

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
  /** Savat sarlavhasi uchun: "Stol 4 · 1-qavat" (zal nomi bo'lsa) */
  const tableLabel = selectedTable
    ? `${t('cart.tableN', { n: selectedTable.table_number })}${selectedTable.hall_name ? ` · ${selectedTable.hall_name}` : ''}`
    : '';

  // Auto-name the active tab after the table / customer.
  useEffect(() => {
    const idx = activeCarts.findIndex((c) => c.id === currentId);
    const num = idx !== -1 ? idx + 1 : 1;
    let name = `Savat ${num}`;
    if (step !== 'SERVICE_TYPE') {
      if (serviceType === 'DINE_IN' && activeCart.hallUuid) name = `${activeCart.hallName || 'Zal'} #${num}`;
      else if (serviceType === 'DINE_IN') name = selectedTable ? `Stol ${selectedTable.table_number}` : `Stol tanlash #${num}`;
      else if (serviceType === 'DELIVERY') name = contactName.trim() ? `Yetkazish: ${contactName.trim()}` : `Yetkazish #${num}`;
      else if (serviceType === 'PICKUP') name = contactName.trim() ? `Olib ketish: ${contactName.trim()}` : `Olib ketish #${num}`;
    }
    if (activeCart.name !== name) updateActiveCart({ name });
  }, [serviceType, selectedTable, contactName, step, activeCart.name, activeCart.hallUuid, activeCart.hallName, activeCarts, currentId, updateActiveCart]);

  /* ----------------------------------------------------------- catalog */
  // silent: kassa ochiq turganda menyu jim yangilanadi (spinner/xato ko'rsatilmaydi) — hamkor panelida
  // mahsulot tahrirlansa (masalan, «O'lcham» opsiyalari qo'shilsa) kassa eski menyuda qolib ketmasin.
  const fetchCatalog = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingCatalog(true);
      setErrorCatalog(null);
    }
    try {
      const partnerUuid = getPartner()?.uuid;
      if (!partnerUuid) throw new Error("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");
      const { data: rawCats, fromCache: cached } = await withCache(`catalog:${partnerUuid}`, async () => {
        const res = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
        return res.data?.data?.categories || res.data?.categories || res.data?.data || res.data || [];
      });
      setFromCache(cached);
      const mapped: Category[] = mapCategories(rawCats, mapPosProduct, true);
      setCategories(mapped.filter((c) => c.is_active));
    } catch (err) {
      if (!silent) setErrorCatalog(getErrorMessage(err, "Menyuni yuklashda xatolik yuz berdi."));
    } finally {
      if (!silent) setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Kassa oynasiga qaytilganda (boshqa tab/panelda menyu tahrirlangan bo'lishi mumkin) menyu jim yangilanadi
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5000) return;
      last = Date.now();
      fetchCatalog(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
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
      callUuid: undefined,
      cart: [],
      contactName: '',
      contactPhone: '',
      address: '',
      selectedTableUuid: '',
      comment: '',
      step: shop ? 'MENU' : 'SERVICE_TYPE',
      ...startOfCart(),
    });
  };

  const addNewCartTab = () => {
    const tab = newCartTab(activeCarts.length + 1, shop, startOfCart());
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
  const filteredProducts = useMemo(() => filterProducts(categories, activeCategoryUuid), [categories, activeCategoryUuid]);

  // Kg qatori "1 ta buyurtma pozitsiyasi" hisoblanadi, kasr son emas
  const itemsCount = countItems(cart);

  /** Savat qatorlari serverga yuboriladigan shaklda (quote va buyurtma yaratishda bir xil) */
  // Promo qatorida to'langan + avto-sovg'a yuboriladi (quote ham, buyurtma ham); server bepulni tasdiqlaydi (posCart.buildPosItems)
  const buildItems = (lines: CartItem[]): PosItemInput[] => buildPosItems(lines);

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
  // Jami — Stol oynasi bilan bitta formula (posCart.cartSummary). O'z-o'ziga xizmat zalida xizmat haqi yo'q (server ham qo'shmaydi)
  const { subtotal, discount: discountTotal, serviceCharge, serviceChargePercent } = cartSummary(cart, quote, { noServiceCharge: !!selfHall });
  const quoteLine = (idx: number) => quote?.items[idx];

  // BUGFIX: the old code invented an 8 000 so'm fee / 50 000 threshold when the partner
  // profile didn't carry them. Now we only show a fee we actually know; otherwise the
  // server computes it and we say so.
  const knownFee = partnerDetails?.delivery_fee != null && partnerDetails.delivery_fee !== '' ? parseFloat(partnerDetails.delivery_fee) : null;
  const knownThreshold =
    partnerDetails?.free_delivery_threshold != null && partnerDetails.free_delivery_threshold !== ''
      ? parseFloat(partnerDetails.free_delivery_threshold)
      : null;
  const deliveryFee = deliveryFeeFor(serviceType === 'DELIVERY', subtotal, knownFee, knownThreshold);
  const total = orderTotal(subtotal, serviceCharge, deliveryFee);

  const unavailableInCart = cart.filter((i) => !i.product.is_available);
  const isFormValid =
    cart.length > 0 && unavailableInCart.length === 0 && (serviceType !== 'DINE_IN' || !!selfHall || selectedTableUuid.trim().length > 0);

  /* ------------------------------------------------------------ steps */
  const handleServiceSelect = (type: ServiceType) => {
    if (lockedService(type)) {
      toast.info(`${SERVICE_LABEL[type]} tarifingizda yo'q. Tarifni oshiring.`);
      navigate(`/plan?need=${type === 'PICKUP' ? 'pickup' : 'dine_in'}`);
      return;
    }
    saveLastType({ serviceType: type });
    updateActiveCart({ serviceType: type, hallUuid: undefined, hallName: undefined, step: type === 'DINE_IN' ? 'TABLE_SELECT' : 'MENU' });
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
        table_number: serviceType === 'DINE_IN' ? selfHall?.name || selectedTable?.table_number || null : null,
        total_price: total,
        items: cart.map((i, idx) => {
          const q = quoteLine(idx);
          // Aksiya hisobga olingan qator summasi: narx = qator summasi / to'langan dona (sovg'alar bepul)
          const unit = q ? Number(q.line_total) / (i.quantity || 1) : unitPrice(i.product, i.options, i.packaging);
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
          delivery_type: serviceType,
          delivery_type_display: SERVICE_LABEL[serviceType],
          table_number: serviceType === 'DINE_IN' ? selfHall?.name || selectedTable?.table_number || null : null,
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
          service_charge_percent: serviceChargePercent || undefined,
          service_charge_amount: serviceCharge || undefined,
          total_price: total,
          payment_method_display: 'Naqd',
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
  // O'z-o'ziga xizmat zali: to'lov OLDINDAN — avval to'lov oynasi, so'ng buyurtma to'lov bilan bitta so'rovda
  const [prepayOpen, setPrepayOpen] = useState(false);
  // Savat tozalangach ham muvaffaqiyat oynasi o'z-o'ziga xizmat matnini ko'rsatsin
  const [successSelf, setSuccessSelf] = useState(false);

  const handleSubmitOrder = async (prepaid?: { method: string; payments?: PaymentPart[] }) => {
    if (!isFormValid || submitting) return;
    if (!shop && shiftOpen === false) {
      toast.error(shiftClosedText);
      goOpenShift();
      return;
    }
    if (selfHall && !prepaid) {
      setPrepayOpen(true);
      return;
    }

    // BUGFIX: a phone field left at "+998" used to be sent as contact_phone "998".
    const phone = normalizePhone(contactPhone);
    if (phone === null) {
      setPhoneError("Telefon raqam to'liq emas: +998 (90) 123-45-67");
      setCartSheetOpen(true);
      return;
    }
    if (serviceType === 'DELIVERY' && !phone) {
      // Yetkazib berishda FAQAT telefon majburiy (manzil va xarita nuqtasi — hamkor ixtiyoriy kiritadi).
      setPhoneError("Yetkazib berish uchun mijoz telefon raqami majburiy");
      setCartSheetOpen(true);
      return;
    }
    setPhoneError(null);
    setSubmitting(true);
    setSubmitError(null);

    // Mijoz koordinatalari yuborilmaydi: xaritadan tanlash yo'q va muassasa koordinatalarini mijozniki deb yuborish
    // kuryerni noto'g'ri yo'naltirardi. Faqat telefon majburiy; manzil matni ixtiyoriy.
    const items = buildItems(cart);
    const kind: QueuedKind = serviceType === 'DELIVERY' ? 'DELIVERY' : serviceType === 'PICKUP' ? 'PICKUP' : 'DINE_IN';
    // Har buyurtmaga qurilma ID'si: internet uzilib qayta yuborilsa ham server bir marta yaratadi.
    // Xatodan keyin AYNAN shu buyurtma qayta yuborilsa («Qayta urinish») — o'sha ID: server xato bergan bo'lsa-yu,
    // aslida yaratgan bo'lsa ham ikkinchi buyurtma ochilmaydi.
    const attemptKey = JSON.stringify([currentId, kind, items, selectedTableUuid, activeCart.hallUuid || '', phone, contactName, address, comment, prepaid || null]);
    const clientUuid = retryAttempt.current?.key === attemptKey ? retryAttempt.current.uuid : newClientUuid();
    retryAttempt.current = { key: attemptKey, uuid: clientUuid };
    const payload =
      kind === 'DELIVERY'
        ? {
            filial_uuid: effectiveFilial || undefined,
            contact_phone: phone || undefined,
            contact_name: contactName.trim() || undefined,
            address: address.trim() || undefined,
            payment_method: 'CASH',
            description: comment.trim() || "Izoh yo'q",
            items,
            client_uuid: clientUuid,
          }
        : kind === 'PICKUP'
          ? {
              filial_uuid: effectiveFilial || undefined,
              contact_phone: phone || undefined,
              contact_name: contactName.trim() || undefined,
              payment_method: 'CASH',
              description: comment.trim() || undefined,
              items,
              client_uuid: clientUuid,
            }
          : {
              ...(selfHall ? { hall: selfHall.uuid } : { table: selectedTableUuid }),
              payment_method: prepaid?.method || 'CASH',
              ...(prepaid?.payments?.length ? { payments: prepaid.payments } : {}),
              contact_phone: phone || undefined,
              contact_name: contactName.trim() || undefined,
              description: comment.trim() || undefined,
              items,
              client_uuid: clientUuid,
            };

    const finish = (orderUuid?: string) => {
      retryAttempt.current = null;
      // Qo'ng'iroqdan ochilgan bo'lsa — shu call yozuvi yopiladi (xato bo'lsa buyurtmaga ta'sir qilmaydi)
      if (activeCart.callUuid && orderUuid) callsApi.resolve(activeCart.callUuid, orderUuid).catch(() => undefined);
      setCartSheetOpen(false);
      setSubmitSuccess(true);
      setSuccessSelf(!!selfHall);
      if (activeCarts.length > 1) removeTab(currentId);
      else clearCart();
      if (selfHall && orderUuid) {
        // Oldindan to'langan: chek (buyurtma raqami bilan) darhol chiqadi — mijoz shu raqam bilan kutadi
        printReceiptUtil(orderUuid, true).catch((err) => toast.error(getErrorMessage(err, 'Chekni chop etib bo‘lmadi.')));
      }
      redirectTimer.current = setTimeout(() => navigate(selfHall ? '/tables' : '/orders'), 1800);
    };

    let created: { data?: { uuid?: string } } | undefined;
    try {
      if (kind === 'DELIVERY') created = await ordersApi.createDeliveryOrder(payload as Parameters<typeof ordersApi.createDeliveryOrder>[0]);
      else if (kind === 'PICKUP') created = await ordersApi.createPickupOrder(payload as Parameters<typeof ordersApi.createPickupOrder>[0]);
      else {
        created = await ordersApi.createDineInOrder(payload as Parameters<typeof ordersApi.createDineInOrder>[0]);
        if (selectedTableUuid && !selfHall) tablesApi.updateTableStatus(selectedTableUuid, 'OCCUPIED').catch(() => undefined);
      }
      setQueuedOffline(false);
      finish(created?.data?.uuid);
    } catch (err) {
      if (!isNetworkError(err)) {
        // Server: shu filialda smena yopiq — tepada «Smenani ochish» tugmali ogohlantirish chiqadi
        if (isShiftClosed(err) && !dineInAnyFilial) setShiftOpen(false);
        setSubmitError(getErrorMessage(err, "Buyurtma yaratishda xatolik. Maydonlar va internetni tekshiring."));
        setSubmitRetryable(classifyError(err).retryable);
        return;
      }
      // Internet yo'q: buyurtma navbatga yoziladi, oshxona cheki shu yerning o'zida chiqadi
      const label =
        kind === 'DINE_IN'
          ? selfHall
            ? selfHall.name
            : `${selectedTable?.table_number ?? ''}-stol`
          : `${kind === 'PICKUP' ? 'Olib ketish' : 'Yetkazish'}${contactName.trim() ? ` · ${contactName.trim()}` : ''}`;
      try {
        enqueueOrder({ id: clientUuid, kind, payload, label, total: subtotal + serviceCharge });
      } catch (qErr) {
        setSubmitError(getErrorMessage(qErr, "Buyurtmani navbatga yozib bo'lmadi. Qaytadan tizimga kiring."));
        setSubmitRetryable(false);
        return;
      }
      printKitchenTicket({
        table_number: kind === 'DINE_IN' ? selfHall?.name || selectedTable?.table_number : null,
        delivery_type: kind,
        description: comment.trim() || undefined,
        items: cart.map((i) => ({
          name: i.packaging ? i.product.name + ' (' + i.packaging.name + ')' : i.product.name,
          quantity: i.quantity,
          options: (i.options || []).map((o) => o.name).join(', '),
        })),
      }).catch(() => undefined);
      setQueuedOffline(true);
      finish();
    } finally {
      setSubmitting(false);
    }
  };

  /* =============================================================== UI */

  const cartTabsBar = (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 py-1 lg:shrink-0">
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
      { type: 'DELIVERY', title: t('type.delivery'), desc: t('type.deliveryDesc'), icon: <Truck className="w-7 h-7" /> },
      { type: 'PICKUP', title: t('type.pickup'), desc: t('type.pickupDesc'), icon: <ShoppingBag className="w-7 h-7" /> },
      { type: 'DINE_IN', title: t('type.dineIn'), desc: t('type.dineInDesc'), icon: <Utensils className="w-7 h-7" /> },
    ];
    return (
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 animate-fade-in">
        <h2 className="text-[22px] md:text-[26px] font-black tracking-tightest">{t('type.pickTitle')}</h2>
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
  // Stol buyurtmasidagi savat bilan bir xil tuzilma: ro'yxat → qo'shimcha ma'lumot → jami → tugmalar
  const cartLines =
    cart.length === 0 ? (
      <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title={t('cart.empty')} description={`Menyudan ${w.product.toLowerCase()} qo'shing`} className="py-8" />
    ) : (
        <div className="space-y-2">
          {cart.map((i, idx) => {
            const q = quoteLine(idx);
            const gift = giftOf(i);
            const note = dealNote(i);
            return (
            <div key={keyOf(i)} className="rounded-2xl border border-edge bg-surface p-3 flex items-center gap-3">
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
                {gift > 0 ? (
                  <div className="text-[12px] font-bold text-brand">
                    {i.quantity} ta olindi + {gift} ta sovg'a 🎁
                  </div>
                ) : (
                  note && <div className="text-[12px] font-bold text-warning-ink">{note}</div>
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
    );

  const cartNotices = (
    <>
      {fromCache && (
        <InlineAlert tone="warning">Internet yo'q — menyu oxirgi saqlangan nusxadan. Buyurtmalar navbatga yoziladi va keyin yuboriladi.</InlineAlert>
      )}
      {quoteError && !fromCache && <InlineAlert tone="danger">{quoteError}</InlineAlert>}

      {unavailableInCart.length > 0 && (
        <InlineAlert tone="warning">
          Savatdagi {unavailableInCart.length} ta mahsulot hozir mavjud emas. Ularni olib tashlang.
        </InlineAlert>
      )}

      {selfHall && (
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-field">
          <Utensils className="w-5 h-5 text-brand shrink-0" />
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold truncate">{selfHall.name} · o'z-o'ziga xizmat</div>
            <div className="text-[12px] text-muted">Stolsiz: taom tayyor bo'lganda buyurtma raqami bilan chaqiriladi, to'lov oldindan</div>
          </div>
        </div>
      )}

      {/* Katta ekranda stol savat sarlavhasida ko'rinadi — bu blok faqat telefon/planshet oynasida */}
      {serviceType === 'DINE_IN' && !selfHall && (
        <div className="lg:hidden flex items-center justify-between gap-3 p-3 rounded-2xl bg-field">
          <div className="flex items-center gap-2.5 min-w-0">
            <Utensils className="w-5 h-5 text-brand shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] text-muted">Tanlangan stol</div>
              <div className="text-[15px] font-extrabold truncate">{tableLabel || 'Tanlanmagan'}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => updateActiveCart({ step: 'TABLE_SELECT' })}>
            {t('cart.change')}
          </Button>
        </div>
      )}

      {needFilialChoice && serviceType !== 'DINE_IN' && (
        <Select label="Filial" hint="Buyurtma shu filialga yoziladi" value={effectiveFilial} onChange={(e) => setFilialChoice(e.target.value)} required>
          {ownerFilials.map((f) => (
            <option key={f.uuid} value={f.uuid}>
              {f.filial_name} {f.is_main ? '(Asosiy)' : ''}
            </option>
          ))}
        </Select>
      )}
    </>
  );

  const mainInline = serviceType !== 'DINE_IN'; // Olib ketish / Yetkazish: ism, telefon, manzil — asosiy ma'lumot, doim ko'rinadi
  const extraSummary = (mainInline ? [comment] : [contactName, normalizePhone(contactPhone) ? contactPhone : '', comment]).filter(Boolean).join(', ');
  const extraToggle = (
    <button
      type="button"
      onClick={() => setShowExtra((v) => !v)}
      aria-expanded={showExtra}
      className="w-full flex items-center justify-between gap-2 py-2 text-left text-[13px] font-bold text-muted hover:text-ink cursor-pointer"
    >
      <span className="min-w-0 truncate">
        Qo'shimcha ma'lumot
        {!showExtra && extraSummary && <span className="font-semibold text-ink"> · {extraSummary}</span>}
      </span>
      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showExtra ? 'rotate-180' : ''}`} />
    </button>
  );
  const mainFields = (
    <div className="space-y-3 py-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        <Input
          label="Mijoz ismi"
          placeholder="Ixtiyoriy"
          value={contactName}
          onChange={(e) => updateActiveCart({ contactName: e.target.value })}
          autoComplete="off"
        />
        <PhoneCustomerInput
          value={contactPhone}
          name={contactName}
          error={phoneError}
          onPhoneChange={(v) => {
            setPhoneError(null);
            updateActiveCart({ contactPhone: v });
          }}
          onNameFound={(n) => updateActiveCart({ contactName: n })}
          onFocus={() => {
            if (!contactPhone) updateActiveCart({ contactPhone: '+998' });
          }}
          onBlur={() => {
            if (normalizePhone(contactPhone) === '') updateActiveCart({ contactPhone: '' });
          }}
        />
      </div>
      {serviceType === 'DELIVERY' && (
        <Textarea
          label="Yetkazish manzili (ixtiyoriy)"
          rows={2}
          placeholder="Ko'cha, uy, podyezd, qavat, mo'ljal"
          value={address}
          onChange={(e) => updateActiveCart({ address: e.target.value })}
        />
      )}
    </div>
  );

  const extraFields = (
    <div className="space-y-4 pb-2">
      {!mainInline && mainFields}
      {/* To'lov yaratishda so'ralmaydi: buyurtma naqd/to'lanmagan yaratiladi, to'lov usuli topshirishda (PaymentSheet) bir marta qabul qilinadi. */}
      <p className="text-[12px] text-muted">To'lov usuli bu yerda so'ralmaydi — buyurtma topshirilganda bir marta qabul qilinadi.</p>

      <Textarea
        label="Izoh"
        rows={2}
        placeholder="Masalan: piyozsiz, achchiq qo'shilmasin"
        value={comment}
        onChange={(e) => updateActiveCart({ comment: e.target.value })}
      />
    </div>
  );

  const totalsBlock = (
    <CartTotals
      countLabel={t('cart.totalCount', { n: itemsCount })}
      subtotal={subtotal}
      discount={discountTotal}
      showDelivery={serviceType === 'DELIVERY'}
      deliveryFee={deliveryFee}
      serviceCharge={serviceCharge}
      serviceChargePercent={serviceChargePercent}
      showServiceCharge={serviceCharge > 0}
      totalLabel={deliveryFee === null ? 'Umumiy summa (yetkazishsiz)' : 'Umumiy summa'}
      total={total}
    />
  );

  const goBack = () => updateActiveCart({ step: serviceType === 'DINE_IN' && !selfHall ? 'TABLE_SELECT' : 'SERVICE_TYPE' });
  // Kompyuter paneli: bitta qatorda (Orqaga — faqat belgi), joy savat ro'yxatiga qoladi
  const actionRow = (
    <div className={`grid gap-2 ${shop ? 'grid-cols-3' : 'grid-cols-[44px_1fr_1fr_1fr]'}`}>
      {!shop && (
        <Button variant="outline" className="!px-0" aria-label="Orqaga" title="Orqaga" icon={<ArrowLeft className="w-4 h-4" />} onClick={goBack} />
      )}
      <Button variant="outline" className="!px-2" icon={<Trash2 className="w-4 h-4" />} disabled={cart.length === 0 && !contactName && !comment} onClick={clearCart}>
        Tozalash
      </Button>
      <Button variant="outline" className="!px-2" icon={<FileText className="w-4 h-4" />} loading={printingPreCheck} disabled={cart.length === 0} onClick={handlePrintPreCheck}>
        Pre-chek
      </Button>
      <Button variant="outline" className="!px-2" icon={<Printer className="w-4 h-4" />} loading={printingReceipt} disabled={cart.length === 0} onClick={() => handlePrintReceipt(false)}>
        Chek
      </Button>
    </div>
  );
  const actionGrid = (
    <div className="grid grid-cols-2 gap-2">
      {!shop && (
        <Button variant="outline" icon={<ArrowLeft className="w-4 h-4" />} onClick={goBack}>
          Orqaga
        </Button>
      )}
      <Button variant="outline" icon={<Trash2 className="w-4 h-4" />} disabled={cart.length === 0 && !contactName && !comment} onClick={clearCart}>
        Tozalash
      </Button>
      <Button variant="outline" icon={<FileText className="w-4 h-4" />} loading={printingPreCheck} disabled={cart.length === 0} onClick={handlePrintPreCheck}>
        Pre-chek
      </Button>
      <Button variant="outline" icon={<Printer className="w-4 h-4" />} loading={printingReceipt} disabled={cart.length === 0} onClick={() => handlePrintReceipt(false)}>
        Chek
      </Button>
    </div>
  );

  // Telefon / planshet (Sheet): hammasi bitta aylanuvchi ro'yxatda
  const checkoutBody = (
    <div className="space-y-4">
      {cartLines}
      {cartNotices}
      {mainInline && mainFields}
      <div>
        {extraToggle}
        {showExtra && extraFields}
      </div>
      {totalsBlock}
      {actionGrid}
      {submitError && (
        <InlineAlert tone="danger" onRetry={submitRetryable && !submitting ? () => handleSubmitOrder() : undefined}>
          {submitError}
        </InlineAlert>
      )}
    </div>
  );

  const submitButton = (
    <Button size="xl" block loading={submitting} disabled={!isFormValid} onClick={() => handleSubmitOrder()} icon={!submitting ? <CheckCircle className="w-5 h-5" /> : undefined}>
      {submitting ? t('cart.sending') : selfHall ? t('cart.prepay') : t('cart.create')}
    </Button>
  );

  // Oldindan to'lov oynasi uchun buyurtma ko'rinishi (hali yaratilmagan — summa savatdan)
  const prepayOrder = prepayOpen && selfHall
    ? ({ uuid: `prepay-${currentId}`, id: 0, order_number: selfHall.name, total_price: total, payment_method: 'CASH',
        delivery_type: 'PICKUP', is_paid: false, table_number: null } as unknown as Order)
    : null;
  const prepaySheet = (
    <PaymentSheet
      order={prepayOrder}
      saving={submitting}
      title={t('cart.prepay')}
      subtitle={selfHall ? `${selfHall.name} · o'z-o'ziga xizmat — to'lovdan keyin oshxonaga chiqadi` : undefined}
      confirmLabel={t('cart.prepayConfirm')}
      onClose={() => !submitting && setPrepayOpen(false)}
      onSubmit={(method, _split, payments) => {
        setPrepayOpen(false);
        void handleSubmitOrder({ method, payments });
      }}
    />
  );

  /* ------------------------------------------------------- step: menu */
  const renderMenuStep = () => {
    const headerTitle =
      selfHall ? selfHall.name : serviceType === 'DINE_IN' ? tableLabel || t('cart.tableNone') : SERVICE_LABEL[serviceType];
    const tablePickNeeded = serviceType === 'DINE_IN' && !selfHall;
    const categoryList = [{ uuid: 'all', name: `Barcha ${w.products.toLowerCase()}`, count: productIndex.size }, ...categories.map((c) => ({ uuid: c.uuid, name: c.name, count: c.products.length }))];
    return (
      <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[minmax(0,1fr)] lg:gap-6 lg:flex-1 lg:min-h-0 items-start lg:items-stretch">
        <div className="min-w-0 lg:flex lg:flex-col lg:min-h-0 lg:h-full">
          {/* Sticky search + categories */}
          <div className="sticky top-[var(--appbar-h,56px)] z-20 -mx-4 md:-mx-8 lg:mx-0 px-4 md:px-8 lg:px-0 pt-2 pb-3 bg-canvas/95 backdrop-blur lg:static lg:shrink-0">
            <div className="flex items-center gap-2 mb-2.5">
              {!shop && (
                <button
                  type="button"
                  aria-label="Orqaga"
                  onClick={() => updateActiveCart({ step: serviceType === 'DINE_IN' && !selfHall ? 'TABLE_SELECT' : 'SERVICE_TYPE' })}
                  className="lg:hidden w-11 h-11 -ml-2 rounded-xl flex items-center justify-center hover:bg-field cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[18px] md:text-[20px] font-black tracking-tightest truncate">{headerTitle}</div>
              </div>
              {!shop && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 min-h-[44px] lg:min-h-0"
                  icon={<ArrowLeftRight className="w-4 h-4" />}
                  onClick={() => updateActiveCart({ step: 'SERVICE_TYPE' })}
                  title="Buyurtma turini almashtirish (savat saqlanadi)"
                >
                  <span className="sm:hidden">Turi</span>
                  <span className="hidden sm:inline">Turni almashtirish</span>
                </Button>
              )}
              {cart.length > 0 && (
                <Button size="sm" variant="ghost" className="lg:hidden text-danger-ink" onClick={clearCart}>
                  Tozalash
                </Button>
              )}
            </div>
            {/* Telefon/planshet: gorizontal chiplar; katta ekranda chapdagi ustun */}
            <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 lg:hidden">
              {categoryList.map((c) => {
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
            </div>
          </div>

          <div className="lg:flex-1 lg:min-h-0 lg:flex lg:gap-4">
          {/* Monoblok/katta ekran: kategoriyalar chapda ustun — hammasi ko'rinadi, o'zi alohida aylanadi */}
          {!loadingCatalog && !errorCatalog && categories.length > 0 && (
            <nav aria-label={t('cart.categories')} className="hidden lg:flex flex-col gap-1 w-48 shrink-0 min-h-0 overflow-y-auto overscroll-contain no-scrollbar">
              {categoryList.map((c) => {
                const active = activeCategoryUuid === c.uuid;
                return (
                  <button
                    key={c.uuid}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => setActiveCategoryUuid(c.uuid)}
                    className={`shrink-0 min-h-[48px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-[14px] font-bold transition cursor-pointer ${
                      active ? 'bg-brand text-white' : 'bg-surface border border-edge text-ink hover:bg-field'
                    }`}
                  >
                    <span className="min-w-0 line-clamp-2 leading-snug">{c.name}</span>
                    <span className={`shrink-0 text-[12px] font-extrabold tabular-nums ${active ? 'text-white/80' : 'text-muted'}`}>{c.count}</span>
                  </button>
                );
              })}
            </nav>
          )}
          {/* Product grid: kompyuterda faqat shu qism aylanadi */}
          <div className="lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
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
              <ErrorState title="Menyuni yuklab bo'lmadi" message={errorCatalog} onRetry={() => fetchCatalog()} />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="ui-card">
              <EmptyState
                icon={<FolderOpen className="w-7 h-7" />}
                title={categories.length === 0 ? 'Menyu bo‘sh' : t('cart.categoryEmpty')}
                description={categories.length === 0 ? "«Menyu» bo'limida faol kategoriya va mahsulot qo'shing." : t('cart.categoryEmptyHint')}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
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
                      onClick={(e) => {
                        flyToCart(e.currentTarget);
                        addToCart(p);
                      }}
                      className="text-left flex-1 flex flex-col cursor-pointer disabled:cursor-not-allowed"
                    >
                      <div className="relative h-36 bg-field flex items-center justify-center overflow-hidden">
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
                          {/* O'lchamli mahsulot: eng arzon – eng qimmat (masalan, 65 000 – 95 000 so'm) */}
                          <span className="text-[15px] font-extrabold text-ink">
                            {priceRange(p) ? `${formatMoney(priceRange(p)!.min, false)} – ${formatMoney(priceRange(p)!.max)}` : formatMoney(p.price)}
                          </span>
                          {p.discount > 0 && !priceRange(p) && <span className="text-[12px] text-subtle line-through">{formatMoney(p.original_price, false)}</span>}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* space for floating cart bar */}
          {cart.length > 0 && <div className="lg:hidden h-20" aria-hidden />}
          </div>
          </div>
        </div>

        {/* Desktop cart column: sarlavha qotib turadi, faqat ro'yxat aylanadi; jami va tugmalar pastda */}
        <aside className="hidden lg:flex flex-col h-full min-h-0 bg-surface border border-edge rounded-3xl overflow-hidden">
          {/* Sarlavha: kimga (Stol 4 · 1-qavat / zal / xizmat turi) + savatdagi son */}
          <div className="shrink-0 px-5 pt-4 pb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-muted uppercase tracking-wide">{t('cart.title')}{itemsCount > 0 ? ` · ${t('common.pcs', { n: itemsCount })}` : ''}</div>
              <div className={`text-[18px] font-black tracking-tightest truncate ${tablePickNeeded && !selectedTable ? 'text-danger-ink' : 'text-ink'}`} title={headerTitle}>
                {headerTitle}
              </div>
            </div>
            {tablePickNeeded && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => updateActiveCart({ step: 'TABLE_SELECT' })}>
                {selectedTable ? t('cart.change') : t('cart.pick')}
              </Button>
            )}
          </div>
          {/* Savat + mijoz maydonlari bitta aylanuvchi qismda — pastki tugmalar hech qachon qisib qo'ymaydi */}
          <div id="new-order-cart-panel" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-3">
            <div className="space-y-3">
              {cartLines}
              {cartNotices}
            </div>
            <div className="mt-3 border-t border-edge">
              {mainInline && mainFields}
              {extraToggle}
              {showExtra && extraFields}
            </div>
          </div>
          <div className="shrink-0 border-t border-edge px-5 py-3 space-y-2">
            {totalsBlock}
            {submitError && (
              <InlineAlert tone="danger" onRetry={submitRetryable && !submitting ? () => handleSubmitOrder() : undefined}>
                {submitError}
              </InlineAlert>
            )}
            {actionRow}
            {submitButton}
          </div>
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
              <span className="text-[15px] font-extrabold truncate">{t('cart.title')}</span>
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
          title={t('cart.title')}
          subtitle={`${headerTitle} · ${t('common.pcs', { n: itemsCount })}`}
          size="md"
          footer={submitButton}
        >
          {checkoutBody}
        </Sheet>
      </div>
    );
  };

  return (
    <div className="pt-3 animate-fade-in lg:flex lg:flex-col lg:h-[calc(100dvh-var(--appbar-h,56px)-var(--statusbar-h,0px)-24px)]">
      {!shop && shiftOpen === false && (
        <InlineAlert tone="warning" className="mb-3 lg:shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{shiftClosedText}</span>
            <Button size="sm" onClick={goOpenShift}>{t('shift.open')}</Button>
          </div>
        </InlineAlert>
      )}
      {cartTabsBar}
      {step === 'SERVICE_TYPE' && !shop && renderServiceTypeStep()}
      {step === 'TABLE_SELECT' && !shop && renderTableSelectStep()}
      {(step === 'MENU' || shop) && renderMenuStep()}
      {prepaySheet}

      {submitSuccess && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-6 animate-fade-in" role="status">
          <div className="w-full max-w-sm bg-surface rounded-3xl shadow-pop p-7 text-center animate-slide-up">
            <span className="mx-auto w-16 h-16 rounded-full bg-brand-soft text-brand flex items-center justify-center">
              <CheckCircle className="w-9 h-9" />
            </span>
            <h3 className="mt-4 text-[20px] font-black tracking-tightest">{queuedOffline ? 'Oflayn navbatga yozildi' : 'Buyurtma yaratildi'}</h3>
            <p className="mt-1 text-[14px] text-muted">
              {queuedOffline
                ? 'Internet tiklanganda serverga avtomatik yuboriladi.'
                : successSelf
                  ? "To'lov qabul qilindi, chek chiqdi. Mijoz buyurtma raqami bilan kutadi."
                  : "Buyurtmalar navbatiga o'tilmoqda..."}
            </p>
            <Button className="mt-5" block size="lg" onClick={() => navigate(successSelf ? '/tables' : '/orders')}>
              {successSelf ? "Sotuvga qaytish" : "Buyurtmalarga o'tish"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateOrderPage;
