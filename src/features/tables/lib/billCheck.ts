import type { TableBill } from '../services/tablesApi';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Kassir to'lov tugmasini bosgan paytda ko'rib turgan hisob */
export interface SeenBill {
  /** Ko'rilgan barcha to'lanadigan buyurtmalar uuid'lari */
  billable: string[];
  /** To'lanishi tanlangan buyurtmalar va kassir ko'rgan summasi */
  picked: Array<{ uuid: string; total: number | string }>;
  /** Butun stol to'lanmoqda (hammasi tanlangan) */
  wholeTable: boolean;
}

/**
 * D14: serverdagi joriy hisob kassir ko'rganidan farq qiladimi. Farq: tanlangan buyurtma endi to'lab bo'lmaydi
 * (boshqa kassir to'lagan) yoki summasi o'zgargan (taom qo'shilgan); butun stol to'lanayotganda — stolga yangi
 * to'lanadigan buyurtma qo'shilgan. `skip` — to'lovi oflayn navbatdagi buyurtmalar (hisobga olinmaydi).
 */
export const billChangedSince = (seen: SeenBill, fresh: TableBill, skip: (uuid: string) => boolean = () => false): boolean => {
  const now = new Map(fresh.orders.filter((o) => o.billable && !skip(o.uuid)).map((o) => [o.uuid, num(o.total_price)]));
  if (seen.picked.some((p) => now.get(p.uuid) !== num(p.total))) return true;
  if (!seen.wholeTable) return false;
  const known = new Set(seen.billable);
  return [...now.keys()].some((uuid) => !known.has(uuid));
};

/** To'lovdan keyin stolda qolgan, kassir ko'rmagan to'lanadigan buyurtmalar soni */
export const unseenBillable = (seen: SeenBill, fresh: TableBill, skip: (uuid: string) => boolean = () => false): number => {
  const known = new Set(seen.billable);
  return fresh.orders.filter((o) => o.billable && !skip(o.uuid) && !known.has(o.uuid)).length;
};

export const seenTotal = (seen: SeenBill) => seen.picked.reduce((s, p) => s + num(p.total), 0);
