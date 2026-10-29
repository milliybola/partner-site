import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, CreditCard, FileText, ImageOff, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { ordersApi } from '../../orders/services/ordersApi';
import { printReceipt as printReceiptUtil, printPreCheck as printPreCheckUtil } from '../../orders/utils/printing';
import apiClient from '../../../core/api/client';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { getPartner, wording } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
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
  SearchInput,
  Segmented,
  Sheet,
  Skeleton,
  Spinner,
  Tabs,
  Textarea,
} from '../../../core/ui';
import { SplitBill } from '../../orders/components/queue/SplitBill';
import { tablesApi } from '../services/tablesApi';
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

type PaymentMethod = PayMethod;

/** To'lov usuli tanlagich — faqat hamkor yoqqan usullar (core/lib/payments.ts). */
const PaymentPicker: React.FC<{ value: PaymentMethod; onChange: (v: PaymentMethod) => void }> = ({ value, onChange }) => {
  const { methods } = usePaymentMethods();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="To'lov turi">
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

export const TableOrderModal: React.FC<TableOrderModalProps> = ({ table, onClose }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const w = wording();
  const isEditMode = !!table.current_order;
  const orderUuid = table.current_order?.uuid;

  const [mobilePane, setMobilePane] = useState<'menu' | 'order'>(isEditMode ? 'order' : 'menu');

  // Catalog
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [errorCatalog, setErrorCatalog] = useState<string | null>(null);

  // Create mode
  const [cart, setCart] = useState<CartItem[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Edit mode
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(isEditMode);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [printingPreCheck, setPrintingPreCheck] = useState(false);
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
      if (!partnerUuid) throw new Error("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");
      const catsResponse = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      const rawCats = catsResponse.data?.data?.categories || catsResponse.data?.categories || catsResponse.data?.data || catsResponse.data || [];
      const mapped: Category[] = Array.isArray(rawCats)
        ? rawCats.map((c: any) => ({
            uuid: c.uuid,
            name: c.category_details?.name || c.name || "Nomi yo'q",
            is_active: !!c.is_active,
            products: Array.isArray(c.products)
              ? c.products.map((p: any) => {
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
                    image_url: p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null,
                  };
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
    } catch (err) {
      setItemsError(getErrorMessage(err, 'Buyurtma tarkibini yuklashda xatolik yuz berdi.'));
    } finally {
      setLoadingItems(false);
    }
  }, [orderUuid]);

  useEffect(() => {
    fetchCatalog();
    if (isEditMode) fetchOrderItems();
  }, [fetchCatalog, fetchOrderItems, isEditMode]);

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

  /* ----------------------------------------------------- create mode cart */
  const setCartQty = (product: Product, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((i) => i.product.uuid !== product.uuid);
      const exists = prev.some((i) => i.product.uuid === product.uuid);
      return exists ? prev.map((i) => (i.product.uuid === product.uuid ? { ...i, quantity: qty } : i)) : [...prev, { product, quantity: qty }];
    });
  };
  const cartQty = (uuid: string) => cart.find((i) => i.product.uuid === uuid)?.quantity || 0;
  const cartSubtotal = useMemo(() => cart.reduce((s, i) => s + i.product.price * i.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const handleCreateOrder = async () => {
    if (cart.length === 0 || submitting) return;
    const phoneDigits = cleanPhone(contactPhone).replace(/\D/g, '');
    if (phoneDigits.length > 3 && phoneDigits.length !== 12) {
      setSubmitError("Telefon raqami to'liq emas. Misol: +998 (90) 123-45-67");
      setMobilePane('order');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await ordersApi.createDineInOrder({
        table: table.uuid,
        payment_method: 'CASH', // to'lov yaratishda so'ralmaydi — topshirishda bir marta olinadi
        contact_phone: phoneDigits.length === 12 ? phoneDigits : undefined,
        contact_name: contactName.trim() || undefined,
        description: comment.trim() || undefined,
        items: cart.map((i) => ({ product_uuid: i.product.uuid, quantity: i.quantity })),
      });
      toast.success(`Stol ${table.table_number}: buyurtma yaratildi`);
      onClose(true);
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Buyurtma yaratishda xatolik yuz berdi.'));
      setMobilePane('order');
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------------------------------- edit mode (live order) */
  const editItemsTotal = useMemo(
    () => orderItems.reduce((s, i) => s + Number(i.price_at_time_of_order || i.product?.price || 0) * (i.quantity || 0), 0),
    [orderItems],
  );
  const editItemsCount = useMemo(() => orderItems.reduce((s, i) => s + (i.quantity || 0), 0), [orderItems]);

  const handleAddProductToOrder = async (product: Product) => {
    if (!orderUuid || actionLoading) return;
    setActionLoading(product.uuid);
    try {
      await ordersApi.addOrderItems(orderUuid, { items: [{ product_uuid: product.uuid, quantity: 1 }] });
      await fetchOrderItems();
      setItemsChanged(true);
      toast.success(`${product.name} qo'shildi`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Mahsulot qo'shishda xatolik yuz berdi."));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveOrderItem = async (itemUuid: string, currentQuantity: number) => {
    if (!orderUuid) return;
    const ok = await confirm("Ushbu mahsulotni buyurtmadan o'chirmoqchimisiz?", { danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    setActionLoading(itemUuid);
    try {
      await ordersApi.removeOrderItems(orderUuid, { items: [{ item_uuid: itemUuid, quantity: currentQuantity }] });
      await fetchOrderItems();
      setItemsChanged(true);
    } catch (err) {
      toast.error(getErrorMessage(err, "Mahsulotni o'chirishda xatolik yuz berdi."));
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
      toast.error(getErrorMessage(err, 'Miqdorni yangilashda xatolik yuz berdi.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPreCheck = async () => {
    setPrintingPreCheck(true);
    try {
      if (isEditMode) {
        await printPreCheckUtil({ table_number: table.table_number, total_price: editItemsTotal, split_count: splitCount, items: orderItems });
      } else {
        await printPreCheckUtil({
          table_number: table.table_number,
          total_price: cartSubtotal,
          items: cart.map((i) => ({ product_name: i.product.name, price_at_time_of_order: i.product.price, quantity: i.quantity })),
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Pre-chekni chop etishda xatolik.'));
    } finally {
      setPrintingPreCheck(false);
    }
  };

  // BUGFIX: a printer failure after a successful payment used to show
  // "To'lovni yakunlashda xatolik" and keep the sheet open, inviting a second
  // (duplicate) payment. Printing is now handled separately.
  const handleConfirmPayment = async () => {
    if (!orderUuid || paymentSaving) return;
    setPaymentSaving(true);
    try {
      // To'lov va yakunlash — bitta so'rovda (eski serverda mark-paid bilan to'ldiriladi)
      await ordersApi.completeWithPayment(orderUuid, editPaymentMethod, splitCount);
    } catch (err) {
      toast.error(getErrorMessage(err, "To'lovni yakunlashda xatolik yuz berdi."));
      setPaymentSaving(false);
      return;
    }
    // Same as the kanban flow (OrdersPage): free the table explicitly after a
    // dine-in order completes. Previously this path left the table OCCUPIED.
    tablesApi.updateTableStatus(table.uuid, 'AVAILABLE').catch(() => {
      toast.error("Stol holatini 'Bo'sh' ga o'tkazib bo'lmadi. Qo'lda o'zgartiring.");
    });
    try {
      await printReceiptUtil(orderUuid, true);
    } catch (err) {
      toast.error(getErrorMessage(err, "To'lov qabul qilindi, lekin chekni chop etib bo'lmadi."));
    }
    toast.success(`Stol ${table.table_number}: to'lov qabul qilindi`);
    setPaymentSaving(false);
    onClose(true);
  };

  const orderMins = table.current_order?.created_at ? minutesSince(table.current_order.created_at) : null;
  const total = isEditMode ? editItemsTotal : cartSubtotal;
  const count = isEditMode ? editItemsCount : cartCount;

  /* --------------------------------------------------------------- panes */
  const menuPane = (
    <div className={`${mobilePane === 'menu' ? 'flex' : 'hidden'} md:flex md:col-span-7 flex-col min-h-0 md:border-r border-edge`}>
      <div className="px-4 md:px-5 pt-3 space-y-2.5 shrink-0">
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={`${w.product} nomi bo'yicha qidirish`} />
        {categories.length > 0 && (
          <Tabs
            size="sm"
            value={activeCategoryUuid}
            onChange={setActiveCategoryUuid}
            options={[{ value: 'all', label: 'Barchasi' }, ...categories.map((c) => ({ value: c.uuid, label: c.name }))]}
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
          <EmptyState title={searchQuery ? 'Hech narsa topilmadi' : `${w.products} yo'q`} description={searchQuery ? "Boshqa so'z bilan qidirib ko'ring." : undefined} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredProducts.map((p) => {
              const qty = isEditMode ? 0 : cartQty(p.uuid);
              const adding = actionLoading === p.uuid;
              return (
                <div
                  key={p.uuid}
                  className={`rounded-2xl border bg-surface overflow-hidden flex flex-col ${
                    !p.is_available ? 'opacity-50 border-edge' : qty > 0 ? 'border-brand/40 ring-2 ring-brand/10' : 'border-edge'
                  }`}
                >
                  <button
                    type="button"
                    disabled={!p.is_available || (isEditMode && !!actionLoading)}
                    onClick={() => (isEditMode ? handleAddProductToOrder(p) : setCartQty(p, qty + 1))}
                    className="text-left flex-1 flex flex-col cursor-pointer disabled:cursor-not-allowed"
                  >
                    <div className="h-24 bg-field relative flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff className="w-6 h-6 text-subtle" />
                      )}
                      {!p.is_available && (
                        <span className="absolute inset-0 bg-surface/70 flex items-center justify-center text-[12px] font-extrabold text-danger-ink">Tugagan</span>
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
                  {!isEditMode && qty > 0 && (
                    <div className="px-2 pb-2 flex justify-center">
                      <QtyStepper size="sm" value={qty} onChange={(v) => setCartQty(p, v)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const orderPane = (
    <div className={`${mobilePane === 'order' ? 'flex' : 'hidden'} md:flex md:col-span-5 flex-col min-h-0`}>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-5 py-3 space-y-3">
        <div className="text-[13px] font-bold text-muted uppercase tracking-wide">{isEditMode ? 'Buyurtma tarkibi' : 'Savat'}</div>

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
            <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title="Buyurtma bo'sh" description={`${w.menu}dan qo'shing.`} className="py-8" />
          ) : (
            <div className="space-y-2">
              {orderItems.map((item, idx) => {
                const name = item.product_name || item.name || item.product?.name || "Noma'lum";
                const price = Number(item.price_at_time_of_order || item.product?.price || 0);
                const modifying = actionLoading === item.uuid;
                return (
                  <div key={item.uuid || idx} className="rounded-2xl border border-edge bg-surface p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-ink truncate">{name}</div>
                      <div className="text-[12px] text-muted tabular-nums">
                        {formatMoney(price)} × {item.quantity} = <span className="font-bold text-ink">{formatMoney(price * item.quantity)}</span>
                      </div>
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
          <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title="Savat bo'sh" description={`${w.menu}dan ${w.product.toLowerCase()} tanlang.`} className="py-8" />
        ) : (
          <div className="space-y-2">
            {cart.map((i) => (
              <div key={i.product.uuid} className="rounded-2xl border border-edge bg-surface p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink truncate">{i.product.name}</div>
                  <div className="text-[12px] text-muted tabular-nums">{formatMoney(i.product.price * i.quantity)}</div>
                </div>
                <QtyStepper size="sm" value={i.quantity} onChange={(v) => setCartQty(i.product, v)} />
                <IconButton label="Olib tashlash" variant="danger-soft" size="sm" onClick={() => setCartQty(i.product, 0)}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        {!isEditMode && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <Input label="Mijoz ismi" placeholder="Ixtiyoriy" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              <Input
                label="Telefon"
                type="tel"
                inputMode="tel"
                placeholder="+998 (90) 123-45-67"
                value={contactPhone}
                onFocus={() => !contactPhone && setContactPhone('+998')}
                onChange={(e) => setContactPhone(e.target.value.trim() ? maskPhoneInput(e.target.value) : '')}
              />
            </div>
            <Textarea label="Izoh" rows={2} placeholder="Masalan: achchiqsiz" value={comment} onChange={(e) => setComment(e.target.value)} />
            <p className="text-[12px] text-muted">To'lov usuli yaratishda so'ralmaydi — buyurtma topshirilganda (hisob-kitobda) bir marta qabul qilinadi.</p>
          </div>
        )}

        {submitError && <InlineAlert>{submitError}</InlineAlert>}
      </div>
    </div>
  );

  const footer = (
    <div className="w-full space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[14px] text-muted font-semibold">
          Jami{count > 0 ? ` · ${count} ta` : ''}
        </span>
        <span className="text-[20px] font-black text-ink tracking-tightest tabular-nums">{formatMoney(total)}</span>
      </div>
      {isEditMode && orderItems.length > 0 && (
        <SplitBill total={editItemsTotal} count={splitCount} onChange={setSplitCount} />
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="lg"
          icon={<FileText className="w-4 h-4" />}
          loading={printingPreCheck}
          disabled={isEditMode ? orderItems.length === 0 : cart.length === 0}
          onClick={handlePrintPreCheck}
          className="shrink-0"
        >
          Pre-chek
        </Button>
        {isEditMode ? (
          <Button
            variant="success"
            size="lg"
            className="flex-1"
            icon={<CreditCard className="w-5 h-5" />}
            disabled={orderItems.length === 0 || loadingItems}
            onClick={() => setPaymentOpen(true)}
          >
            To'lov qilish
          </Button>
        ) : (
          <Button size="lg" className="flex-1" icon={<CheckCircle className="w-5 h-5" />} loading={submitting} disabled={cart.length === 0} onClick={handleCreateOrder}>
            Buyurtma yaratish
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Sheet
        open
        size="full"
        flush
        persistent={submitting || paymentSaving}
        onClose={() => onClose(itemsChanged)}
        title={
          <span className="flex items-center gap-2">
            Stol {table.table_number}
            {isEditMode ? <Badge tone="gold">Band</Badge> : <Badge tone="success">Bo'sh</Badge>}
          </span>
        }
        subtitle={
          isEditMode
            ? `Buyurtma #${table.current_order?.order_number || ''}${orderMins !== null ? ` · ${orderMins} daq oldin` : ''}${table.current_order?.waiter_name ? ` · ${table.current_order.waiter_name}` : ''}`
            : `Yangi buyurtma · ${table.capacity} kishilik`
        }
        footer={footer}
      >
        <div className="flex flex-col h-[calc(92vh-220px)] md:h-[64vh]">
          <div className="md:hidden px-4 pt-3 shrink-0">
            <Segmented
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={mobilePane}
              onChange={setMobilePane}
              options={[
                { value: 'menu', label: w.menu, icon: <Plus className="w-4 h-4" /> },
                { value: 'order', label: `${isEditMode ? 'Buyurtma' : 'Savat'}${count ? ` (${count})` : ''}`, icon: <ShoppingBag className="w-4 h-4" /> },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12">
            {menuPane}
            {orderPane}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={paymentOpen}
        size="sm"
        persistent={paymentSaving}
        onClose={() => setPaymentOpen(false)}
        title="To'lovni qabul qilish"
        subtitle={`Stol ${table.table_number}`}
        footer={
          <>
            <Button variant="secondary" size="lg" disabled={paymentSaving} onClick={() => setPaymentOpen(false)} className="md:w-auto w-full">
              Bekor qilish
            </Button>
            <Button variant="success" size="lg" loading={paymentSaving} icon={<CheckCircle className="w-5 h-5" />} onClick={handleConfirmPayment} className="md:w-auto w-full">
              To'landi va yopish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-field p-4 text-center">
            <div className="text-[13px] text-muted font-semibold">To'lov summasi</div>
            <div className="text-[28px] font-black text-ink tracking-tightest tabular-nums">{formatMoney(editItemsTotal)}</div>
          </div>
          <PaymentPicker value={editPaymentMethod} onChange={setEditPaymentMethod} />
          {splitCount > 1 && (
            <p className="text-[13px] font-semibold text-ink text-center">
              Hisob {splitCount} kishiga bo'linadi — chekda ko'rsatiladi
            </p>
          )}
          <p className="text-[13px] text-muted">Tasdiqlangandan so'ng buyurtma yakunlanadi, stol bo'shatiladi va chek chop etiladi.</p>
        </div>
      </Sheet>
    </>
  );
};
