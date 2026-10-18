import { STORAGE_KEYS } from '../config/constants';

/**
 * Normalized view over the partner/staff profile stored at login.
 * Superadmin (partner owner) => role 'superadmin'
 * Manager (staff)            => role 'manager', uuid = partner uuid, staff_uuid = staff uuid
 */
export type PartnerRole = 'superadmin' | 'manager';
export type PartnerType = 'RESTAURANT' | 'SHOP' | string;

export interface PartnerSession {
  uuid?: string;
  staff_uuid?: string;
  name?: string;
  partner_name?: string;
  logo?: string | null;
  role?: PartnerRole;
  partner_type?: PartnerType;
  is_open?: boolean;
  phone?: string;
  current_filial?: { uuid: string; filial_name?: string } | null;
  home_filial?: { uuid: string; filial_name?: string } | null;
  current_filial_uuid?: string;
  home_filial_uuid?: string;
  [key: string]: any;
}

export const PARTNER_UPDATED_EVENT = 'milliygo:partner-updated';

export const getPartner = (): PartnerSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    return raw ? (JSON.parse(raw) as PartnerSession) : null;
  } catch {
    return null;
  }
};

export const setPartner = (data: PartnerSession) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(PARTNER_UPDATED_EVENT));
};

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch {
    return null;
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.PARTNER_DATA);
  } catch {
    /* ignore */
  }
};

export const isManager = (p: PartnerSession | null = getPartner()) => p?.role === 'manager';
export const isShop = (p: PartnerSession | null = getPartner()) =>
  String(p?.partner_type || '').toUpperCase() === 'SHOP';

export const getFilialUuid = (p: PartnerSession | null = getPartner()): string | undefined =>
  p?.current_filial?.uuid || p?.home_filial?.uuid || p?.current_filial_uuid || p?.home_filial_uuid || undefined;

export const getDisplayName = (p: PartnerSession | null = getPartner()) =>
  (p?.role === 'manager' ? p?.partner_name : p?.name) || p?.name || 'MilliyGo';

/** Wording that differs for restaurants vs shops. */
export const wording = (p: PartnerSession | null = getPartner()) => {
  const shop = isShop(p);
  return {
    venue: shop ? "Do'kon" : 'Restoran',
    menu: shop ? 'Mahsulotlar' : 'Menyu',
    product: shop ? 'Mahsulot' : 'Taom',
    products: shop ? 'Mahsulotlar' : 'Taomlar',
    preparing: shop ? "Yig'ilmoqda" : 'Tayyorlanmoqda',
    kitchen: shop ? 'Ombor' : 'Oshxona',
  };
};
