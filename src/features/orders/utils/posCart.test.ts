import { describe, expect, it } from 'vitest';
import { unitPrice } from '../components/ProductConfigSheet';
import {
  buildPosItems,
  cartSubtotal,
  cartSummary,
  countItems,
  dealNote,
  deliveryFeeFor,
  filterProducts,
  giftOf,
  linePrice,
  manualDiscountPreview,
  mapCategories,
  mapPosProduct,
  openOrderSummary,
  orderItemsCount,
  orderItemsTotal,
  orderTotal,
  sendQtyOf,
  serviceChargeFor,
} from './posCart';
import type { CartLine, CatalogProduct } from './posCart';

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * D6 refaktoridan OLDINGI formulalar — ikki fayldan so'zma-so'z ko'chirilgan («oltin» namuna).
 * Yangi umumiy funksiyalar aynan shu natijani berishi shart (bir tiyin ham farqsiz).
 */
const legacy = {
  // CreateOrderPage
  pageSubtotal: (cart: CartLine[]) => cart.reduce((s, i) => s + unitPrice(i.product, i.options, i.packaging) * i.quantity, 0),
  pageItemsCount: (cart: CartLine[]) => cart.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0),
  pageDeliveryFee: (serviceType: string, subtotal: number, knownFee: number | null, knownThreshold: number | null): number | null =>
    serviceType !== 'DELIVERY'
      ? 0
      : knownFee === null || Number.isNaN(knownFee)
        ? null
        : knownThreshold !== null && knownThreshold > 0 && subtotal >= knownThreshold
          ? 0
          : knownFee,
  pageTotal: (subtotal: number, deliveryFee: number | null, serviceCharge: number) => subtotal + (deliveryFee || 0) + serviceCharge,
  pageGift: (i: CartLine): number => {
    const p = i.product.promotion;
    if (!p || !p.buy_quantity || !p.get_quantity || p.buy_quantity <= 0 || p.get_quantity <= 0) return 0;
    if (i.product.unit === 'KG' || i.packaging) return 0;
    return i.quantity >= p.buy_quantity ? p.get_quantity : 0;
  },
  pageMapProduct: (p: any) => {
    const raw = parseFloat(p.price || '0') || 0;
    const disc = p.discount ? parseFloat(p.discount) || 0 : 0;
    const serverPrice = p.final_price !== undefined && p.final_price !== null ? parseFloat(p.final_price) : NaN;
    const price = Number.isFinite(serverPrice) ? serverPrice : disc > 0 ? raw * (1 - disc / 100) : raw;
    return { price, original_price: raw, discount: raw > 0 && price < raw ? Math.round((1 - price / raw) * 100) : 0 };
  },
  // TableOrderModal
  modalSubtotal: (cart: CartLine[]) => cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
  modalCount: (cart: CartLine[]) => cart.reduce((s, i) => s + i.quantity, 0),
  modalService: (subtotal: number, scPercent: number) => (scPercent > 0 && subtotal > 0 ? Math.round((subtotal * scPercent) / 100) : 0),
  modalEditTotal: (items: any[]) => items.reduce((s, i) => s + Number(i.price_at_time_of_order || i.product?.price || 0) * (i.quantity || 0), 0),
  modalMapProduct: (p: any) => {
    const rawPrice = parseFloat(p.price || '0');
    const discountPercent = p.discount ? parseFloat(p.discount) : 0;
    const finalPrice = discountPercent > 0 ? rawPrice * (1 - discountPercent / 100) : rawPrice;
    return { price: finalPrice, original_price: rawPrice, discount: discountPercent };
  },
};

/** Takrorlanadigan tasodifiy sonlar (seed) — har ishga tushirishda bir xil savatlar */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const PRICES = [0, 1, 500, 999.99, 8_000, 12_500, 18_333.33, 25_000, 33_333.335, 49_900, 120_000];
const PERCENTS = [0, 5, 7.5, 10, 12, 15, 33.3];

