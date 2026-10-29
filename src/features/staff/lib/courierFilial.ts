import type { CourierModel } from '../services/couriersApi';
import type { PartnerFilial } from '../../orders/services/filialApi';

/** Havzaga birlashtirilgan filiallar uchun umumiy kalit (bo'sh — havza yo'q). */
export const POOL_KEY = 'havza-1';

/** Kuryer shu filial buyurtmasiga xizmat qila oladimi (server qoidasining nusxasi — haqiqiy tekshiruv serverda). */
export const courierServesFilial = (
  courier: Pick<CourierModel, 'filial_uuid' | 'filial_pool'>,
  orderFilialUuid: string | null | undefined,
  filials: PartnerFilial[],
): boolean => {
  if (!orderFilialUuid || !courier.filial_uuid) return true; // filialsiz buyurtma yoki butun hamkor kuryeri
  if (courier.filial_uuid === orderFilialUuid) return true;
  const orderPool = (filials.find((f) => f.uuid === orderFilialUuid)?.courier_pool || '').trim();
  return !!orderPool && orderPool === (courier.filial_pool || '').trim();
};
