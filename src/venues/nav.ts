import {
  Bike, BarChart3, BookOpen, LayoutDashboard, Boxes, Building2, ChefHat, ClipboardCheck, Clock, Home, ListOrdered, MapPin,
  PlusCircle, ScanBarcode, Settings, ShoppingBag, Table, Tag, User, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { isManager, type PartnerSession } from '../core/lib/session';
import type { PartnerTariff } from '../core/lib/tariff';
import type { WorkMode } from '../core/lib/workMode';
import type { WorkSettings } from '../core/lib/workSettings';
import { venueOf, type VenueKind } from './index';
import { t } from '../core/i18n';
import { STAGE } from '../core/lib/platformStage';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}


const own = (owner: boolean, items: NavItem[]) => (owner ? items : []);

/*
 * Boshqaruv rejimi sidebar'i — ish tartibida (eng ko'p ishlatiladigani tepada):
 *   1. Kundalik ish   — bosh sahifa, buyurtmalar, zal/oshxona yoki yig'ish/kassa, smena
 *   2. Menyu / Ombor  — nima sotiladi
 *   3. Yetkazib berish — kuryerlar, hududlar
 *   4. Biznes         — hisobotlar, filiallar, xodimlar
 *   5. Hisob          — profil, tarif, sozlamalar
 */
