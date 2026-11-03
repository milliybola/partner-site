import type { Order, OrderItem } from './services/ordersApi';

/**
 * Oshxona chekida nima chop etilgani (buyurtma → mahsulot qatori → miqdor). Shu qurilmada saqlanadi:
 * ilova qayta ochilsa ham, oflayn navbatdan yuborilgan buyurtma ham takror chiqmaydi.
 */
const KEY = 'milliygo_kitchen_printed';

export type Printed = Record<string, Record<string, number>>;

export const itemLabel = (it: OrderItem) => it.product_name || it.name || it.product?.name || 'Taom';
export const lineKey = (it: OrderItem) =>
  `${it.product?.uuid || it.product_uuid || itemLabel(it)}|${(it.options || []).map((o) => o.name).join(',')}`;

export const loadPrinted = (): Printed | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Printed) : null;
  } catch {
    return null;
  }
};

export const savePrinted = (p: Printed) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};

export const quantities = (o: Pick<Order, 'items'>) => {
  const q: Record<string, number> = {};
  for (const it of o.items || []) q[lineKey(it)] = (q[lineKey(it)] || 0) + Number(it.quantity || 0);
  return q;
};

/** Oflayn paytda oshxona cheki allaqachon chiqqan buyurtma serverga yetib borgach — chop etilgan deb belgilanadi */
export const markKitchenPrinted = (order: Pick<Order, 'uuid' | 'items'>) => {
  const p = loadPrinted();
  if (p === null || !order?.uuid) return; // agent hali ishlamagan — u birinchi ishga tushishda mavjudlarni chiqarmaydi
  savePrinted({ ...p, [order.uuid]: quantities(order) });
};
