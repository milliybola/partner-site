import { useEffect, useState } from 'react';

/**
 * Kassa qulfi (faqat kassa rejimida): qulflanganda ekranni PIN oynasi yopadi; xodim o'z PIN'i bilan ochadi
 * va kassa o'sha xodim nomidan davom etadi. Holat shu qurilmada saqlanadi — sahifa yangilansa ham qulf turadi.
 */
const LOCK_KEY = 'milliygo_pos_locked';
const AUTO_KEY = 'milliygo_pos_autolock_min';
const EVENT = 'milliygo:pos-lock';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
};

export const isPosLocked = () => read(LOCK_KEY) === '1';
export const lockPos = () => write(LOCK_KEY, '1');
export const unlockPos = () => write(LOCK_KEY, null);

/** Harakatsizlikdan keyin avtomatik qulf (daqiqa); 0 — o'chiq. Standart: 5 daqiqa */
export const getAutoLockMinutes = () => {
  const v = read(AUTO_KEY);
  return v === null ? 5 : Math.max(0, parseInt(v, 10) || 0);
};
export const setAutoLockMinutes = (m: number) => write(AUTO_KEY, String(Math.max(0, m)));

export function usePosLocked(): boolean {
  const [locked, setLocked] = useState(isPosLocked);
  useEffect(() => {
    const sync = () => setLocked(isPosLocked());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return locked;
}

/** Kassa rejimida harakatsizlik (sichqoncha, klaviatura, sensor) N daqiqa davom etsa — qulflaydi */
export function useAutoLock(enabled: boolean) {
  useEffect(() => {
    const minutes = getAutoLockMinutes();
    if (!enabled || minutes <= 0) return;
    let timer = setTimeout(lockPos, minutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lockPos, minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled]);
}
