/**
 * Buyurtma yaratish oqimlari (Kassa: CreateOrderPage, Stol: TableOrderModal) uchun UMUMIY savat hisobi.
 * Sof funksiyalar — React'siz, test qilinadi (posCart.test.ts). Pul hisobini faqat shu yerda o'zgartiring.
 */
import { unitPrice } from '../components/ProductConfigSheet';
import type { PosOptionGroup, PosPackaging, SelectedOption } from '../components/ProductConfigSheet';

export interface CatalogProduct {
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
  promotion?: { label?: string; buy_quantity?: number; get_quantity?: number } | null;
  kind?: 'SINGLE' | 'SET';
  set_items?: { name: string; quantity: number }[];
}

export interface CatalogCategory {
  id?: number | string;
  uuid: string;
  name: string;
  is_active: boolean;
  products: CatalogProduct[];
}

export interface CartLine {
  product: CatalogProduct;
  /** Dona/kg yoki (qadoq tanlangan bo'lsa) qadoqlar soni */
  quantity: number;
  /** Qator identifikatori (mahsulot + variantlar + qadoq). Eski saqlangan savatlarda yo'q — product.uuid */
  key?: string;
  options?: SelectedOption[];
  packaging?: PosPackaging | null;
}

/* ------------------------------------------------------------ katalog */

/* eslint-disable @typescript-eslint/no-explicit-any -- server javobi turlanmagan */
const mainImage = (p: any): string | null => p.images?.find((img: any) => img.is_main)?.image || p.images?.[0]?.image || p.image_url || null;

/** Server kategoriyalarini ro'yxatga aylantiradi (faol/nofaol filtrlanmaydi — chaqiruvchi o'zi filtrlaydi) */
export const mapCategories = (rawCats: unknown, mapProduct: (p: any) => CatalogProduct, withId = false): CatalogCategory[] =>
  Array.isArray(rawCats)
    ? rawCats.map((c: any) => ({
        ...(withId ? { id: c.id } : {}),
        uuid: c.uuid,
        name: c.category_details?.name || c.name || "Nomi yo'q",
        is_active: !!c.is_active,
        products: Array.isArray(c.products) ? c.products.map(mapProduct) : [],
      }))
    : [];

/** Kassa mahsuloti: birlik narxi serverdan (`final_price`), aksiya, set, variant, qadoq, kg */
export const mapPosProduct = (p: any): CatalogProduct => {
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
    promotion:
      p.promotion && typeof p.promotion === 'object'
        ? {
            label: p.promotion.label,
            buy_quantity: Number(p.promotion.buy_quantity) || 0,
            get_quantity: Number(p.promotion.get_quantity) || 0,
          }
        : null,
    kind: p.kind === 'SET' ? 'SET' : 'SINGLE',
    set_items: (Array.isArray(p.set_items) ? p.set_items : []).map((s: any) => ({ name: s.name, quantity: Number(s.quantity) || 1 })),
    original_price: raw,
    discount: raw > 0 && price < raw ? Math.round((1 - price / raw) * 100) : 0,
    is_available: !!p.is_available && !!p.is_active,
    image_url: mainImage(p),
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
  } as CatalogProduct;
};

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Kategoriya bo'yicha mahsulotlar; 'all' — hammasi, takrorsiz (bir mahsulot bir necha kategoriyada bo'lishi mumkin) */
export const filterProducts = (categories: CatalogCategory[], activeCategoryUuid: string): CatalogProduct[] => {
  if (activeCategoryUuid !== 'all') return categories.find((c) => c.uuid === activeCategoryUuid)?.products || [];
  const list: CatalogProduct[] = [];
  const seen = new Set<string>();
  categories.forEach((c) =>
    c.products.forEach((p) => {
      if (!seen.has(p.uuid)) {
        seen.add(p.uuid);
        list.push(p);
      }
    }),
  );
  return list;
};

/* -------------------------------------------------------------- savat */