const RESTAURANT = (owner: boolean): NavGroup[] => [
  {
    title: t('nav.daily'),
    items: [
      ...own(owner, [{ to: '/', label: t('nav.home'), icon: Home, end: true }]),
      { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
      { to: '/tables', label: t('nav.tables'), icon: Table, end: true },
      { to: '/kitchen', label: t('nav.kitchenScreen'), icon: ChefHat },
      { to: '/shift', label: t('nav.shift'), icon: Clock },
      { to: '/all-orders', label: t('nav.history'), icon: ShoppingBag },
    ],
  },
  {
    title: t('nav.menu'),
    items: [
      { to: '/catalog', label: t('nav.menu'), icon: BookOpen },
      { to: '/promotions', label: t('nav.promos'), icon: Tag },
      { to: '/warehouse', label: t('nav.warehouse'), icon: Boxes },
    ],
  },
  ...management(owner),
];

const STORE = (owner: boolean): NavGroup[] => [
  {
    title: t('nav.daily'),
    items: [
      ...own(owner, [{ to: '/', label: t('nav.home'), icon: Home, end: true }]),
      { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
      { to: '/picking', label: t('nav.picking'), icon: ClipboardCheck },
      { to: '/new-order', label: t('nav.pos'), icon: ScanBarcode },
      { to: '/shift', label: t('nav.shift'), icon: Clock },
      { to: '/all-orders', label: t('nav.history'), icon: ShoppingBag },
    ],
  },
  {
    title: t('nav.stock'),
    items: [
      { to: '/catalog', label: t('nav.goods'), icon: BookOpen },
      { to: '/inventory', label: t('nav.inventory'), icon: Boxes },
      { to: '/promotions', label: t('nav.promosShop'), icon: Tag },
    ],
  },
  ...management(owner),
];

const management = (owner: boolean): NavGroup[] => [
  {
    title: t('nav.delivery'),
    items: [
      { to: '/couriers', label: t('nav.couriers'), icon: Bike },
      ...own(owner, [{ to: '/delivery-zones', label: t('nav.zones'), icon: MapPin }]),
    ],
  },
  {
    title: t('nav.business'),
    items: [
      ...own(owner, [
        { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
        { to: '/overview', label: t('nav.overview'), icon: LayoutDashboard },
        { to: '/branches', label: t('nav.branches'), icon: Building2 },
      ]),
      { to: '/staff', label: t('nav.staff'), icon: Users },
    ],
  },
  {
    title: t('nav.account'),
    items: [
      { to: '/profile', label: t('nav.profile'), icon: User },
      ...own(owner, [{ to: '/plan', label: t('nav.plan'), icon: Wallet }]),
      { to: '/settings', label: t('nav.settings'), icon: Settings },
    ],
  },
];

/** Sahifa tarifga kiradimi. Kirmaganlari sidebarda ko'rsatilmaydi (masalan, standart tarifda Plus bo'limlari). */
const allowedByTariff = (item: NavItem, t?: PartnerTariff): boolean => {
  if (!t) return true;
  switch (item.to) {
    case '/tables':
      return t.allow_dine_in;
    default:
      return true;
  }
};

/**
 * Platforma bosqichi: bo'lim qaysi bosqichdan ochiladi (docs/bosqichlar/matritsa.md). Ro'yxatda yo'q — 1-bosqich.
 * Yopiq bo'lim reklamasiz yashiriladi; to'g'ridan havola — App.tsx StageGate «keyingi bosqichda» ekrani.
 */
export const ROUTE_STAGE: Record<string, number> = {
  '/new-order': STAGE.POS, // kassadan buyurtma (zal/olib ketish/telefon) — Q53
  '/shift': STAGE.POS,
  '/tables': STAGE.POS, // zal, stol, ofitsiant — Q50
  '/tables/qr': STAGE.POS,
  '/warehouse': STAGE.POS, // ombor/texkarta — Q55
  '/inventory': STAGE.POS,
};

export const allowedByStage = (to: string, stage: number) => stage >= (ROUTE_STAGE[to] ?? STAGE.PARTNER);

export interface NavOptions {
  /** Platforma bosqichi (usePlatformConfig). Berilmasa — 1 (eng xavfsiz) */
  stage?: number;
  /** Bosqich pasaytirilgan, lekin ochiq smena qolgan (Q56): «Smena» bo'limi uni yopish uchun ko'rinadi */
  openShift?: boolean;
}

const visibleByStage = (to: string, o: NavOptions) =>
  allowedByStage(to, o.stage ?? STAGE.PARTNER) || (to === '/shift' && !!o.openShift);

/** Restoran kassasi: «Sotuv» (stollar) bo'lsa — «Yangi buyurtma» takror, olib tashlanadi. */
const dropRedundantNewOrder = (items: NavItem[]): NavItem[] =>
  items.some((i) => i.to === '/tables') ? items.filter((i) => i.to !== '/new-order') : items;

/** Kassa rejimi: faqat kassir ishi — sotuv, stollar, navbat, smena. Boshqaruv bo'limlari yo'q. */
const POS = (kind: VenueKind): NavGroup[] => [
  {
    title: t('nav.pos'),
    items:
      kind === 'store'
        ? [
            { to: '/new-order', label: t('nav.pos'), icon: ScanBarcode },
            { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
            { to: '/picking', label: t('nav.picking'), icon: ClipboardCheck },
          ]
        : [
            // «Sotuv» — zal, olib ketish va yetkazib berish shu yerdan ochiladi; shuning uchun zal bor tarifda
            // alohida «Yangi buyurtma» kerak emas (zalsiz tarifda u yagona kirish — qoladi, qarang posItems)
            { to: '/tables', label: t('nav.sales'), icon: Table, end: true },
            { to: '/new-order', label: t('nav.newOrder'), icon: PlusCircle },
            { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
            { to: '/kitchen', label: t('nav.kitchenScreen'), icon: ChefHat },
          ],
  },
  {
    title: t('nav.shift'),
    items: [
      { to: '/shift', label: t('nav.shift'), icon: Clock },
      { to: '/all-orders', label: t('nav.receipts'), icon: ShoppingBag },
      { to: '/settings', label: t('nav.settings'), icon: Settings },
    ],
  },
];

/**
 * `filialCount` — egasining filiallari soni: «Boshqaruv paneli» (filiallar solishtirmasi) faqat 2+ filialda ma'noli.
 * Noma'lum bo'lsa (undefined) — ko'rsatiladi.
 */
export const buildNav = (
  p: PartnerSession | null,
  tariff?: PartnerTariff,
  mode: WorkMode = 'manage',
  filialCount?: number,
  work?: WorkSettings,
  opts: NavOptions = {},
): NavGroup[] => {
  const owner = !isManager(p);
  const kind = venueOf(p);
  // 1-bosqichda kassa rejimi yo'q
  if ((opts.stage ?? STAGE.PARTNER) < STAGE.POS) mode = 'manage';
  const groups = mode === 'pos' ? POS(kind) : kind === 'store' ? STORE(owner) : RESTAURANT(owner);
  return groups
    .map((g) => {
      const allowed = g.items.filter(
        (i) =>
          visibleByStage(i.to, opts) &&
          allowedByTariff(i, tariff) &&
          !(i.to === '/overview' && filialCount !== undefined && filialCount < 2) &&
          // Tarifda faqat 1 ta filial bo'lsa, solishtirma ma'nosiz
          !(i.to === '/overview' && tariff?.restricted && tariff.max_filials === 1) &&
          // Ombor kichik kafega og'irlik — Sozlamalarda yoqilgandagina ko'rinadi
          !(i.to === '/warehouse' && !work?.warehouse_enabled),
      );
      return { ...g, items: mode === 'pos' ? dropRedundantNewOrder(allowed) : allowed };
    })
    .filter((g) => g.items.length > 0);
};

/** Telefondagi pastki 3 ta asosiy tab (4-chisi "Ko'proq"). Har tur uchun o'z asosiy ishi. */
export const buildTabs = (kind: VenueKind, tariff?: PartnerTariff, mode: WorkMode = 'manage', stage: number = STAGE.PARTNER): NavItem[] =>
  stage < STAGE.POS
    ? // 1-bosqich: ilova buyurtmalari, oshxona/yig'ish va menyu
      kind === 'store'
      ? [
          { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
          { to: '/picking', label: t('nav.picking'), icon: ClipboardCheck },
          { to: '/catalog', label: t('nav.goods'), icon: BookOpen },
        ]
      : [
          { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
          { to: '/kitchen', label: t('nav.kitchen'), icon: ChefHat },
          { to: '/catalog', label: t('nav.menu'), icon: BookOpen },
        ]
    : mode === 'pos'
    ? dropRedundantNewOrder(POS(kind)[0].items.filter((i) => allowedByTariff(i, tariff))).slice(0, 3)
    : kind === 'store'
    ? [
        { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
        { to: '/picking', label: t('nav.picking'), icon: ClipboardCheck },
        { to: '/inventory', label: t('nav.stock'), icon: Boxes },
      ]
    : [
        { to: '/orders', label: t('nav.orders'), icon: ListOrdered },
        { to: '/kitchen', label: t('nav.kitchen'), icon: ChefHat },
        { to: '/tables', label: t('nav.tables'), icon: Table, end: true },
      ].filter((i) => allowedByTariff(i, tariff));