const makeProduct = (r: () => number, n: number, extras = true): CatalogProduct => {
  const kg = extras && r() < 0.15;
  const promo = extras && !kg && r() < 0.3;
  return {
    uuid: `p${n}`,
    name: `Mahsulot ${n}`,
    description: '',
    price: PRICES[Math.floor(r() * PRICES.length)],
    original_price: 0,
    discount: 0,
    is_available: true,
    unit: kg ? 'KG' : 'PIECE',
    promotion: promo ? { label: r() < 0.5 ? '1+1' : undefined, buy_quantity: 1 + Math.floor(r() * 2), get_quantity: 1 } : null,
  };
};

const makeCart = (r: () => number, extras = true): CartLine[] =>
  Array.from({ length: 1 + Math.floor(r() * 6) }, (_, n) => {
    const product = makeProduct(r, n, extras);
    const quantity = product.unit === 'KG' ? Number((0.1 + r() * 3).toFixed(3)) : 1 + Math.floor(r() * 5);
    const withOpts = extras && r() < 0.3;
    const withPack = extras && product.unit !== 'KG' && r() < 0.2;
    return {
      product,
      quantity,
      ...(withOpts ? { options: [{ uuid: 'o1', name: 'Achchiq', group: 'g', price_delta: 1_500 }, { uuid: 'o2', name: 'Katta', group: 'g', price_delta: 3_333.33 }] } : {}),
      ...(withPack ? { packaging: { uuid: 'k1', name: 'Quti', multiplier: 6, price: 54_000 } } : {}),
    };
  });

describe('D6: umumiy hisob refaktordan oldingi formulalar bilan bir xil (oltin namuna)', () => {
  it('Kassa (CreateOrderPage): subtotal, son, yetkazish, jami — 500 ta tasodifiy savat', () => {
    const r = rng(42);
    for (let k = 0; k < 500; k++) {
      const cart = makeCart(r);
      const sub = cartSubtotal(cart);
      expect(Object.is(sub, legacy.pageSubtotal(cart))).toBe(true);
      expect(countItems(cart)).toBe(legacy.pageItemsCount(cart));
      const type = ['DELIVERY', 'PICKUP', 'DINE_IN'][k % 3];
      const fee = [null, NaN, 0, 8_000, 12_000][k % 5];
      const threshold = [null, 0, 50_000, 100_000][k % 4];
      const df = deliveryFeeFor(type === 'DELIVERY', sub, fee, threshold);
      const legacyDf = legacy.pageDeliveryFee(type, sub, fee, threshold);
      expect(df).toBe(legacyDf);
      const sc = PERCENTS[k % PERCENTS.length] * 100;
      expect(Object.is(orderTotal(sub, sc, df), legacy.pageTotal(sub, legacyDf, sc))).toBe(true);
      for (const line of cart) {
        expect(giftOf(line)).toBe(legacy.pageGift(line));
        expect(sendQtyOf(line)).toBe(Number((line.quantity + legacy.pageGift(line)).toFixed(3)));
      }
    }
  });

  it('Stol oynasi: aksiyasiz oddiy savatda eski formula bilan bir xil — 500 ta tasodifiy savat', () => {
    const r = rng(7);
    for (let k = 0; k < 500; k++) {
      const cart = makeCart(r, false); // aksiyasiz, variant/qadoq/kg yo'q
      const sub = cartSubtotal(cart);
      expect(Object.is(sub, legacy.modalSubtotal(cart))).toBe(true);
      expect(countItems(cart)).toBe(legacy.modalCount(cart));
      const pct = PERCENTS[k % PERCENTS.length];
      const s = cartSummary(cart, null, { serviceChargePercent: pct });
      expect(s.serviceCharge).toBe(legacy.modalService(sub, pct));
      expect(Object.is(orderTotal(s.subtotal, s.serviceCharge), sub + legacy.modalService(sub, pct))).toBe(true);
    }
  });

  it('Stol oynasi: ochiq buyurtma qatorlari summasi va soni', () => {
    const items = [
      { price_at_time_of_order: '12500.00', quantity: 2 },
      { product: { price: '8000' }, quantity: 3 },
      { price_at_time_of_order: null, product: null, quantity: 1 },
      { price_at_time_of_order: '999.99', quantity: undefined },
    ];
    expect(orderItemsTotal(items)).toBe(legacy.modalEditTotal(items));
    expect(orderItemsTotal(items)).toBe(49_000);
    expect(orderItemsCount(items)).toBe(6);
    expect(orderItemsTotal([])).toBe(0);
  });

  it('Katalog: kassa narxi eski formula bilan; stol oynasi (D13) endi kassa narxini oladi (`final_price`)', () => {
    const raws = [
      { price: '25000', discount: '10' },
      { price: '25000', discount: '10', final_price: '22000' },
      { price: '18000', final_price: null },
      { price: '', discount: null },
      { price: '33333.33', discount: '15' },
      { price: '12000', final_price: '12000.50' },
    ].map((p, n) => ({ uuid: `u${n}`, name: 'X', is_available: true, is_active: true, ...p }));
    for (const p of raws) {
      const pos = mapPosProduct(p);
      expect({ price: pos.price, original_price: pos.original_price, discount: pos.discount }).toStrictEqual(legacy.pageMapProduct(p));
    }
    // Eski stol formulasi `final_price` ni o'qimas edi — aksiya narxida kassadan farq qilardi (D13 tuzatgan xato)
    expect(legacy.modalMapProduct(raws[1]).price).toBe(22_500);
    expect(mapPosProduct(raws[1]).price).toBe(22_000);
  });
});