export const keyOf = (i: CartLine) => i.key ?? i.product.uuid;
/** Qator taxminiy summasi (server narxi kelguncha); variant/qadoqsiz qatorda = narx × son */
export const linePrice = (i: CartLine) => unitPrice(i.product, i.options, i.packaging) * i.quantity;
export const qtyText = (i: CartLine) =>
  i.packaging ? `${i.quantity} × ${i.packaging.name}` : i.product.unit === 'KG' ? `${Number(i.quantity.toFixed(3))} kg` : String(i.quantity);
/** Chekda ko'rinadigan nom: "Lavash (Achchiq, Katta)" */
export const lineName = (i: CartLine) => (i.options?.length ? `${i.product.name} (${i.options.map((o) => o.name).join(', ')})` : i.product.name);

/** Savatning taxminiy summasi (qatorlar yig'indisi) */
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((s, i) => s + linePrice(i), 0);
/** Pozitsiyalar soni: kg qatori "1 ta" hisoblanadi, kasr son emas */
export const countItems = (lines: CartLine[]) => lines.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0);

/**
 * Avtomatik sovg'a (1+1 / 2+1): har [buy_quantity] ta TO'LANGANga [get_quantity] ta sovg'a.
 * `quantity` — kassir tanlagan (to'langan) son P. Faqat dona mahsulot, qadoqsiz, faol aksiya.
 * Serverga P + sovg'a yuboriladi; server bepulni = floor(jami/(buy+get))*get = aynan shu sovg'a deb tasdiqlaydi.
 */
export const giftOf = (i: CartLine): number => {
  const p = i.product.promotion;
  if (!p || !p.buy_quantity || !p.get_quantity || p.buy_quantity <= 0 || p.get_quantity <= 0) return 0;
  if (i.product.unit === 'KG' || i.packaging) return 0;
  // Aksiya bir buyurtmada BIR MARTA: `buy` ta to'lansa `get` ta sovg'a (ko'pida ham shuncha)
  return i.quantity >= p.buy_quantity ? p.get_quantity : 0;
};

/** Serverga yuboriladigan miqdor: dona promo qatorida to'langan + sovg'a, aks holda `quantity` */
export const sendQtyOf = (i: CartLine): number => Number((i.quantity + giftOf(i)).toFixed(3));

/** Sovg'a hali yo'q bo'lsa undaydigan izoh: "1+1 aksiya · yana N ta oling — 1 ta sovg'a" */
export const dealNote = (i: CartLine): string | null => {
  const p = i.product.promotion;
  if (!p || !p.buy_quantity || !p.get_quantity || p.buy_quantity <= 0 || p.get_quantity <= 0) return null;
  if (i.product.unit === 'KG' || i.packaging) return null;
  if (i.quantity >= p.buy_quantity) return null; // sovg'a allaqachon qo'shilgan
  const needPaid = Math.max(p.buy_quantity - i.quantity, 1);
  const label = p.label || `${p.buy_quantity}+${p.get_quantity}`;
  return `${label} aksiya · yana ${needPaid} ta oling — ${p.get_quantity} ta sovg'a`;
};

/** Serverga yuboriladigan qator (quote ham, buyurtma yaratish ham bir xil shaklda) */
export interface PosSendItem {
  product_uuid: string;
  quantity: number;
  packaging?: string;
  options?: string[];
}

/** Savat → server qatorlari: promo qatorida to'langan + avto-sovg'a yuboriladi; server bepulni tasdiqlaydi */
/**
 * Menyu kartasidagi narx oralig'i: majburiy guruhlar (o'lcham, go'sht turi) bo'yicha eng arzon va eng qimmat tanlov.
 * Ixtiyoriy qo'shimchalar (ikki barobar pishloq) hisobga olinmaydi. Oraliq bo'lmasa (bitta narx) — null.
 */
