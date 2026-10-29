import { STORAGE_KEYS } from '../config/constants';
import { isOwner } from './session';

/**
 * Hamkor egasi (rahbar) tanlagan "ishlayotgan filial". Yo'q (null) — barcha filiallar jami.
 * Xodim (menejer) uchun har doim null: u o'z filialiga qulflangan. Bu fayl faqat saqlash qatlami
 * (API klient ham shuni o'qiydi); React hooklar `useWorkingFilial.ts` da.
 */
export const WORKING_FILIAL_EVENT = 'milliygo:working-filial';

export const getWorkingFilial = (): string | null => {
  if (!isOwner()) return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.WORKING_FILIAL) || null;
  } catch {
    return null;
  }
};

export const setWorkingFilial = (uuid: string | null) => {
  try {
    if (uuid) localStorage.setItem(STORAGE_KEYS.WORKING_FILIAL, uuid);
    else localStorage.removeItem(STORAGE_KEYS.WORKING_FILIAL);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(WORKING_FILIAL_EVENT));
};