/** Server quote taqlidi (backend pricing: bepul = sovg'a, line_total = narx × son − bepul, so'mgacha) */
const fakeServerQuote = (cart: CartLine[], pct: number, selfHall: boolean) => {
  const items = cart.map((i) => {
    const unit = unitPrice(i.product, i.options, i.packaging);
    const free = giftOf(i);
    const discount = unit * free;
    return { free_quantity: free, discount_amount: discount, line_total: Math.round(unit * sendQtyOf(i) - discount) };
  });
  const subtotal = items.reduce((s, l) => s + l.line_total, 0);
  const sc = selfHall ? 0 : serviceChargeFor(subtotal, pct);
  return {
    items,
    subtotal,
    discount_amount: items.reduce((s, l) => s + l.discount_amount, 0),
    service_charge_percent: pct,
    service_charge_amount: sc,
    total_price: subtotal + sc,
  };
};

describe('D13: Stol oynasi va Kassa bir xil hisoblaydi (aksiya, 1+1 sovg\'a, xizmat haqi)', () => {
  it('1000 ta tasodifiy savat: bir xil server qatorlari, subtotal, aksiya, xizmat haqi va jami', () => {
    const r = rng(2026);
    let legacyMismatch = 0;
    for (let k = 0; k < 1000; k++) {
      const cart = makeCart(r); // aksiya, kg, variant, qadoq bilan
      const pct = PERCENTS[k % PERCENTS.length];
      const selfHall = k % 9 === 0;
      const quote = k % 5 === 0 ? null : fakeServerQuote(cart, pct, selfHall);

      // Serverga ikkala ekran bir xil qator yuboradi (to'langan + sovg'a)
      const sent = buildPosItems(cart);
      expect(sent.map((s) => s.quantity)).toEqual(cart.map(sendQtyOf));

      const kassa = cartSummary(cart, quote, { noServiceCharge: selfHall });
      const stol = cartSummary(cart, quote, { noServiceCharge: selfHall, serviceChargePercent: selfHall ? 0 : pct });
      // Kassa natijasi D6 dagi eski kassa formulasi bilan bir xil
      expect(kassa.subtotal).toBe(quote ? Number(quote.subtotal) : legacy.pageSubtotal(cart));
      expect(kassa.serviceCharge).toBe(quote && !selfHall ? quote.service_charge_amount : 0);

      expect(stol.subtotal).toBe(kassa.subtotal);
      expect(stol.discount).toBe(kassa.discount);
      if (quote) {
        // Server summasi keldi — ikkala ekran aynan bir xil, va server jamisiga teng
        expect(stol.serviceCharge).toBe(kassa.serviceCharge);
        expect(orderTotal(stol.subtotal, stol.serviceCharge)).toBe(orderTotal(kassa.subtotal, kassa.serviceCharge));
        expect(orderTotal(stol.subtotal, stol.serviceCharge)).toBe(quote.total_price);
        // Eski stol formulasi (narx × son + o'z xizmat haqi) aksiyali savatda farq qilardi
        const old = legacy.modalSubtotal(cart) + (selfHall ? 0 : legacy.modalService(legacy.modalSubtotal(cart), pct));
        if (Math.abs(old - quote.total_price) > 0.5) legacyMismatch++;
      } else {
        // Server javobi kelguncha: taxminiy, xizmat haqi server formulasi bilan
        expect(stol.serviceCharge).toBe(selfHall ? 0 : serviceChargeFor(stol.subtotal, pct));
      }
    }
    expect(legacyMismatch).toBeGreaterThan(0);
  });

  it('1+1: 30 000 lik burger 1 ta to\'lansa — serverga 2 ta, jami 30 000 + xizmat haqi (chegirmadan keyin)', () => {
    const product: CatalogProduct = {
      uuid: 'b', name: 'Burger', description: '', price: 30_000, original_price: 30_000, discount: 0, is_available: true,
      promotion: { label: '1+1', buy_quantity: 1, get_quantity: 1 },
    };
    const cart: CartLine[] = [{ product, quantity: 1 }];
    expect(buildPosItems(cart)).toEqual([{ product_uuid: 'b', quantity: 2 }]);
    const quote = fakeServerQuote(cart, 10, false);
    expect(quote.subtotal).toBe(30_000);
    const s = cartSummary(cart, quote, { serviceChargePercent: 10 });
    expect(s).toEqual({ subtotal: 30_000, discount: 30_000, serviceCharge: 3_000, serviceChargePercent: 10, fromServer: true });
    // Foiz hali noma'lum (null) — quote'dagi xizmat haqi olinadi
    expect(cartSummary(cart, quote, { serviceChargePercent: null }).serviceCharge).toBe(3_000);
  });

  it('ochiq buyurtma: server total_price asosiy, line_total (sovg\'a bepul), qo\'lda chegirma', () => {
    const items = [
      { price_at_time_of_order: '30000', quantity: 2, free_quantity: 1, line_total: 30_000 },
      { price_at_time_of_order: '8000', quantity: 3, line_total: 24_000 },
    ];
    expect(orderItemsTotal(items)).toBe(54_000);
    const s = openOrderSummary(items, { total_price: 54_400, service_charge_percent: 10, service_charge_amount: 5_400, delivery_fee: 0 }, 0);
    // 54 000 + 5 400 − 54 400 = 5 000 so'm qo'lda chegirma
    expect(s).toEqual({ subtotal: 54_000, discount: 5_000, serviceCharge: 5_400, serviceChargePercent: 10, fromServer: true, total: 54_400 });
    // Server jamisi yo'q (eski server) — taxminiy, filial foizi bilan
    expect(openOrderSummary(items, null, 10)).toEqual({ subtotal: 54_000, discount: 0, serviceCharge: 5_400, serviceChargePercent: 10, fromServer: false, total: 59_400 });
  });
});

