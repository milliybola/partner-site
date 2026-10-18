import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Gift, ImageOff, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ApiGap,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  SkeletonList,
  Switch,
  Tabs,
} from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { formatDate, formatMoney, parseDate } from '../../../core/lib/format';
import { getErrorMessage, isMissingEndpoint } from '../../../core/lib/errors';
import { getPartner, wording } from '../../../core/lib/session';
import { calcBuyXGetY, loadCatalogProducts, promoLabel, promotionsApi } from '../services/promotionsApi';
import type { CatalogProduct, ComboSet, Promotion } from '../services/promotionsApi';
import { BACKEND_NOT_READY_MSG, SetEditorSheet } from '../components/SetEditorSheet';
import { PromoEditorSheet } from '../components/PromoEditorSheet';

type Tab = 'sets' | 'promos';
type LoadState<T> =
  | { status: 'loading' }
  | { status: 'missing' } // endpoint not deployed yet (404/405)
  | { status: 'error'; message: string }
  | { status: 'ready'; items: T[] };

const GAP_TITLE = 'Backend hali tayyor emas: partner/my/sets/, partner/my/promotions/ (API_CONTRACT_SETS_PROMOS.md)';

const dateRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return 'Muddatsiz';
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return start ? `${formatDate(start)} dan` : `${formatDate(end)} gacha`;
};

/** Ended / not started yet badge, computed from real dates only. */
const periodBadge = (start?: string | null, end?: string | null) => {
  const now = new Date();
  const s = parseDate(start);
  const e = parseDate(end);
  if (e) {
    const endOfDay = new Date(e);
    endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay < now) return <Badge tone="neutral">Muddati tugagan</Badge>;
  }
  if (s && s > now) return <Badge tone="info">Hali boshlanmagan</Badge>;
  return null;
};

const Thumb: React.FC<{ src?: string | null; icon: React.ReactNode }> = ({ src, icon }) =>
  src ? (
    <img src={src} alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover bg-field shrink-0" />
  ) : (
    <span className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-field text-subtle flex items-center justify-center shrink-0">{icon}</span>
  );

const MissingState: React.FC<{ what: string }> = ({ what }) => (
  <EmptyState
    icon={<Gift className="w-7 h-7" />}
    title="Bu funksiya tez orada ishga tushadi"
    description={
      <span>
        {what} serverda hali yoqilmagan. Backend tayyor bo'lishi bilan shu yerda boshqarishingiz mumkin bo'ladi.{' '}
        <ApiGap title={GAP_TITLE} />
      </span>
    }
  />
);

const PromotionsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const w = wording();
  const partnerUuid = getPartner()?.uuid;

  const [tab, setTab] = useState<Tab>('sets');
  const [sets, setSets] = useState<LoadState<ComboSet>>({ status: 'loading' });
  const [promos, setPromos] = useState<LoadState<Promotion>>({ status: 'loading' });

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [setEditor, setSetEditor] = useState<{ open: boolean; item: ComboSet | null }>({ open: false, item: null });
  const [promoEditor, setPromoEditor] = useState<{ open: boolean; item: Promotion | null }>({ open: false, item: null });
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    setSets({ status: 'loading' });
    try {
      setSets({ status: 'ready', items: await promotionsApi.getMySets() });
    } catch (err) {
      setSets(isMissingEndpoint(err) ? { status: 'missing' } : { status: 'error', message: getErrorMessage(err) });
    }
  }, []);

  const loadPromos = useCallback(async () => {
    setPromos({ status: 'loading' });
    try {
      setPromos({ status: 'ready', items: await promotionsApi.getMyPromotions() });
    } catch (err) {
      setPromos(isMissingEndpoint(err) ? { status: 'missing' } : { status: 'error', message: getErrorMessage(err) });
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (!partnerUuid) {
      setProductsError("Muassasa ma'lumotlari topilmadi. Qaytadan tizimga kiring.");
      setProductsLoading(false);
      return;
    }
    setProductsLoading(true);
    setProductsError(null);
    try {
      setProducts(await loadCatalogProducts(partnerUuid));
    } catch (err) {
      setProductsError(getErrorMessage(err, "Menyuni yuklab bo'lmadi"));
    } finally {
      setProductsLoading(false);
    }
  }, [partnerUuid]);

  useEffect(() => {
    loadSets();
    loadPromos();
    loadProducts();
  }, [loadSets, loadPromos, loadProducts]);

  const productName = useMemo(() => {
    const m = new Map(products.map((p) => [p.uuid, p.name]));
    return (uuid: string) => m.get(uuid);
  }, [products]);

  /* ---------------------------------------------------------- mutations */
  const upsert = <T extends { uuid?: string }>(state: LoadState<T>, item: T): LoadState<T> => {
    if (state.status !== 'ready' || !item?.uuid) return state;
    const exists = state.items.some((x) => x.uuid === item.uuid);
    return { status: 'ready', items: exists ? state.items.map((x) => (x.uuid === item.uuid ? { ...x, ...item } : x)) : [item, ...state.items] };
  };

  const toggleSet = async (s: ComboSet) => {
    if (!s.uuid) return;
    const next = !(s.is_active ?? false);
    setBusyUuid(s.uuid);
    setSets((st) => upsert(st, { ...s, is_active: next }));
    try {
      await promotionsApi.updateSet(s.uuid, { is_active: next });
    } catch (err) {
      setSets((st) => upsert(st, s));
      toast.error(isMissingEndpoint(err) ? BACKEND_NOT_READY_MSG : getErrorMessage(err));
    } finally {
      setBusyUuid(null);
    }
  };

  const togglePromo = async (p: Promotion) => {
    if (!p.uuid) return;
    const next = !(p.is_active ?? false);
    setBusyUuid(p.uuid);
    setPromos((st) => upsert(st, { ...p, is_active: next }));
    try {
      await promotionsApi.updatePromotion(p.uuid, { is_active: next });
    } catch (err) {
      setPromos((st) => upsert(st, p));
      toast.error(isMissingEndpoint(err) ? BACKEND_NOT_READY_MSG : getErrorMessage(err));
    } finally {
      setBusyUuid(null);
    }
  };

  const removeSet = async (s: ComboSet) => {
    if (!s.uuid) return;
    const ok = await confirm(`«${s.name || 'Set'}» o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`, {
      title: "Setni o'chirish",
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;
    setBusyUuid(s.uuid);
    try {
      await promotionsApi.deleteSet(s.uuid);
      setSets((st) => (st.status === 'ready' ? { status: 'ready', items: st.items.filter((x) => x.uuid !== s.uuid) } : st));
      toast.success("Set o'chirildi");
    } catch (err) {
      toast.error(isMissingEndpoint(err) ? BACKEND_NOT_READY_MSG : getErrorMessage(err));
    } finally {
      setBusyUuid(null);
    }
  };

  const removePromo = async (p: Promotion) => {
    if (!p.uuid) return;
    const ok = await confirm(`${promoLabel(p)} aksiyasi o'chirilsinmi?`, {
      title: "Aksiyani o'chirish",
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;
    setBusyUuid(p.uuid);
    try {
      await promotionsApi.deletePromotion(p.uuid);
      setPromos((st) => (st.status === 'ready' ? { status: 'ready', items: st.items.filter((x) => x.uuid !== p.uuid) } : st));
      toast.success("Aksiya o'chirildi");
    } catch (err) {
      toast.error(isMissingEndpoint(err) ? BACKEND_NOT_READY_MSG : getErrorMessage(err));
    } finally {
      setBusyUuid(null);
    }
  };

  /* ------------------------------------------------------------ renders */
  const renderSets = () => {
    if (sets.status === 'loading') return <SkeletonList rows={3} />;
    if (sets.status === 'missing') return <MissingState what="Setlar" />;
    if (sets.status === 'error') return <ErrorState message={sets.message} onRetry={loadSets} />;
    if (sets.items.length === 0)
      return (
        <EmptyState
          icon={<Layers className="w-7 h-7" />}
          title="Hali set yo'q"
          description={`Bir nechta ${w.products.toLowerCase()}ni bitta arzonroq narxda taklif qiling.`}
          action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setSetEditor({ open: true, item: null })}>Set yaratish</Button>}
        />
      );
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {sets.items.map((s, i) => {
          const items = Array.isArray(s.items) ? s.items : [];
          const summary = items
            .map((it) => `${it.quantity ?? 1}× ${it.name || (it.product && productName(it.product)) || "noma'lum"}`)
            .join(', ');
          return (
            <div key={s.uuid || i} className="bg-surface border border-edge rounded-2xl p-4 flex gap-3.5">
              <Thumb src={s.image} icon={<ImageOff className="w-5 h-5" />} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-extrabold text-ink tracking-tightest truncate">{s.name || 'Nomsiz set'}</h3>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-[16px] font-black text-brand">{s.price !== undefined && s.price !== null ? formatMoney(s.price) : '—'}</span>
                      {!!s.old_price && Number(s.old_price) > Number(s.price || 0) && (
                        <span className="text-[13px] text-subtle line-through">{formatMoney(s.old_price)}</span>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={!!s.is_active}
                    onChange={() => toggleSet(s)}
                    disabled={busyUuid === s.uuid || !s.uuid}
                    label="Faol"
                  />
                </div>
                {summary && <p className="text-[13px] text-muted mt-1.5 line-clamp-2">{summary}</p>}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Faol' : "O'chiq"}</Badge>
                  <Badge tone="neutral">
                    <CalendarDays className="w-3 h-3" />
                    {dateRange(s.start_date, s.end_date)}
                  </Badge>
                  {periodBadge(s.start_date, s.end_date)}
                  <span className="flex-1" />
                  <IconButton label="Tahrirlash" onClick={() => setSetEditor({ open: true, item: s })}>
                    <Pencil className="w-4 h-4" />
                  </IconButton>
                  <IconButton label="O'chirish" variant="danger-soft" disabled={busyUuid === s.uuid} onClick={() => removeSet(s)}>
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPromos = () => {
    if (promos.status === 'loading') return <SkeletonList rows={3} />;
    if (promos.status === 'missing') return <MissingState what="1+1 / 2+1 aksiyalar" />;
    if (promos.status === 'error') return <ErrorState message={promos.message} onRetry={loadPromos} />;
    if (promos.items.length === 0)
      return (
        <EmptyState
          icon={<Gift className="w-7 h-7" />}
          title="Hali aksiya yo'q"
          description="«1+1» yoki «2+1» aksiyasi bilan sotuvni oshiring."
          action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setPromoEditor({ open: true, item: null })}>Aksiya yaratish</Button>}
        />
      );
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {promos.items.map((p, i) => {
          const ids = Array.isArray(p.products) ? p.products : [];
          const names = ids.map((id) => productName(id)).filter(Boolean) as string[];
          const unknown = ids.length - names.length;
          const ex = calcBuyXGetY(7, p.buy_quantity || 0, p.get_quantity || 0);
          return (
            <div key={p.uuid || i} className="bg-surface border border-edge rounded-2xl p-4 flex gap-3.5">
              <span className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gold text-ink flex items-center justify-center shrink-0 text-[22px] md:text-[26px] font-black tracking-tightest">
                {promoLabel(p)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-extrabold text-ink tracking-tightest">
                      {p.buy_quantity ?? '?'} ta olsa — {p.get_quantity ?? '?'} ta bepul
                    </h3>
                    <p className="text-[12px] text-muted mt-0.5">7 ta olsa: {ex.pay} ta to'laydi, {ex.free} ta bepul</p>
                  </div>
                  <Switch
                    checked={!!p.is_active}
                    onChange={() => togglePromo(p)}
                    disabled={busyUuid === p.uuid || !p.uuid}
                    label="Faol"
                  />
                </div>
                <p className="text-[13px] text-ink mt-1.5 line-clamp-2">
                  {names.length ? names.join(', ') : ids.length ? '' : `${w.products} tanlanmagan`}
                  {unknown > 0 && <span className="text-muted">{names.length ? ', ' : ''}+{unknown} ta (menyuda topilmadi)</span>}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <Badge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Faol' : "O'chiq"}</Badge>
                  <Badge tone="neutral">
                    <CalendarDays className="w-3 h-3" />
                    {dateRange(p.start_date, p.end_date)}
                  </Badge>
                  {periodBadge(p.start_date, p.end_date)}
                  <span className="flex-1" />
                  <IconButton label="Tahrirlash" onClick={() => setPromoEditor({ open: true, item: p })}>
                    <Pencil className="w-4 h-4" />
                  </IconButton>
                  <IconButton label="O'chirish" variant="danger-soft" disabled={busyUuid === p.uuid} onClick={() => removePromo(p)}>
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const count = (s: LoadState<unknown>) => (s.status === 'ready' ? s.items.length : undefined);
  const openCreate = () => (tab === 'sets' ? setSetEditor({ open: true, item: null }) : setPromoEditor({ open: true, item: null }));

  return (
    <div>
      <PageHeader
        title="Setlar va aksiyalar"
        subtitle="Kombo setlar va «1+1», «2+1» aksiyalarini boshqaring"
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            <span className="hidden sm:inline">{tab === 'sets' ? 'Yangi set' : 'Yangi aksiya'}</span>
            <span className="sm:hidden">Qo'shish</span>
          </Button>
        }
      >
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sets', label: 'Setlar', icon: <Layers className="w-4 h-4" />, count: count(sets) },
            { value: 'promos', label: '1+1 / 2+1 aksiyalar', icon: <Gift className="w-4 h-4" />, count: count(promos) },
          ]}
        />
      </PageHeader>

      <ApiGap block title={GAP_TITLE} className="mb-4">
        Bu bo'lim yangi backend funksiyasiga tayanadi. Server tayyor bo'lmaguncha ro'yxat bo'sh ko'rinadi va saqlash ishlamaydi.
      </ApiGap>

      {tab === 'sets' ? renderSets() : renderPromos()}

      <SetEditorSheet
        open={setEditor.open}
        initial={setEditor.item}
        products={products}
        productsLoading={productsLoading}
        productsError={productsError}
        onRetryProducts={loadProducts}
        onClose={() => setSetEditor({ open: false, item: null })}
        onSaved={(s) => {
          setSetEditor({ open: false, item: null });
          if (s?.uuid) setSets((st) => upsert(st, s));
          else loadSets();
        }}
      />
      <PromoEditorSheet
        open={promoEditor.open}
        initial={promoEditor.item}
        products={products}
        productsLoading={productsLoading}
        productsError={productsError}
        onRetryProducts={loadProducts}
        onClose={() => setPromoEditor({ open: false, item: null })}
        onSaved={(p) => {
          setPromoEditor({ open: false, item: null });
          if (p?.uuid) setPromos((st) => upsert(st, p));
          else loadPromos();
        }}
      />
    </div>
  );
};

export default PromotionsPage;
