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
    title: 'Kundalik ish',
    items: [
      ...own(owner, [{ to: '/', label: 'Bosh sahifa', icon: Home, end: true }]),
      { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
      { to: '/tables', label: 'Stollar', icon: Table, end: true },
      { to: '/kitchen', label: 'Oshxona ekrani', icon: ChefHat },
      { to: '/shift', label: 'Smena', icon: Clock },
      { to: '/all-orders', label: 'Buyurtmalar tarixi', icon: ShoppingBag },
    ],
  },
  {
    title: 'Menyu',
    items: [
      { to: '/catalog', label: 'Menyu', icon: BookOpen },
      { to: '/promotions', label: 'Setlar va aksiyalar', icon: Tag },
      { to: '/warehouse', label: 'Ombor va texkarta', icon: Boxes },
    ],
  },
  ...management(owner),
];

const STORE = (owner: boolean): NavGroup[] => [
  {
    title: 'Kundalik ish',
    items: [
      ...own(owner, [{ to: '/', label: 'Bosh sahifa', icon: Home, end: true }]),
      { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
      { to: '/picking', label: "Yig'ish", icon: ClipboardCheck },
      { to: '/new-order', label: 'Kassa', icon: ScanBarcode },
      { to: '/shift', label: 'Smena', icon: Clock },
      { to: '/all-orders', label: 'Buyurtmalar tarixi', icon: ShoppingBag },
    ],
  },
  {
    title: 'Ombor',
    items: [
      { to: '/catalog', label: 'Mahsulotlar', icon: BookOpen },
      { to: '/inventory', label: 'Ombor va qoldiq', icon: Boxes },
      { to: '/promotions', label: 'Aksiyalar (1+1)', icon: Tag },
    ],
  },
  ...management(owner),
];

const management = (owner: boolean): NavGroup[] => [
  {
    title: 'Yetkazib berish',
    items: [
      { to: '/couriers', label: 'Kuryerlar', icon: Bike },
      ...own(owner, [{ to: '/delivery-zones', label: 'Yetkazish hududlari', icon: MapPin }]),
    ],
  },
  {
    title: 'Biznes',
    items: [
      ...own(owner, [
        { to: '/reports', label: 'Hisobotlar', icon: BarChart3 },
        { to: '/overview', label: 'Filiallar solishtirmasi', icon: LayoutDashboard },
        { to: '/branches', label: 'Filiallar', icon: Building2 },
      ]),
      { to: '/staff', label: 'Xodimlar', icon: Users },
    ],
  },
  {
    title: 'Hisob',
    items: [
      { to: '/profile', label: 'Profil', icon: User },
      ...own(owner, [{ to: '/plan', label: 'Tarif', icon: Wallet }]),
      { to: '/settings', label: 'Sozlamalar', icon: Settings },
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

/** Restoran kassasi: «Sotuv» (stollar) bo'lsa — «Yangi buyurtma» takror, olib tashlanadi. */
const dropRedundantNewOrder = (items: NavItem[]): NavItem[] =>
  items.some((i) => i.to === '/tables') ? items.filter((i) => i.to !== '/new-order') : items;

/** Kassa rejimi: faqat kassir ishi — sotuv, stollar, navbat, smena. Boshqaruv bo'limlari yo'q. */
const POS = (kind: VenueKind): NavGroup[] => [
  {
    title: 'Kassa',
    items:
      kind === 'store'
        ? [
            { to: '/new-order', label: 'Kassa', icon: ScanBarcode },
            { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
            { to: '/picking', label: "Yig'ish", icon: ClipboardCheck },
          ]
        : [
            // «Sotuv» — zal, olib ketish va yetkazib berish shu yerdan ochiladi; shuning uchun zal bor tarifda
            // alohida «Yangi buyurtma» kerak emas (zalsiz tarifda u yagona kirish — qoladi, qarang posItems)
            { to: '/tables', label: 'Sotuv', icon: Table, end: true },
            { to: '/new-order', label: 'Yangi buyurtma', icon: PlusCircle },
            { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
            { to: '/kitchen', label: 'Oshxona ekrani', icon: ChefHat },
          ],
  },
  {
    title: 'Smena',
    items: [
      { to: '/shift', label: 'Smena', icon: Clock },
      { to: '/all-orders', label: 'Cheklar tarixi', icon: ShoppingBag },
      { to: '/settings', label: 'Sozlamalar', icon: Settings },
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
): NavGroup[] => {
  const owner = !isManager(p);
  const kind = venueOf(p);
  const groups = mode === 'pos' ? POS(kind) : kind === 'store' ? STORE(owner) : RESTAURANT(owner);
  return groups
    .map((g) => {
      const allowed = g.items.filter(
        (i) =>
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
export const buildTabs = (kind: VenueKind, tariff?: PartnerTariff, mode: WorkMode = 'manage'): NavItem[] =>
  mode === 'pos'
    ? dropRedundantNewOrder(POS(kind)[0].items.filter((i) => allowedByTariff(i, tariff))).slice(0, 3)
    : kind === 'store'
    ? [
        { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
        { to: '/picking', label: "Yig'ish", icon: ClipboardCheck },
        { to: '/inventory', label: 'Ombor', icon: Boxes },
      ]
    : [
        { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
        { to: '/kitchen', label: 'Oshxona', icon: ChefHat },
        { to: '/tables', label: 'Stollar', icon: Table, end: true },
      ].filter((i) => allowedByTariff(i, tariff));