describe('Ikkala oqim bir xil hisoblaydi (oddiy mahsulotlar)', () => {
  it('bir xil savat — bir xil subtotal, son va xizmat haqi', () => {
    const cart: CartLine[] = [
      { product: { uuid: 'a', name: 'Osh', description: '', price: 35_000, original_price: 35_000, discount: 0, is_available: true }, quantity: 2 },
      { product: { uuid: 'b', name: 'Choy', description: '', price: 4_000, original_price: 4_000, discount: 0, is_available: true }, quantity: 3 },
    ];
    expect(cartSubtotal(cart)).toBe(82_000);
    expect(legacy.pageSubtotal(cart)).toBe(legacy.modalSubtotal(cart));
    expect(countItems(cart)).toBe(5);
    // 82 000 × 12% = 9 840; 82 000 × 7.5% = 6 150; 33 333 × 10% = 3 333.3 → 3 333 (server bilan bir xil yaxlitlash)
    expect(serviceChargeFor(82_000, 12)).toBe(9_840);
    expect(serviceChargeFor(82_000, 7.5)).toBe(6_150);
    expect(serviceChargeFor(33_333, 10)).toBe(3_333);
    expect(serviceChargeFor(0, 10)).toBe(0);
    expect(serviceChargeFor(50_000, 0)).toBe(0);
    expect(orderTotal(82_000, 9_840)).toBe(91_840);
    expect(orderTotal(82_000, 0, null)).toBe(82_000);
    expect(orderTotal(82_000, 0, 8_000)).toBe(90_000);
  });

  it('variant va qadoq narxi qator summasiga qo\'shiladi', () => {
    const product: CatalogProduct = { uuid: 'l', name: 'Lavash', description: '', price: 30_000, original_price: 30_000, discount: 0, is_available: true };
    expect(linePrice({ product, quantity: 2, options: [{ uuid: 'o', name: 'Pishloq', group: 'g', price_delta: 5_000 }] })).toBe(70_000);
    expect(linePrice({ product, quantity: 2, packaging: { uuid: 'k', name: 'Quti', multiplier: 6, price: 150_000 } })).toBe(300_000);
  });
});