export const priceRange = (p: { price: number; option_groups?: PosOptionGroup[] }): { min: number; max: number } | null => {
  let min = p.price;
  let max = p.price;
  for (const g of p.option_groups ?? []) {
    if (g.min_select <= 0) continue;
    const deltas = g.options.filter((o) => o.is_available).map((o) => o.price_delta).sort((a, b) => a - b);
    if (!deltas.length) continue;
    min += deltas.slice(0, g.min_select).reduce((s, d) => s + d, 0);
    max += deltas.slice(-Math.max(g.min_select, g.max_select)).reduce((s, d) => s + d, 0);
  }
  return max > min ? { min, max } : null;
};

export const buildPosItems = (lines: CartLine[]): PosSendItem[] =>
  lines.map((i) => ({
    product_uuid: i.product.uuid,
    quantity: sendQtyOf(i),
    ...(i.packaging ? { packaging: i.packaging.uuid } : {}),
    ...(i.options?.length ? { options: i.options.map((o) => o.uuid) } : {}),
  }));

/* -------------------------------------------------------------- jami */

/** Xizmat haqi: server bilan bir xil — foiz summaning so'mgacha yaxlitlangani (backend: service_charge_for) */
export const serviceChargeFor = (subtotal: number, percent: number) => (percent > 0 && subtotal > 0 ? Math.round((subtotal * percent) / 100) : 0);

/**
 * Yetkazish narxi: faqat hamkor profilida ma'lum bo'lsa (aks holda null — server hisoblaydi).
 * Yetkazish bo'lmagan turda 0; chegara (threshold) dan oshsa bepul.
 */
export const deliveryFeeFor = (isDelivery: boolean, subtotal: number, knownFee: number | null, knownThreshold: number | null): number | null =>
  !isDelivery
    ? 0
    : knownFee === null || Number.isNaN(knownFee)
      ? null
      : knownThreshold !== null && knownThreshold > 0 && subtotal >= knownThreshold
        ? 0
        : knownFee;

/** Umumiy summa: mahsulotlar + yetkazish (noma'lum bo'lsa 0) + xizmat haqi */
export const orderTotal = (subtotal: number, serviceCharge: number, deliveryFee: number | null = 0) => subtotal + (deliveryFee || 0) + serviceCharge;

/** Server savat hisobi (POS quote) — faqat jami uchun kerakli maydonlar */
export interface QuoteTotalsLike {
  subtotal: number | string;
  discount_amount?: number | string;
  service_charge_percent?: number | string;
  service_charge_amount?: number | string;
}

export interface CartSummary {
  /** Mahsulotlar summasi (server bo'lsa — aksiya ayirilgan) */
  subtotal: number;
  /** Aksiya / chegirma (ma'lumot uchun; subtotal ichida allaqachon ayirilgan) */
  discount: number;
  serviceCharge: number;
  serviceChargePercent: number;
  /** Server summasi keldimi (false — taxminiy) */
  fromServer: boolean;
}

/**
 * Savat jami — Kassa va Stol oynasi uchun BITTA formula.
 * Server quote bo'lsa — uning summasi asosiy (1+1 sovg'a, aksiya, chegirma); kelmaguncha — taxminiy (qatorlar yig'indisi).
 * Xizmat haqi chegirmadan KEYINGI summadan (Q39):
 *  - `noServiceCharge` (o'z-o'ziga xizmat) — 0;
 *  - `serviceChargePercent` berilsa (stol filiali foizi — server buyurtma yaratganda aynan shuni oladi) —
 *    server formulasi bilan server subtotalidan;
 *  - aks holda quote'dagi summa (kassa).
 */
export const cartSummary = (
  lines: CartLine[],
  quote: QuoteTotalsLike | null,
  opts: { noServiceCharge?: boolean; serviceChargePercent?: number | null } = {},
): CartSummary => {
  const subtotal = quote ? Number(quote.subtotal) || 0 : cartSubtotal(lines);
  const discount = quote ? Number(quote.discount_amount) || 0 : 0;
  const knownPercent = opts.serviceChargePercent ?? null;
  const serviceChargePercent = knownPercent !== null ? knownPercent : quote ? Number(quote.service_charge_percent) || 0 : 0;
  const serviceCharge = opts.noServiceCharge
    ? 0
    : knownPercent !== null
      ? serviceChargeFor(subtotal, knownPercent)
      : quote
        ? Number(quote.service_charge_amount) || 0
        : 0;
  return { subtotal, discount, serviceCharge, serviceChargePercent, fromServer: !!quote };
};

