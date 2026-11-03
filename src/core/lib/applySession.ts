import { STORAGE_KEYS } from '../config/constants';
import { clearSession, setPartner } from './session';
import type { PartnerSession } from './session';
import { clearTariffCache } from './tariff';
import { unlockPos } from './posLock';

/** Login (telefon + parol) va kassa qulfini PIN bilan ochish javobi — backendda bir xil shakl */
export interface SessionResponse {
  user_type?: string;
  dashboard?: string;
  tokens?: { access?: string; refresh?: string };
  profile?: Record<string, unknown> & {
    uuid?: string;
    partner_uuid?: string;
    filial_uuid?: string;
    filial_name?: string;
    current_filial?: PartnerSession['current_filial'];
  };
}

/**
 * Yangi sessiyani saqlaydi: eski sessiya tozalanadi, tokenlar va normallashgan profil yoziladi.
 * Ega — role 'superadmin'; xodim — 'cashier' yoki 'manager' (uuid = hamkor uuid, staff_uuid = xodim).
 */
export function applySession(data: SessionResponse): PartnerSession {
  const { user_type, dashboard, tokens, profile } = data;
  if (!tokens?.access) throw new Error("Server javobida token yo'q. Qaytadan urinib ko'ring.");

  clearSession();
  clearTariffCache(); // boshqa hamkor kirgan bo'lishi mumkin — tarif qayta yuklanadi
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access);
  if (tokens.refresh) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh);

  const partnerData: PartnerSession =
    user_type === 'partner'
      ? { ...profile, role: 'superadmin', user_type: 'partner' }
      : {
          ...profile,
          role: dashboard === 'cashier' ? 'cashier' : 'manager',
          user_type: 'staff',
          staff_uuid: profile?.uuid,
          uuid: profile?.partner_uuid,
          current_filial: profile?.filial_uuid ? { uuid: profile.filial_uuid, filial_name: profile.filial_name } : profile?.current_filial,
        };
  // `is_open` backend yuborganicha qoladi (yo'q bo'lsa — noma'lum)
  setPartner(partnerData);
  unlockPos(); // yangi kirish (parol yoki PIN) — qulf eski sessiyadan qolib ketmasin
  return partnerData;
}