describe('Aksiya auto-gift (1+1 / 2+1) — egasi qarori: bir buyurtmada bir marta, savat soni = to\'langan', () => {
  const p = (promotion: CatalogProduct['promotion'], extra: Partial<CatalogProduct> = {}): CatalogProduct => ({
    uuid: 'x', name: 'Burger', description: '', price: 30_000, original_price: 30_000, discount: 0, is_available: true, promotion, ...extra,
  });
  it('1+1: 1 ta to\'lansa 1 ta sovg\'a; ko\'pida ham faqat 1 ta', () => {
    const promo = { label: '1+1', buy_quantity: 1, get_quantity: 1 };
    expect(giftOf({ product: p(promo), quantity: 1 })).toBe(1);
    expect(sendQtyOf({ product: p(promo), quantity: 1 })).toBe(2);
    expect(giftOf({ product: p(promo), quantity: 4 })).toBe(1);
    expect(sendQtyOf({ product: p(promo), quantity: 4 })).toBe(5);
  });
  it('2+1: 2 tadan kam bo\'lsa sovg\'a yo\'q, undov matni bor', () => {
    const promo = { buy_quantity: 2, get_quantity: 1 };
    expect(giftOf({ product: p(promo), quantity: 1 })).toBe(0);
    expect(dealNote({ product: p(promo), quantity: 1 })).toBe("2+1 aksiya · yana 1 ta oling — 1 ta sovg'a");
    expect(giftOf({ product: p(promo), quantity: 2 })).toBe(1);
    expect(dealNote({ product: p(promo), quantity: 2 })).toBeNull();
  });
  it('kg, qadoq va aksiyasiz mahsulotda sovg\'a yo\'q', () => {
    const promo = { buy_quantity: 1, get_quantity: 1 };
    expect(giftOf({ product: p(promo, { unit: 'KG' }), quantity: 1.5 })).toBe(0);
    expect(giftOf({ product: p(promo), quantity: 2, packaging: { uuid: 'k', name: 'Quti', multiplier: 6, price: 1 } })).toBe(0);
    expect(giftOf({ product: p(null), quantity: 3 })).toBe(0);
    expect(giftOf({ product: p({ buy_quantity: 0, get_quantity: 1 }), quantity: 3 })).toBe(0);
  });
});

