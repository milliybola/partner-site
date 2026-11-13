import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BadgePercent, CheckCircle, ChevronDown, CreditCard, FileText, ImageOff, Plus, Printer, Save, ShoppingBag, Trash2 } from 'lucide-react';
import { filialApi } from '../../orders/services/filialApi';
import { clearDraft, getDraft, saveDraft } from '../lib/tableDrafts';
import { isAwaitingQrConfirm, ordersApi } from '../../orders/services/ordersApi';
import { WaiterPickSheet } from '../../orders/components/queue/WaiterPickSheet';
import { useRejectReason } from '../../../core/components/RejectReasonProvider';
import type { Order, PaymentPart } from '../../orders/services/ordersApi';
import { PaymentSheet } from '../../orders/components/queue/PaymentSheet';
import { printReceipt as printReceiptUtil, printPreCheck as printPreCheckUtil } from '../../orders/utils/printing';
import apiClient from '../../../core/api/client';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useShiftNotOpenPrompt } from '../../../core/components/useShiftNotOpenPrompt';
import { getFilialUuid, getPartner, isManager, isShop } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { t } from '../../../core/i18n';
import { OFFLINE_SHEET_EVENT, enqueuePayment, isNetworkError, isPaymentQueued } from '../../../core/lib/offline';
import { normalizePayCode, usePaymentMethods } from '../../../core/lib/payments';
import type { PayMethod } from '../../../core/lib/payments';
import { cleanPhone, formatMoney, maskPhoneInput, minutesSince } from '../../../core/lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  Input,
  QtyStepper,
  Segmented,
  Sheet,
  Skeleton,
  Spinner,
  Tabs,
  Textarea,
} from '../../../core/ui';
import { SplitBill } from '../../orders/components/queue/SplitBill';
import { tablesApi } from '../services/tablesApi';
import { CartTotals } from '../../orders/components/CartTotals';
import { DiscountSheet, discountableOrder, useCanDiscount } from '../../orders/components/DiscountSheet';
import { flyToCart as flyToCartUtil } from '../../orders/utils/flyToCart';
import {
  buildPosItems,
  cartSummary,
  countItems,
  dealNote,
  filterProducts,
  giftOf,
  linePrice,
  mapCategories,
  mapPosProduct,
  openOrderSummary,
  orderItemsCount,
  orderTotal,
} from '../../orders/utils/posCart';
import type { CartLine, CatalogCategory, CatalogProduct, ServerBill } from '../../orders/utils/posCart';
import { quotePosCart } from '../../orders/services/ordersApi';
import type { PosQuote } from '../../orders/services/ordersApi';
import type { Hall, TableModel } from '../services/tablesApi';

type Product = CatalogProduct;
type Category = CatalogCategory;
type CartItem = CartLine;

interface TableOrderModalProps {
  table: TableModel;
  onClose: (refresh: boolean) => void;
  /**
   * O'z-o'ziga xizmat zali: stolsiz buyurtma (`table` — zal nomi bilan soxta stol, faqat ko'rinish/qoralama uchun).
   * Xizmat haqi yo'q; to'lov OLDINDAN — «To'lov va buyurtma berish» → to'lov oynasi → buyurtma to'lov bilan bitta so'rovda.
   */
  selfHall?: Hall | null;
}

type PaymentMethod = PayMethod;