/* eslint-disable @typescript-eslint/no-explicit-any -- server buyurtma qatorlari turlanmagan */
/** Ochiq (serverdagi) buyurtma qatorlari: summa (server `line_total` — aksiya ayirilgan; bo'lmasa narx × son) va son */
export const orderItemsTotal = (items: any[]) =>
  items.reduce(
    (s, i) => s + (i.line_total !== undefined && i.line_total !== null ? Number(i.line_total) || 0 : Number(i.price_at_time_of_order || i.product?.price || 0) * (i.quantity || 0)),
    0,
  );
export const orderItemsCount = (items: any[]) => items.reduce((s, i) => s + (i.quantity || 0), 0);
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Ochiq buyurtma bo'yicha server javobi (`partner-pos/<uuid>/items/`) */
export interface ServerBill {
  total_price?: number | string | null;
  delivery_fee?: number | string | null;
  service_charge_percent?: number | string | null;
  service_charge_amount?: number | string | null;
}

/**
 * Ochiq buyurtma jami: server `total_price` asosiy (aksiya, qo'lda chegirma, xizmat haqi — hammasi serverda).
 * Server summasi bo'lmasa — taxminiy: qatorlar + xizmat haqi (`fallbackPercent`).
 * `discount` — qo'lda chegirma (qatorlar + xizmat haqi + yetkazish − server jami).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const openOrderSummary = (items: any[], bill: ServerBill | null, fallbackPercent: number): CartSummary & { total: number } => {
  const subtotal = orderItemsTotal(items);
  const serverTotal = bill && bill.total_price !== undefined && bill.total_price !== null && Number.isFinite(Number(bill.total_price)) ? Number(bill.total_price) : null;
  if (serverTotal === null) {
    const serviceCharge = serviceChargeFor(subtotal, fallbackPercent);
    return { subtotal, discount: 0, serviceCharge, serviceChargePercent: fallbackPercent, fromServer: false, total: orderTotal(subtotal, serviceCharge) };
  }
  const serviceCharge = Number(bill?.service_charge_amount) || 0;
  const delivery = Number(bill?.delivery_fee) || 0;
  const discount = Math.max(0, Math.round(subtotal + serviceCharge + delivery - serverTotal));
  return { subtotal, discount, serviceCharge, serviceChargePercent: Number(bill?.service_charge_percent) || 0, fromServer: true, total: serverTotal };
};

/* ------------------------------------------------------- qo'lda chegirma */

/** Kassada beriladigan chegirma: foiz yoki summa (bittasi) */
export type ManualDiscountInput = { percent: number } | { amount: number };

/**
 * Qo'lda chegirma (A10) oldindan ko'rinishi — server formulasi bilan bir xil (pricing.manual_discount_for):
 *  - chegirma taomlar summasidan (aksiya ayirilgandan keyin): foiz → so'mgacha yaxlitlangan, summa → o'zi; 0..subtotal;
 *  - xizmat haqi chegirmadan KEYINGI summadan (Q39); yetkazishga tegilmaydi;
 *  - jami = subtotal − chegirma + yetkazish + xizmat haqi.
 * Faqat ko'rsatish uchun: haqiqiy summani server qaytaradi.
 */
export const manualDiscountPreview = (
  subtotal: number,
  input: ManualDiscountInput,
  serviceChargePercent = 0,
  deliveryFee = 0,
): { discount: number; serviceCharge: number; total: number } => {
  const sub = Math.max(0, subtotal);
  const raw = 'percent' in input ? Math.round((sub * Math.max(0, input.percent)) / 100) : Math.round(Math.max(0, input.amount));
  const discount = Math.min(raw, sub);
  const serviceCharge = serviceChargeFor(sub - discount, serviceChargePercent);
  return { discount, serviceCharge, total: sub - discount + (deliveryFee || 0) + serviceCharge };
};
