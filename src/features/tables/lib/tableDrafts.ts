import { getPartner } from '../../../core/lib/session';

/**
 * Stol savati qoralamasi: kassir buyurtmani yubormasdan boshqa stol bilan ishlashi uchun.
 * Faqat shu brauzerda (localStorage) saqlanadi — serverga hech narsa yuborilmaydi.
 */
export interface TableDraft {
  /** options — tanlangan variant uuid'lari (masalan, pitsa o'lchami), packaging — qadoq uuid'i */
  items: { product_uuid: string; quantity: number; options?: string[]; packaging?: string | null }[];
  contact_name: string;
  contact_phone: string;
  comment: string;
  /** Stol kartasida ko'rsatish uchun: jami miqdor va mahsulotlar summasi (saqlash paytidagi) */
  count: number;
  subtotal: number;
  saved_at: number;
}

const TTL_MS = 12 * 60 * 60 * 1000;
const key = () => `milliygo_table_drafts_v1:${getPartner()?.uuid ?? 'anon'}`;

const read = (): Record<string, TableDraft> => {
  try {
    const raw = localStorage.getItem(key());
    const all = raw ? (JSON.parse(raw) as Record<string, TableDraft>) : {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, d]) => d && now - d.saved_at < TTL_MS && d.items?.length));
  } catch {
    return {};
  }
};

const write = (all: Record<string, TableDraft>) => {
  try {
    localStorage.setItem(key(), JSON.stringify(all));
  } catch {
    /* brauzer saqlashni bloklasa — qoralama shunchaki saqlanmaydi */
  }
};

export const getDrafts = (): Record<string, TableDraft> => read();
export const getDraft = (tableUuid: string): TableDraft | null => read()[tableUuid] ?? null;

export const saveDraft = (tableUuid: string, draft: Omit<TableDraft, 'saved_at'>) => {
  write({ ...read(), [tableUuid]: { ...draft, saved_at: Date.now() } });
};

/**
 * O'z-o'ziga xizmat zali: bir nechta savat saqlab turiladi (mijoz o'ylab turibdi — kassir keyingisiga o'tadi).
 * Kalit: `hall:<zal uuid>:<id>`. Yangi savat — yangi id; saqlanganini ochish — o'sha kalit.
 */
export const heldCartKey = (hallUuid: string, id: string | number = Date.now()) => `hall:${hallUuid}:${id}`;
export const heldCarts = (all: Record<string, TableDraft>, hallUuid: string) =>
  Object.entries(all)
    .filter(([k]) => k.startsWith(`hall:${hallUuid}:`))
    .map(([key, draft]) => ({ key, draft }))
    .sort((a, b) => a.draft.saved_at - b.draft.saved_at);

export const clearDraft = (tableUuid: string) => {
  const all = read();
  if (!(tableUuid in all)) return;
  delete all[tableUuid];
  write(all);
};