/** To'lov usuli tanlagich — faqat hamkor yoqqan usullar (core/lib/payments.ts). */
const PaymentPicker: React.FC<{ value: PaymentMethod; onChange: (v: PaymentMethod) => void }> = ({ value, onChange }) => {
  const { methods } = usePaymentMethods();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('pay.method')}>
      {methods.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          onClick={() => onChange(m.value)}
          className={`h-12 rounded-xl text-[14px] font-bold border transition cursor-pointer ${
            value === m.value ? 'border-brand bg-brand-soft text-brand' : 'border-edge bg-surface text-ink hover:bg-field'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
};

export const TableOrderModal: React.FC<TableOrderModalProps> = ({ table, onClose, selfHall = null }) => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });
  const confirm = useConfirm();
  const promptShift = useShiftNotOpenPrompt();
  const shop = isShop(getPartner());
  const isEditMode = !!table.current_order;
  const orderUuid = table.current_order?.uuid;
  // Mehmon stol QR'idan bergan, hali tasdiqlanmagan buyurtma: to'lov yopiq, avval xodim tasdiqlaydi (ofitsiant tanlanadi)
  const awaitingQr = isAwaitingQrConfirm(table.current_order);
  const askRejectReason = useRejectReason();
  const [qrConfirmOpen, setQrConfirmOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const rejectQr = async () => {
    if (!orderUuid) return;
    const reason = await askRejectReason({ orderLabel: `#${table.current_order?.order_number || ''}` });
    if (!reason) return;
    setRejecting(true);
    try {
      await ordersApi.updateOrderStatus(orderUuid, 'REJECTED', reason);
      toast.success(t('tom.qrRejected'));
      onClose(true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('tom.rejectFail')));
    } finally {
      setRejecting(false);
    }
  };
  const placeLabel = selfHall ? selfHall.name : t('table.n', { n: table.table_number });
  const [prepayOpen, setPrepayOpen] = useState(false);

  const [mobilePane, setMobilePane] = useState<'menu' | 'order'>(isEditMode ? 'order' : 'menu');

  // Catalog
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
  /** Mijoz ismi, telefon, izoh — odatda yashirin (kerak bo'lsa ochiladi) */
  const [showExtra, setShowExtra] = useState(false);
  /** Filialning xizmat haqi foizi (stol buyurtmasiga qo'shiladi; 0 — olinmaydi; null — hali noma'lum, server quote'dagisi olinadi) */
  const [scPercent, setScPercent] = useState<number | null>(null);
  useEffect(() => {
    if (selfHall) return; // o'z-o'ziga xizmat zalida xizmat haqi olinmaydi
    let alive = true;
    // Server buyurtma yaratganda (partner_order_serializers, DINE_IN) bilan bir xil tanlov:
    // stol filiali → xodimning joriy filiali → asosiy filial
    const staff = isManager(getPartner());
    const known = table.filial_uuid || (staff ? getFilialUuid() : undefined) || undefined;
    const load = async () => {
      let percent: number | undefined;
      if (known) {
        percent = Number((await filialApi.getFilialDetail(known)).service_charge_percent) || 0;
      } else {
        const list = await filialApi.getFilials();
        const main = list.find((f) => f.is_main) || list[0];
        percent = Number(main?.service_charge_percent) || 0;
      }
      if (alive) setScPercent(percent);
    };
    load().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [table.filial_uuid, selfHall]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [errorCatalog, setErrorCatalog] = useState<string | null>(null);

  // Create mode
  const [cart, setCart] = useState<CartItem[]>([]);
  /** Oxirgi saqlangan (yoki tiklangan) savat holati: chiqishda o'zgarish bor-yo'qligini bilish uchun */
  const savedSnap = useRef('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Edit mode
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [orderBill, setOrderBill] = useState<ServerBill | null>(null);
  const [loadingItems, setLoadingItems] = useState(isEditMode);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [printingPreCheck, setPrintingPreCheck] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  // Qo'lda chegirma (A10): menejer/rahbar, 2-bosqich, to'lanmagan ochiq buyurtma
  const canDiscount = useCanDiscount();
  const [discountOpen, setDiscountOpen] = useState(false);
  /** Ochiq buyurtma cheki (to'lovdan oldin ham — mehmon so'rasa) */
  const handlePrintReceipt = async () => {
    if (!orderUuid) return;
    setPrintingReceipt(true);
    try {
      await printReceiptUtil(orderUuid, false);
    } catch (err) {
      toast.error(getErrorMessage(err, t('msg.printFail')));
    } finally {
      setPrintingReceipt(false);
    }
  };
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { methods: payMethods } = usePaymentMethods();
  const [splitCount, setSplitCount] = useState(1);
  const [editPaymentMethod, setEditPaymentMethod] =useState<PaymentMethod>(() => normalizePayCode(table.current_order?.payment_method));
  // Tanlangan usul hamkorda o'chirilgan bo'lsa — birinchi yoqilganiga o'tamiz
  useEffect(() => {
    if (!payMethods.some((m) => m.value === editPaymentMethod)) setEditPaymentMethod(payMethods[0].value);
  }, [payMethods, editPaymentMethod]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [itemsChanged, setItemsChanged] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setErrorCatalog(null);
    try {
      const partnerUuid = getPartner()?.uuid;
      if (!partnerUuid) throw new Error(t('tom.noPartner'));
      const catsResponse = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      const rawCats = catsResponse.data?.data?.categories || catsResponse.data?.categories || catsResponse.data?.data || catsResponse.data || [];
      // Kassa bilan bir xil: birlik narxi serverdan (`final_price`), aksiya (1+1/2+1)
      const mapped: Category[] = mapCategories(rawCats, mapPosProduct);
      const activeCats = mapped.filter((c) => c.is_active);
      setCategories(activeCats);
      const draft = isEditMode ? null : getDraft(table.uuid);
      if (draft) {
        const byUuid = new Map(activeCats.flatMap((c) => c.products).map((p) => [p.uuid, p] as const));
        const restored: CartItem[] = [];
        let dropped = 0;
        for (const it of draft.items) {
          const product = byUuid.get(it.product_uuid);
          if (product && product.is_available) restored.push({ product, quantity: it.quantity });
          else dropped++;
        }
        setCart(restored);
        setContactName(draft.contact_name);
        setContactPhone(draft.contact_phone);
        setComment(draft.comment);
        if (draft.contact_name || draft.contact_phone.length > 4 || draft.comment) setShowExtra(true);
        savedSnap.current = JSON.stringify([restored.map((i) => [i.product.uuid, i.quantity]), draft.contact_name, draft.contact_phone, draft.comment]);
        if (dropped > 0) toastRef.current.info(t('tom.draftDropped', { n: dropped }));
      }
    } catch (err) {
      setErrorCatalog(getErrorMessage(err, t('tom.menuFail')));
    } finally {
      setLoadingCatalog(false);
    }
  }, [table.uuid, isEditMode]);

  const fetchOrderItems = useCallback(async () => {
    if (!orderUuid) return;
    setItemsError(null);
    try {
      const response = await ordersApi.getOrderItems(orderUuid);
      const list = Array.isArray(response)
        ? response
        : response?.items
          ? response.items
          : response?.data?.items
            ? response.data.items
            : Array.isArray(response?.data)
              ? response.data
              : [];
      setOrderItems(list);
      // Server jami (aksiya, qo'lda chegirma, xizmat haqi) — stol oynasida shu ko'rsatiladi
      setOrderBill(response && !Array.isArray(response) && response.total_price !== undefined ? (response as ServerBill) : null);
    } catch (err) {
      setItemsError(getErrorMessage(err, t('tom.itemsFail')));
    } finally {
      setLoadingItems(false);
    }
  }, [orderUuid]);

  useEffect(() => {
    fetchCatalog();
    if (isEditMode) fetchOrderItems();
  }, [fetchCatalog, fetchOrderItems, isEditMode]);

  const filteredProducts = useMemo(() => filterProducts(categories, activeCategoryUuid), [categories, activeCategoryUuid]);

  /* ----------------------------------------------------- create mode cart */
  const setCartQty = (product: Product, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((i) => i.product.uuid !== product.uuid);
      const exists = prev.some((i) => i.product.uuid === product.uuid);
      return exists ? prev.map((i) => (i.product.uuid === product.uuid ? { ...i, quantity: qty } : i)) : [...prev, { product, quantity: qty }];
    });
  };
  const cartQty = (uuid: string) => cart.find((i) => i.product.uuid === uuid)?.quantity || 0;
  const cartCount = useMemo(() => countItems(cart), [cart]);

  // Narxni SERVER hisoblaydi (kassa bilan bir xil quote): 1+1/2+1 sovg'a, aksiya, chegirma.
  // Savat o'zgarsa 350 ms dan keyin qayta so'raladi; javob kelguncha taxminiy narx ko'rsatiladi.
  const quoteKey = JSON.stringify(buildPosItems(cart));
  const [quoteState, setQuoteState] = useState<{ key: string; quote: PosQuote | null; error: string | null } | null>(null);
  useEffect(() => {
    if (isEditMode || cart.length === 0) return;
    let alive = true;
    const timer = setTimeout(() => {
      quotePosCart(buildPosItems(cart), 'DINE_IN')
        .then((quote) => alive && setQuoteState({ key: quoteKey, quote, error: null }))
        .catch((err) => alive && setQuoteState({ key: quoteKey, quote: null, error: getErrorMessage(err, "Narxni hisoblab bo'lmadi.") }));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, isEditMode]);
  const quoteSettled = cart.length > 0 && quoteState?.key === quoteKey;
  const quote = quoteSettled ? quoteState.quote : null;
  const quoteError = quoteSettled ? quoteState.error : null;
  const cartSum = useMemo(
    () => cartSummary(cart, quote, { noServiceCharge: !!selfHall, serviceChargePercent: selfHall ? 0 : scPercent }),
    [cart, quote, selfHall, scPercent],
  );
  const cartSubtotal = cartSum.subtotal;

  const handleCreateOrder = async (prepaid?: { method: string; payments?: PaymentPart[] }) => {
    if (cart.length === 0 || submitting) return;
    const phoneDigits = cleanPhone(contactPhone).replace(/\D/g, '');
    if (phoneDigits.length > 3 && phoneDigits.length !== 12) {
      setSubmitError(t('tom.phoneShort'));
      setMobilePane('order');
      return;
    }
    // O'z-o'ziga xizmat: avval to'lov oynasi
    if (selfHall && !prepaid) {
      setPrepayOpen(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await ordersApi.createDineInOrder({
        ...(selfHall
          ? { hall: selfHall.uuid, payment_method: prepaid?.method || 'CASH', ...(prepaid?.payments?.length ? { payments: prepaid.payments } : {}) }
          : { table: table.uuid, payment_method: 'CASH' }), // stolda to'lov yaratishda so'ralmaydi — topshirishda olinadi
        contact_phone: phoneDigits.length === 12 ? phoneDigits : undefined,
        contact_name: contactName.trim() || undefined,
        description: comment.trim() || undefined,
        // Kassa bilan bir xil: promo qatorida to'langan + avto-sovg'a (server bepulni tasdiqlaydi)
        items: buildPosItems(cart),
      });
      clearDraft(table.uuid);
      if (selfHall) {
        const uuid = created?.data?.uuid || created?.uuid;
        const no = created?.data?.order_number || created?.order_number || '';
        toast.success(t('tom.prepaidSent', { n: placeLabel, no: no ? ` — ${no}` : '' }));
        // Chek (buyurtma raqami bilan) — mijoz shu raqam bilan kutadi
        if (uuid) printReceiptUtil(uuid, true).catch((err) => toast.error(getErrorMessage(err, t('offline.receiptFail'))));
      } else {
        toast.success(t('tom.created', { n: placeLabel }));
      }
      onClose(true);
    } catch (err) {
      setSubmitError(getErrorMessage(err, t('tom.createFail')));
      setMobilePane('order');
    } finally {
      setSubmitting(false);
    }
  };

  const snapshot = () => JSON.stringify([cart.map((i) => [i.product.uuid, i.quantity]), contactName, contactPhone, comment]);
  const hasContent = cart.length > 0 || !!contactName.trim() || contactPhone.length > 4 || !!comment.trim();

  /** Savatni qoralama sifatida saqlab, stollar ro'yxatiga qaytadi (boshqa stol bilan ishlash uchun) */
  const handleSaveDraft = () => {
    if (cart.length === 0) return;
    saveDraft(table.uuid, {
      items: cart.map((i) => ({ product_uuid: i.product.uuid, quantity: i.quantity })),
      contact_name: contactName,
      contact_phone: contactPhone,
      comment,
      count: cartCount,
      subtotal: cartSubtotal,
    });
    toast.success(selfHall ? t('tom.heldSaved', { n: placeLabel }) : t('tom.cartSaved', { n: placeLabel }));
    onClose(false);
  };

  /** Orqaga: saqlanmagan o'zgarish bo'lsa so'raydi */
  const handleBack = async () => {
    if (!isEditMode && cart.length > 0 && snapshot() !== savedSnap.current) {
      const ok = await confirm(t('tom.unsavedAsk'), {
        title: t('tom.backTitle'),
        confirmText: t('tom.leave'),
        cancelText: t('tom.stay'),
        danger: true,
      });
      if (!ok) return;
    }
    onClose(false);
  };

  const handleClearCart = async () => {
    if (!hasContent) return;
    const ok = await confirm(t('tom.clearAsk'), {
      title: t('tom.clearTitle'),
      confirmText: t('tom.clear'),
      cancelText: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    setCart([]);
    setContactName('');
    setContactPhone('');
    setComment('');
    setSubmitError(null);
    clearDraft(table.uuid);
    savedSnap.current = '';
  };

  /* -------------------------------------------------- edit mode (live order) */
  const editSum = useMemo(() => openOrderSummary(orderItems, orderBill, scPercent ?? 0), [orderItems, orderBill, scPercent]);
  const editItemsCount = useMemo(() => orderItemsCount(orderItems), [orderItems]);
  // Menyu kartasidagi badge: shu mahsulot buyurtmada nechta (bir mahsulot bir necha qatorda bo'lishi mumkin)
  const orderQtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of orderItems) {
      const id = i.product_uuid || i.product?.uuid;
      if (id) m.set(id, (m.get(id) || 0) + Number(i.quantity || 0));
    }
    return m;
  }, [orderItems]);

  const handleAddProductToOrder = async (product: Product) => {
    if (!orderUuid || actionLoading) return;
    setActionLoading(product.uuid);
    try {
      const res = await ordersApi.addOrderItems(orderUuid, { items: [{ product_uuid: product.uuid, quantity: 1 }] });
      if (res?.new_bill) {
        // Stol buyurtmasi to'langan edi: taom yangi hisobga yozildi — stollar yangilanadi, yangi hisob stolda ochiladi
        toast.info(t('bill.newBill', { n: `#${table.current_order?.order_number || ''}`, m: res.data?.order_number || '' }));
        onClose(true);
        return;
      }
      await fetchOrderItems();
      setItemsChanged(true);
      toast.success(t('tom.added', { n: product.name }));
    } catch (err) {
      toast.error(getErrorMessage(err, t('tom.addFail')));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveOrderItem = async (itemUuid: string, currentQuantity: number) => {
    if (!orderUuid) return;
    const ok = await confirm(t('tom.removeAsk'), { danger: true, confirmText: t('tom.remove') });
    if (!ok) return;
    setActionLoading(itemUuid);
    try {
      await ordersApi.removeOrderItems(orderUuid, { items: [{ item_uuid: itemUuid, quantity: currentQuantity }] });
      await fetchOrderItems();
      setItemsChanged(true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('tom.removeFail')));
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeItemQty = async (item: any, next: number) => {
    if (!orderUuid || !item?.uuid) return;
    if (next <= 0) return handleRemoveOrderItem(item.uuid, item.quantity);
    setActionLoading(item.uuid);
    try {
      await ordersApi.updateOrderItemQuantity(orderUuid, item.uuid, { quantity: next });
      await fetchOrderItems();
      setItemsChanged(true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('tom.qtyFail')));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPreCheck = async () => {
    setPrintingPreCheck(true);
    try {
      if (isEditMode) {
        await printPreCheckUtil({ table_number: table.table_number, total_price: total, split_count: splitCount, items: orderItems, manual_discount_amount: editSum.discount });
      } else {
        await printPreCheckUtil({
          table_number: table.table_number,
          total_price: total,
          items: cart.map((i) => ({ product_name: i.product.name, price_at_time_of_order: i.product.price, quantity: i.quantity })),
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('msg.preCheckFail')));
    } finally {
      setPrintingPreCheck(false);
    }
  };

  // BUGFIX: a printer failure after a successful payment used to show
  // "To'lovni yakunlashda xatolik" and keep the sheet open, inviting a second
  // (duplicate) payment. Printing is now handled separately.
  const handleConfirmPayment = async () => {
    if (!orderUuid || paymentSaving) return;
    const label = `${t('table.n', { n: table.table_number })} · #${table.current_order?.order_number || ''}`;
    if (isPaymentQueued(orderUuid)) {
      toast.error(t('msg.payQueuedNoRepeat', { n: label }));
      setPaymentOpen(false);
      window.dispatchEvent(new Event(OFFLINE_SHEET_EVENT));
      return;
    }
    setPaymentSaving(true);
    try {
      // To'lov va yakunlash — bitta so'rovda (eski serverda mark-paid bilan to'ldiriladi)
      await ordersApi.completeWithPayment(orderUuid, editPaymentMethod, splitCount);
    } catch (err) {
      if (isNetworkError(err)) {
        // Internet yo'q: to'lov navbatga yoziladi (summa — kassir ko'rgan va olgan summa); serverda stol o'zi bo'shaydi
        try {
          const added = enqueuePayment({
            label,
            total,
            payment: { order_uuid: orderUuid, collect: true, method: editPaymentMethod, ...(splitCount > 1 ? { split_count: splitCount } : {}) },
          });
          if (added) toast.success(t('msg.payOfflineSaved', { n: t('table.n', { n: table.table_number }) }));
          else toast.error(t('msg.payAlreadyQueued', { n: label }));
          setPaymentSaving(false);
          onClose(true);
        } catch (e) {
          toast.error(getErrorMessage(e, t('msg.paySaveFail')));
          setPaymentSaving(false);
        }
        return;
      }
      // D36: smena ochilmagan — to'lov yozilmadi, buyurtma o'zgarmadi; to'lov oynasi yopiladi
      if (promptShift(err)) setPaymentOpen(false);
      else toast.error(getErrorMessage(err, t('tom.payFail')));
      setPaymentSaving(false);
      return;
    }
    // Same as the kanban flow (OrdersPage): free the table explicitly after a
    // dine-in order completes. Previously this path left the table OCCUPIED.
    tablesApi.updateTableStatus(table.uuid, 'AVAILABLE').catch(() => {
      toast.error(t('tom.freeTableFail'));
    });
    try {
      await printReceiptUtil(orderUuid, true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('tom.paidPrintFail')));
    }
    toast.success(t('tom.paid', { n: t('table.n', { n: table.table_number }) }));
    setPaymentSaving(false);
    onClose(true);
  };

  const orderMins = table.current_order?.created_at ? minutesSince(table.current_order.created_at) : null;
  // Jami — kassa bilan bitta formula (posCart): yangi savatda server quote, ochiq buyurtmada server `total_price` asosiy
  const sum = isEditMode ? editSum : cartSum;
  const { subtotal, discount, serviceCharge: serviceAmount, serviceChargePercent } = sum;
  const total = isEditMode ? editSum.total : orderTotal(subtotal, serviceAmount);
  const count = isEditMode ? editItemsCount : cartCount;

  /** Mahsulot bosilganda uning rasmi savat tomon uchib boradi (telefonda savat yashirin bo'lsa — animatsiya yo'q) */
  const cartRef = useRef<HTMLDivElement>(null);
  const flyToCart = (card: HTMLElement) => flyToCartUtil(card, cartRef.current);

  /* --------------------------------------------------------------- panes */
  const menuPane = (
    <div className={`${mobilePane === 'menu' ? 'flex' : 'hidden'} md:flex md:col-span-8 flex-col min-h-0 md:border-r border-edge`}>
      <div className="px-4 md:px-5 pt-3 space-y-2.5 shrink-0">
        {categories.length > 0 && (
          <Tabs
            size="sm"
            value={activeCategoryUuid}
            onChange={setActiveCategoryUuid}
            options={[{ value: 'all', label: t('tom.all') }, ...categories.map((c) => ({ value: c.uuid, label: c.name }))]}
          />
        )}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-5 py-3">
        {loadingCatalog ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : errorCatalog ? (
          <ErrorState message={errorCatalog} onRetry={fetchCatalog} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState title={shop ? t('tom.noGoods') : t('tom.noDishes')} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
            {filteredProducts.map((p) => {
              const qty = isEditMode ? orderQtyByProduct.get(p.uuid) || 0 : cartQty(p.uuid);
              const adding = actionLoading === p.uuid;
              return (
                <div
                  key={p.uuid}
                  className={`relative rounded-2xl border bg-surface overflow-hidden flex flex-col ${
                    !p.is_available ? 'opacity-50 border-edge' : qty > 0 ? 'border-brand/40 ring-2 ring-brand/10' : 'border-edge'
                  }`}
                >
                  <button
                    type="button"
                    disabled={!p.is_available || (isEditMode && !!actionLoading)}
                    onClick={(e) => {
                      flyToCart(e.currentTarget);
                      if (isEditMode) handleAddProductToOrder(p);
                      else setCartQty(p, qty + 1);
                    }}
                    className="text-left flex-1 flex flex-col cursor-pointer disabled:cursor-not-allowed"
                  >
                    <div className="h-36 bg-field relative flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff className="w-6 h-6 text-subtle" />
                      )}
                      {!p.is_available && (
                        <span className="absolute inset-0 bg-surface/70 flex items-center justify-center text-[12px] font-extrabold text-danger-ink">{t('tom.soldOut')}</span>
                      )}
                      {qty > 0 && (
                        <span className="absolute top-1.5 right-1.5 min-w-[26px] h-[26px] px-1.5 rounded-full bg-brand text-white text-[13px] font-extrabold flex items-center justify-center">
                          {qty}
                        </span>
                      )}
                      {adding && (
                        <span className="absolute inset-0 bg-surface/60 flex items-center justify-center">
                          <Spinner />
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 flex-1 flex flex-col gap-0.5">
                      <span className="text-[13px] font-bold text-ink leading-snug line-clamp-2">{p.name}</span>
                      <span className="mt-auto flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-[14px] font-extrabold text-ink tabular-nums">{formatMoney(p.price)}</span>
                        {p.discount > 0 && <span className="text-[11px] text-subtle line-through tabular-nums">{formatMoney(p.original_price, false)}</span>}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const footer = (
    <div className="w-full space-y-2">
      <CartTotals
        countLabel={count > 0 ? t('cart.totalCount', { n: count }) : t('common.total')}
        subtotal={subtotal}
        discount={discount}
        // Ochiq buyurtmada aksiya qatorlarga kirgan — ajratilgani faqat qo'lda chegirma
        discountLabel={isEditMode ? t('disc.line') : undefined}
        serviceCharge={serviceAmount}
        serviceChargePercent={serviceChargePercent}
        showServiceCharge={serviceAmount > 0 || (!selfHall && serviceChargePercent > 0)}
        totalLabel={t('tom.grandTotal')}
        total={total}
      />
      {isEditMode && orderItems.length > 0 && (
        <SplitBill total={total} count={splitCount} onChange={setSplitCount} />
      )}
      {!isEditMode ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" icon={<ArrowLeft className="w-4 h-4" />} onClick={handleBack}>
              {t('cancel.back')}
            </Button>
            <Button variant="outline" icon={<Trash2 className="w-4 h-4" />} disabled={!hasContent} onClick={handleClearCart}>
              {t('tom.clear')}
            </Button>
            <Button variant="outline" icon={<FileText className="w-4 h-4" />} loading={printingPreCheck} disabled={cart.length === 0} onClick={handlePrintPreCheck}>
              {t('detail.preCheck')}
            </Button>
            <Button variant="outline" icon={<Save className="w-4 h-4" />} disabled={cart.length === 0} onClick={handleSaveDraft}>
              {selfHall ? t('tom.hold') : t('tom.save')}
            </Button>
          </div>
          <Button
            size="lg"
            className="w-full"
            variant={selfHall ? 'success' : undefined}
            icon={selfHall ? <CreditCard className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            loading={submitting}
            // O'z-o'ziga xizmat: to'lov oldindan — server summasi kelguncha kutamiz (aksiyada summa farq qilmasin)
            disabled={cart.length === 0 || (!!selfHall && !quoteSettled)}
            onClick={() => handleCreateOrder()}
          >
            {selfHall ? t('cart.prepay') : t('cart.create')}
          </Button>
        </div>
      ) : (
      <div className="flex gap-2">
        {isEditMode && awaitingQr ? (
          <>
            <Button variant="danger-soft" size="lg" className="shrink-0" loading={rejecting} onClick={rejectQr}>
              {t('act.reject')}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              icon={<CheckCircle className="w-5 h-5" />}
              disabled={orderItems.length === 0 || loadingItems}
              onClick={() => setQrConfirmOpen(true)}
            >
              {t('act.confirm')}
            </Button>
          </>
        ) : isEditMode ? (
          <>
            {canDiscount && discountableOrder(table.current_order) && orderItems.length > 0 && editSum.fromServer && (
              <Button
                variant="outline"
                size="lg"
                className="shrink-0"
                icon={<BadgePercent className="w-5 h-5" />}
                disabled={loadingItems || paymentSaving}
                onClick={() => setDiscountOpen(true)}
                aria-label={t('disc.btn')}
              >
                <span className="hidden xs:inline">{t('disc.btn')}</span>
              </Button>
            )}
            <Button
              variant="success"
              size="lg"
              className="flex-1"
              icon={<CreditCard className="w-5 h-5" />}
              disabled={orderItems.length === 0 || loadingItems}
              onClick={() => setPaymentOpen(true)}
            >
              {t('tom.payBtn')}
            </Button>
          </>
        ) : null}
      </div>
      )}
    </div>
  );

  const orderPane = (
    <div className={`${mobilePane === 'order' ? 'flex' : 'hidden'} md:flex md:col-span-4 flex-col min-h-0`}>
      <div className="shrink-0 px-4 md:px-5 pt-3 text-[13px] font-bold text-muted uppercase tracking-wide">{isEditMode ? t('tom.orderItems') : t('cart.title')}</div>
      {awaitingQr && (
        <div className="md:hidden shrink-0 mx-4 mt-2 rounded-2xl bg-warning-soft text-warning-ink px-3.5 py-2.5 text-[13px] font-semibold">
          {t('tom.qrPending')}
        </div>
      )}
      <div ref={cartRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-5 pt-2 pb-3 space-y-3">

        {isEditMode ? (
          loadingItems ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          ) : itemsError ? (
            <ErrorState message={itemsError} onRetry={() => { setLoadingItems(true); fetchOrderItems(); }} className="py-6" />
          ) : orderItems.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title={t('tom.orderEmpty')} description={shop ? t('tom.addFromGoods') : t('tom.addFromMenu')} className="py-8" />
          ) : (
            <div className="space-y-2">
              {orderItems.map((item, idx) => {
                const name = item.product_name || item.name || item.product?.name || t('courier.unknown');
                const price = Number(item.price_at_time_of_order || item.product?.price || 0);
                // Server qator summasi (aksiya/sovg'a ayirilgan); sovg'a soni alohida ko'rsatiladi
                const free = Number(item.free_quantity) || 0;
                const lineTotal = item.line_total !== undefined && item.line_total !== null ? Number(item.line_total) || 0 : price * item.quantity;
                const modifying = actionLoading === item.uuid;
                return (
                  <div key={item.uuid || idx} className="rounded-2xl border border-edge bg-surface p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-ink truncate">{name}</div>
                      <div className="text-[12px] text-muted tabular-nums">
                        {formatMoney(price)} × {free > 0 ? Number((item.quantity - free).toFixed(3)) : item.quantity} = <span className="font-bold text-ink">{formatMoney(lineTotal)}</span>
                      </div>
                      {free > 0 && (
                        <div className="text-[12px] font-bold text-brand">
                          + {free} ta sovg'a 🎁{item.promotion_label ? ` · ${item.promotion_label}` : ''}
                        </div>
                      )}
                    </div>
                    {modifying ? (
                      <Spinner />
                    ) : (
                      <QtyStepper size="sm" value={item.quantity} min={0} disabled={!!actionLoading || !item.uuid} onChange={(v) => handleChangeItemQty(item, v)} />
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : cart.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title={t('cart.empty')} description={shop ? t('tom.pickFromGoods') : t('tom.pickFromMenu')} className="py-8" />
        ) : (
          <div className="space-y-2">
            {cart.map((i, idx) => {
              // Kassa bilan bir xil: server qator summasi (sovg'a bepul), kelguncha taxminiy
              const q = quote?.items[idx];
              const gift = giftOf(i);
              const note = dealNote(i);
              return (
              <div key={i.product.uuid} className="rounded-2xl border border-edge bg-surface p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink truncate">{i.product.name}</div>
                  <div className="text-[12px] text-muted tabular-nums">{formatMoney(q ? q.line_total : linePrice(i))}</div>
                  {gift > 0 ? (
                    <div className="text-[12px] font-bold text-brand">
                      {i.quantity} ta olindi + {gift} ta sovg'a 🎁
                    </div>
                  ) : (
                    note && <div className="text-[12px] font-bold text-warning-ink">{note}</div>
                  )}
                </div>
                <QtyStepper size="sm" value={i.quantity} onChange={(v) => setCartQty(i.product, v)} />
                <IconButton label={t('tom.removeLine')} variant="danger-soft" size="sm" onClick={() => setCartQty(i.product, 0)}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
              );
            })}
          </div>
        )}

        {!isEditMode && quoteError && <InlineAlert tone="danger">{quoteError}</InlineAlert>}
        {submitError && <InlineAlert>{submitError}</InlineAlert>}
      </div>
        {!isEditMode && (
          <div className="space-y-3 pt-2 px-4 md:px-5 pb-3 shrink-0 max-h-[55%] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowExtra((v) => !v)}
              aria-expanded={showExtra}
              className="w-full flex items-center justify-between gap-2 text-left text-[13px] font-bold text-muted hover:text-ink cursor-pointer"
            >
              <span className="min-w-0 truncate">
                {t('tom.extra')}
                {!showExtra && (contactName || contactPhone.length > 4 || comment) && (
                  <span className="font-semibold text-ink"> · {[contactName, contactPhone.length > 4 ? contactPhone : '', comment].filter(Boolean).join(', ')}</span>
                )}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showExtra ? 'rotate-180' : ''}`} />
            </button>
            <div className={`${showExtra ? 'space-y-3' : 'hidden'}`}>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <Input label={t('tom.customerName')} placeholder={t('tom.optional')} value={contactName} onChange={(e) => setContactName(e.target.value)} />
              <Input
                label={t('detail.phone')}
                type="tel"
                inputMode="tel"
                placeholder="+998 (90) 123-45-67"
                value={contactPhone}
                onFocus={() => !contactPhone && setContactPhone('+998')}
                onChange={(e) => setContactPhone(e.target.value.trim() ? maskPhoneInput(e.target.value) : '')}
              />
            </div>
            <Textarea label={t('tom.comment')} rows={2} placeholder={t('tom.commentPh')} value={comment} onChange={(e) => setComment(e.target.value)} />
            <p className="text-[12px] text-muted">{t('tom.payLaterHint')}</p>
            </div>
          </div>
        )}
      <div className="hidden md:block shrink-0 border-t border-edge px-5 py-3 bg-surface">{footer}</div>
    </div>
  );

  return (
    <>
      <Sheet
        open
        size="screen"
        flush
        persistent={submitting || paymentSaving}
        onClose={() => (isEditMode ? onClose(itemsChanged) : void handleBack())}
        title={
          <span className="flex items-center gap-2">
            {placeLabel}
            {selfHall ? <Badge tone="info">{t('tom.selfService')}</Badge> : isEditMode ? <Badge tone="gold">{t('tom.busy')}</Badge> : <Badge tone="success">{t('tom.free')}</Badge>}
          </span>
        }
        subtitle={
          isEditMode
            ? `${t('detail.title', { n: `#${table.current_order?.order_number || ''}` })}${orderMins !== null ? ` · ${t('time.ago', { n: orderMins })}` : ''}${table.current_order?.waiter_name ? ` · ${table.current_order.waiter_name}` : ''}`
            : selfHall
              ? t('tom.newSelf')
              : t('tom.newSeats', { n: table.capacity })
        }
        headerAction={
          isEditMode ? (
            <div className="flex items-center gap-2 mr-1">
              {awaitingQr && (
                // Keng ekranda — sarlavha qatorida (savat ustini band qilmaydi); telefonda savat ustida
                <div className="hidden md:flex items-center w-[min(48vw,820px)] mr-1 rounded-xl bg-warning-soft text-warning-ink px-3.5 py-2 text-[13px] font-semibold leading-snug">
                  {t('tom.qrPending')}
                </div>
              )}
              <Button
                variant="outline"
                icon={<FileText className="w-4 h-4" />}
                loading={printingPreCheck}
                disabled={orderItems.length === 0}
                onClick={handlePrintPreCheck}
              >
                <span className="hidden sm:inline">{t('detail.preCheck')}</span>
              </Button>
              <Button
                variant="outline"
                icon={<Printer className="w-4 h-4" />}
                loading={printingReceipt}
                disabled={orderItems.length === 0 || awaitingQr}
                onClick={handlePrintReceipt}
              >
                <span className="hidden sm:inline">{t('offline.receipt')}</span>
              </Button>
            </div>
          ) : undefined
        }
        footer={footer}
        footerClassName="md:hidden"
      >
        <div className="flex flex-col h-full">
          <div className="md:hidden px-4 pt-3 shrink-0">
            <Segmented
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={mobilePane}
              onChange={setMobilePane}
              options={[
                { value: 'menu', label: shop ? t('word.goods') : t('word.menu'), icon: <Plus className="w-4 h-4" /> },
                { value: 'order', label: `${isEditMode ? t('word.order') : t('cart.title')}${count ? ` (${count})` : ''}`, icon: <ShoppingBag className="w-4 h-4" /> },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12">
            {menuPane}
            {orderPane}
          </div>
        </div>
      </Sheet>

      {discountOpen && orderUuid && (
        <DiscountSheet
          open
          onClose={() => setDiscountOpen(false)}
          orderUuid={orderUuid}
          label={`${placeLabel} · #${table.current_order?.order_number || ''}`}
          subtotal={editSum.subtotal}
          serviceChargePercent={editSum.serviceChargePercent}
          deliveryFee={Number(orderBill?.delivery_fee) || 0}
          current={editSum.discount > 0 ? { amount: editSum.discount, percent: 0 } : null}
          onDone={() => {
            // Jami, xizmat haqi va chegirma — serverdan qayta (bitta haqiqat manbai)
            fetchOrderItems();
            setItemsChanged(true);
          }}
        />
      )}

      {qrConfirmOpen && orderUuid && (
        <WaiterPickSheet
          target={{ uuid: orderUuid, mode: 'qr', label: `${t('table.n', { n: table.table_number })} · #${table.current_order?.order_number || ''}` }}
          onClose={() => setQrConfirmOpen(false)}
          onDone={() => {
            setQrConfirmOpen(false);
            onClose(true);
          }}
        />
      )}

      {selfHall && (
        <PaymentSheet
          order={
            prepayOpen
              ? ({ uuid: `prepay-${selfHall.uuid}`, id: 0, order_number: selfHall.name, total_price: total, payment_method: 'CASH',
                  delivery_type: 'PICKUP', is_paid: false, table_number: null } as unknown as Order)
              : null
          }
          saving={submitting}
          title={t('cart.prepay')}
          subtitle={t('tom.prepaySub', { n: selfHall.name })}
          confirmLabel={t('cart.prepayConfirm')}
          onClose={() => !submitting && setPrepayOpen(false)}
          onSubmit={(method, _split, payments) => {
            setPrepayOpen(false);
            void handleCreateOrder({ method, payments });
          }}
        />
      )}

      <Sheet
        open={paymentOpen}
        size="sm"
        persistent={paymentSaving}
        onClose={() => setPaymentOpen(false)}
        title={t('tom.payTitle')}
        subtitle={t('table.n', { n: table.table_number })}
        footer={
          <>
            <Button variant="secondary" size="lg" disabled={paymentSaving} onClick={() => setPaymentOpen(false)} className="md:w-auto w-full">
              {t('common.cancel')}
            </Button>
            <Button variant="success" size="lg" loading={paymentSaving} icon={<CheckCircle className="w-5 h-5" />} onClick={handleConfirmPayment} className="md:w-auto w-full">
              {t('tom.paidClose')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-field p-4 text-center">
            <div className="text-[13px] text-muted font-semibold">{t('tom.paySum')}</div>
            <div className="text-[28px] font-black text-ink tracking-tightest tabular-nums">{formatMoney(total)}</div>
          </div>
          <PaymentPicker value={editPaymentMethod} onChange={setEditPaymentMethod} />
          {splitCount > 1 && (
            <p className="text-[13px] font-semibold text-ink text-center">
              {t('tom.splitNote', { n: splitCount })}
            </p>
          )}
          <p className="text-[13px] text-muted">{t('tom.payFootnote')}</p>
        </div>
      </Sheet>
    </>
  );
};
