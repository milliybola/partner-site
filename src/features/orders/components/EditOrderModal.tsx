import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Loader2, ShoppingBag } from 'lucide-react';
import { ordersApi } from '../services/ordersApi';
import apiClient from '../../../core/api/client';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { getPartner, wording } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import { Button, EmptyState, ErrorState, LoadingState, QtyStepper, SearchInput, Segmented, Sheet } from '../../../core/ui';

interface EditOrderModalProps {
  orderUuid: string;
  orderNumber: string;
  onClose: (refresh: boolean) => void;
}

interface CatalogProduct {
  uuid: string;
  name: string;
  price: number;
  is_available: boolean;
}
interface CatalogCategory {
  uuid?: string;
  name: string;
  is_active?: boolean;
  products: CatalogProduct[];
}

const extractItems = (response: any): any[] => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

export const EditOrderModal: React.FC<EditOrderModalProps> = ({ orderUuid, orderNumber, onClose }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const w = wording();
  const [pane, setPane] = useState<'items' | 'add'>('items');

  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    setItemsError(null);
    try {
      setItems(extractItems(await ordersApi.getOrderItems(orderUuid)));
    } catch (err) {
      setItemsError(getErrorMessage(err, 'Buyurtma tarkibini yuklashda xatolik yuz berdi.'));
    } finally {
      setLoadingItems(false);
    }
  }, [orderUuid]);

  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const partnerUuid = getPartner()?.uuid;
      if (!partnerUuid) throw new Error('Hamkor identifikatori topilmadi. Qayta kiring.');
      const res = await apiClient.get(`partner/category/?partner=${partnerUuid}`);
      const raw = res.data?.data?.categories || res.data?.categories || res.data?.data || res.data || [];
      const mapped: CatalogCategory[] = Array.isArray(raw)
        ? raw.map((c: any) => ({
            uuid: c.uuid,
            name: c.category_details?.name || c.name || "Nomi yo'q",
            is_active: !!c.is_active,
            products: Array.isArray(c.products)
              ? c.products.map((p: any) => ({
                  uuid: p.uuid,
                  name: p.name,
                  price: parseFloat(p.price || '0'),
                  is_available: !!p.is_available && !!p.is_active,
                }))
              : [],
          }))
        : [];
      setCatalogCategories(mapped.filter((c) => c.is_active));
    } catch (err) {
      setCatalogError(getErrorMessage(err, "Menyuni yuklab bo'lmadi."));
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchCatalog();
  }, [fetchItems, fetchCatalog]);

  const handleUpdateQuantity = async (itemUuid: string, newQuantity: number) => {
    setActionLoading(itemUuid);
    try {
      await ordersApi.updateOrderItemQuantity(orderUuid, itemUuid, { quantity: newQuantity });
      setHasChanges(true);
      await fetchItems();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Miqdorni yangilashda xatolik yuz berdi.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveItem = async (itemUuid: string, currentQuantity: number, name: string) => {
    const ok = await confirm(`"${name}" buyurtmadan o'chirilsinmi?`, { danger: true, confirmText: "O'chirish", title: "Mahsulotni o'chirish" });
    if (!ok) return;
    setActionLoading(itemUuid);
    try {
      await ordersApi.removeOrderItems(orderUuid, { items: [{ item_uuid: itemUuid, quantity: currentQuantity }] });
      setHasChanges(true);
      await fetchItems();
    } catch (err) {
      toast.error(getErrorMessage(err, "Mahsulotni o'chirishda xatolik yuz berdi."));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddProduct = async (product: CatalogProduct) => {
    setActionLoading(product.uuid);
    try {
      await ordersApi.addOrderItems(orderUuid, { items: [{ product_uuid: product.uuid, quantity: 1 }] });
      setHasChanges(true);
      toast.success(`${product.name} qo'shildi`);
      await fetchItems();
    } catch (err) {
      toast.error(getErrorMessage(err, "Mahsulot qo'shishda xatolik yuz berdi."));
    } finally {
      setActionLoading(null);
    }
  };

  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return catalogCategories
        .map((cat) => ({ ...cat, products: cat.products.filter((p) => p.is_available) }))
        .filter((cat) => cat.products.length > 0);
    }
    const found: CatalogProduct[] = [];
    catalogCategories.forEach((cat) =>
      cat.products.forEach((p) => {
        if (p.is_available && p.name.toLowerCase().includes(query)) found.push(p);
      }),
    );
    return found.length ? [{ name: 'Qidiruv natijalari', products: found }] : [];
  }, [catalogCategories, catalogSearch]);

  const total = items.reduce((s, it) => s + Number(it.price_at_time_of_order || it.product?.price || 0) * (it.quantity || 0), 0);

  const itemsPane = (
    <div className="flex flex-col min-h-0">
      {loadingItems && items.length === 0 ? (
        <LoadingState label="Tarkib yuklanmoqda..." />
      ) : itemsError ? (
        <ErrorState message={itemsError} onRetry={fetchItems} />
      ) : items.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="w-7 h-7" />} title="Buyurtma bo'sh" description={`${w.product} qo'shish uchun "Qo'shish" bo'limiga o'ting.`} />
      ) : (
        <div className="divide-y divide-edge">
          {items.map((item, idx) => {
            const itemUuid = item.uuid;
            const name = item.product_name || item.name || item.product?.name || "Noma'lum mahsulot";
            const price = Number(item.price_at_time_of_order || item.product?.price || 0);
            const qty = Number(item.quantity) || 0;
            const busy = actionLoading === itemUuid;
            return (
              <div key={itemUuid || idx} className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink text-[15px] truncate">{name}</p>
                  <p className="text-[13px] text-muted mt-0.5 tabular-nums">
                    {formatMoney(price)} × {qty} = <span className="text-ink font-semibold">{formatMoney(price * qty)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {busy ? (
                    <span className="w-[120px] flex justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-brand" />
                    </span>
                  ) : (
                    <QtyStepper
                      size="sm"
                      value={qty}
                      min={1}
                      disabled={!!actionLoading}
                      onChange={(v) => handleUpdateQuantity(itemUuid, v)}
                    />
                  )}
                  <button
                    type="button"
                    aria-label="O'chirish"
                    onClick={() => handleRemoveItem(itemUuid, qty, name)}
                    disabled={!!actionLoading}
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-danger-ink hover:bg-danger-soft disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const addPane = (
    <div className="flex flex-col gap-3 min-h-0">
      <SearchInput value={catalogSearch} onChange={setCatalogSearch} placeholder={`${w.product} qidirish...`} />
      {loadingCatalog ? (
        <LoadingState label="Menyu yuklanmoqda..." />
      ) : catalogError ? (
        <ErrorState message={catalogError} onRetry={fetchCatalog} />
      ) : filteredCatalog.length === 0 ? (
        <EmptyState title="Mahsulot topilmadi" description="Qidiruvni o'zgartirib ko'ring yoki menyuda mahsulot faol ekanini tekshiring." />
      ) : (
        <div className="space-y-4">
          {filteredCatalog.map((cat, ci) => (
            <div key={ci}>
              <div className="text-[12px] font-bold uppercase tracking-wider text-subtle mb-1.5">{cat.name}</div>
              <div className="space-y-1.5">
                {cat.products.map((p) => (
                  <button
                    key={p.uuid}
                    type="button"
                    onClick={() => handleAddProduct(p)}
                    disabled={!!actionLoading}
                    className="w-full min-h-[52px] px-3 py-2 rounded-xl bg-field hover:bg-edge-strong flex items-center justify-between gap-3 text-left disabled:opacity-50 cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink truncate">{p.name}</span>
                      <span className="block text-[13px] text-brand font-bold tabular-nums">{formatMoney(p.price)}</span>
                    </span>
                    <span className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center shrink-0">
                      {actionLoading === p.uuid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Sheet
      open
      onClose={() => onClose(hasChanges)}
      title="Buyurtmani tahrirlash"
      subtitle={`Buyurtma ${orderNumber}`}
      size="xl"
      footer={
        <>
          <div className="md:mr-auto flex items-center justify-between md:justify-start gap-2 text-[15px]">
            <span className="text-muted">Jami (taxminiy):</span>
            <span className="font-black text-ink tabular-nums">{formatMoney(total)}</span>
          </div>
          <Button size="lg" onClick={() => onClose(hasChanges)} className="md:min-w-[160px]">
            Tayyor
          </Button>
        </>
      }
    >
      <div className="md:hidden mb-3">
        <Segmented
          value={pane}
          onChange={setPane}
          options={[
            { value: 'items', label: `Tarkib (${items.length})` },
            { value: 'add', label: "Qo'shish" },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </div>
      <div className="md:grid md:grid-cols-12 md:gap-6">
        <div className={`md:col-span-7 ${pane === 'items' ? '' : 'hidden md:block'}`}>
          <div className="hidden md:block text-[12px] font-bold uppercase tracking-wider text-subtle mb-1">Buyurtma tarkibi</div>
          {itemsPane}
        </div>
        <div className={`md:col-span-5 md:border-l md:border-edge md:pl-6 ${pane === 'add' ? '' : 'hidden md:block'}`}>
          <div className="hidden md:block text-[12px] font-bold uppercase tracking-wider text-subtle mb-2">Mahsulot qo'shish</div>
          {addPane}
        </div>
      </div>
    </Sheet>
  );
};
