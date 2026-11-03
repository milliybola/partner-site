import {
  Bike, BarChart3, BookOpen, LayoutDashboard, Boxes, Building2, ChefHat, ClipboardCheck, Clock, DollarSign, Home, ListOrdered, MapPin,
  PlusCircle, ScanBarcode, ScanLine, Settings, ShoppingBag, Table, Tag, User, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { isManager, type PartnerSession } from '../core/lib/session';
import type { PartnerTariff } from '../core/lib/tariff';
import type { WorkMode } from '../core/lib/workMode';
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
console.log("gffg");


const own = (owner: boolean, items: NavItem[]) => (owner ? items : []);

const RESTAURANT = (owner: boolean): NavGroup[] => [
  {
    title: 'Zal va oshxona',
    items: [
      ...own(owner, [{ to: '/', label: 'Bosh sahifa', icon: Home, end: true }]),
      { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
      { to: '/kitchen', label: 'Oshxona ekrani', icon: ChefHat },
      { to: '/tables', label: 'Stollar', icon: Table, end: true },
      { to: '/tables/qr', label: 'Stol QR-kodlari', icon: ScanLine },
      // { to: '/new-order', label: 'Yangi buyurtma', icon: PlusCircle },
      { to: '/shift', label: 'Smena', icon: Clock },
    ],
  },
  {
    title: 'Menyu',
    items: [
      { to: '/catalog', label: 'Menyu', icon: BookOpen },
      { to: '/promotions', label: 'Setlar va aksiyalar', icon: Tag },
    ],
  },
  ...management(owner),
];

const STORE = (owner: boolean): NavGroup[] => [
  {
    title: 'Savdo',
    items: [
      ...own(owner, [{ to: '/', label: 'Bosh sahifa', icon: Home, end: true }]),
      { to: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
      { to: '/picking', label: "Yig'ish", icon: ClipboardCheck },
      { to: '/new-order', label: 'Kassa', icon: ScanBarcode },
      { to: '/shift', label: 'Smena', icon: Clock },
    ],
  },
  {
    title: 'Ombor',
    items: [
      { to: '/inventory', label: 'Ombor va qoldiq', icon: Boxes },
      { to: '/catalog', label: 'Mahsulotlar', icon: BookOpen },
      { to: '/promotions', label: 'Aksiyalar (1+1)', icon: Tag },
    ],
  },
  ...management(owner),
];

const management = (owner: boolean): NavGroup[] => [
  {
    title: 'Boshqaruv',
    items: [
      ...own(owner, [
        { to: '/overview', label: 'Boshqaruv paneli', icon: LayoutDashboard },
        { to: '/statistics', label: 'Statistika', icon: BarChart3 },
        { to: '/finance', label: 'Moliya', icon: DollarSign },
        { to: '/branches', label: 'Filiallar', icon: Building2 },
        { to: '/delivery-zones', label: 'Yetkazish hududlari', icon: MapPin },
      ]),
      { to: '/all-orders', label: 'Buyurtmalar tarixi', icon: ShoppingBag },
      { to: '/staff', label: 'Xodimlar', icon: Users },
      { to: '/couriers', label: 'Kuryerlar', icon: Bike },
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
    case '/tables/qr':
      return t.allow_dine_in && t.allow_qr_menu;
    default:
      return true;
  }
};

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
            { to: '/tables', label: 'Stollar', icon: Table, end: true },
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

export const buildNav = (p: PartnerSession | null, tariff?: PartnerTariff, mode: WorkMode = 'manage'): NavGroup[] => {
  const owner = !isManager(p);
  const kind = venueOf(p);
  const groups = mode === 'pos' ? POS(kind) : kind === 'store' ? STORE(owner) : RESTAURANT(owner);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowedByTariff(i, tariff)) }))
    .filter((g) => g.items.length > 0);
};

/** Telefondagi pastki 3 ta asosiy tab (4-chisi "Ko'proq"). Har tur uchun o'z asosiy ishi. */
export const buildTabs = (kind: VenueKind, tariff?: PartnerTariff, mode: WorkMode = 'manage'): NavItem[] =>
  mode === 'pos'
    ? POS(kind)[0].items.filter((i) => allowedByTariff(i, tariff)).slice(0, 3)
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