describe('Katalog yordamchilari', () => {
  const cats = mapCategories(
    [
      { id: 1, uuid: 'c1', is_active: true, category_details: { name: 'Taomlar' }, products: [{ uuid: 'a', name: 'Osh', price: '35000' }, { uuid: 'b', name: 'Somsa', price: '8000' }] },
      { id: 2, uuid: 'c2', is_active: true, name: 'Ichimlik', products: [{ uuid: 'b', name: 'Somsa', price: '8000' }, { uuid: 'c', name: 'Choy', price: '4000' }] },
      { uuid: 'c3', is_active: false, products: null },
    ],
    mapPosProduct,
  );
  it('kategoriya nomi, nofaollik va id (faqat so\'ralganda)', () => {
    expect(cats.map((c) => c.name)).toEqual(['Taomlar', 'Ichimlik', "Nomi yo'q"]);
    expect(cats[2].products).toEqual([]);
    expect('id' in cats[0]).toBe(false);
    expect(mapCategories([{ id: 9, uuid: 'z', products: [] }], mapPosProduct, true)[0].id).toBe(9);
    expect(mapCategories(null, mapPosProduct)).toEqual([]);
  });
  it("'all' — takrorsiz, kategoriya — o'zi", () => {
    expect(filterProducts(cats, 'all').map((p) => p.uuid)).toEqual(['a', 'b', 'c']);
    expect(filterProducts(cats, 'c2').map((p) => p.uuid)).toEqual(['b', 'c']);
    expect(filterProducts(cats, 'yoq')).toEqual([]);
  });
});

describe("Qo'lda chegirma (A10) bilan jami", () => {
  it('foiz: chegirma taomlardan, xizmat haqi chegirmadan keyin (Q39)', () => {
    // 100 000 taom, 10% chegirma = 10 000; xizmat haqi 10% × 90 000 = 9 000; jami 99 000
    expect(manualDiscountPreview(100_000, { percent: 10 }, 10)).toEqual({ discount: 10_000, serviceCharge: 9_000, total: 99_000 });
  });
  it('summa: yaxlitlanadi, taomlar summasidan oshmaydi, yetkazishga tegilmaydi', () => {
    expect(manualDiscountPreview(54_000, { amount: 4_000.4 }, 0, 12_000)).toEqual({ discount: 4_000, serviceCharge: 0, total: 62_000 });
    expect(manualDiscountPreview(30_000, { amount: 50_000 }, 10)).toEqual({ discount: 30_000, serviceCharge: 0, total: 0 });
  });
  it("foiz so'mgacha yaxlitlanadi (server money() bilan bir xil)", () => {
    expect(manualDiscountPreview(33_333, { percent: 15 }).discount).toBe(5_000);
  });
  it('bekor (0) — chegirmasiz jami', () => {
    expect(manualDiscountPreview(80_000, { percent: 0 }, 10)).toEqual({ discount: 0, serviceCharge: 8_000, total: 88_000 });
  });
  it("server jami bilan mos: openOrderSummary chegirmani ajratib ko'rsatadi", () => {
    const items = [{ line_total: '60000', quantity: 2 }, { line_total: '40000', quantity: 1 }];
    const preview = manualDiscountPreview(100_000, { percent: 10 }, 10);
    const s = openOrderSummary(items, { total_price: preview.total, service_charge_percent: 10, service_charge_amount: preview.serviceCharge, delivery_fee: 0 }, 10);
    expect(s.subtotal).toBe(100_000);
    expect(s.discount).toBe(preview.discount);
    expect(s.subtotal - s.discount + s.serviceCharge).toBe(s.total);
  });
});
