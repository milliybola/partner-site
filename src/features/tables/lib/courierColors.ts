import type { Order } from '../../orders/services/ordersApi';

export const normPhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-9);

/** Buyurtmaning kuryer kaliti (telefon bo'yicha) — kuryer kartasi bilan bog'lash uchun */
export const orderCourierKey = (o: Pick<Order, 'courier_phone' | 'courier'>) => normPhone(o.courier_phone || o.courier?.phone);

const PALETTE = ['#2563eb', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#65a30d', '#c026d3', '#dc2626'];

/** Har bir kuryerga barqaror rang: shu rang buyurtma kartasida ham, kuryer kartasida ham ko'rinadi */
export const courierColor = (key: string) => {
  if (!key) return '#94a3b8';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
