import { useSyncExternalStore } from 'react';

/**
 * Kassa ekranining fon rasmi (YesPOS uslubida — butun ekran bo'ylab).
 * Zal xaritasi ochiq zalning fonini shu yerga qo'yadi, Layout esa uni butun kassa ekraniga yoyadi.
 * Xarita yopilsa (boshqa sahifa, ro'yxat ko'rinishi) — null, oddiy fon qaytadi.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setPosWallpaper(url: string | null) {
  if (current === url) return;
  current = url;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePosWallpaper = () => useSyncExternalStore(subscribe, () => current, () => null);
