import { useEffect, useState } from 'react';
import { PARTNER_UPDATED_EVENT, getPartner, isShop } from '../core/lib/session';
import type { PartnerSession } from '../core/lib/session';

/**
 * Hamkor turi bo'yicha ikki xil boshqaruv tizimi:
 *  - restaurant: zal, stollar, oshxona ekrani, menyu/setlar
 *  - store: ombor, yig'ish (picking), kassa, mahsulotlar
 * Umumiy qism (buyurtmalar navbati, xodimlar, moliya, filiallar) ikkalasida bir xil sahifalar.
 */
export type VenueKind = 'restaurant' | 'store';

export const venueOf = (p: PartnerSession | null = getPartner()): VenueKind => (isShop(p) ? 'store' : 'restaurant');

export const VENUE_LABEL: Record<VenueKind, string> = { restaurant: 'Restoran', store: "Do'kon" };

export function useVenue() {
  const [partner, setPartner] = useState<PartnerSession | null>(() => getPartner());
  useEffect(() => {
    const sync = () => setPartner(getPartner());
    window.addEventListener(PARTNER_UPDATED_EVENT, sync);
    return () => window.removeEventListener(PARTNER_UPDATED_EVENT, sync);
  }, []);
  const kind = venueOf(partner);
  return { partner, kind, isStore: kind === 'store', isRestaurant: kind === 'restaurant' };
}
