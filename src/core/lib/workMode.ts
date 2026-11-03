import { useEffect, useState } from 'react';
import { getPartner, isCashier, isShop, PARTNER_UPDATED_EVENT } from './session';
import type { PartnerSession } from './session';

/**
 * Ish rejimi: `pos` — kassa (stollar, buyurtma, to'lov, smena), `manage` — boshqaruv paneli.
 * Kassir doim kassada; ega va menejer almashtiradi (tanlov shu qurilmada eslab qolinadi —
 * kassadagi kompyuter kassa rejimida ochilaveradi).
 */
export type WorkMode = 'pos' | 'manage';

const KEY = 'milliygo:work_mode';
const EVENT = 'milliygo:work-mode';

export const getWorkMode = (p: PartnerSession | null = getPartner()): WorkMode => {
  if (isCashier(p)) return 'pos';
  try {
    return localStorage.getItem(KEY) === 'pos' ? 'pos' : 'manage';
  } catch {
    return 'manage';
  }
};

export const setWorkMode = (mode: WorkMode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
};

/** Kassa rejimining bosh sahifasi: restoranda — stollar (tarifda zal bo'lsa), aks holda — kassa */
export const posHome = (p: PartnerSession | null = getPartner(), dineIn = true) =>
  !isShop(p) && dineIn ? '/tables' : '/new-order';

export function useWorkMode(): WorkMode {
  const [mode, setMode] = useState<WorkMode>(() => getWorkMode());
  useEffect(() => {
    const sync = () => setMode(getWorkMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener(PARTNER_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener(PARTNER_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return mode;
}
