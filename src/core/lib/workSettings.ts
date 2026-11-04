import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { getToken } from './session';

/**
 * Hamkorning ish tartibi (backend: GET/PATCH /partner/work-settings/) — barcha qurilmalarda bir xil.
 *   fast_mode         — Tez rejim: buyurtma o'zi qabul qilinadi, navbatda bitta tugma («Berildi»)
 *   warehouse_enabled — «Ombor va texkarta» bo'limi sidebar'da ko'rinadi
 */
export interface WorkSettings {
  fast_mode: boolean;
  warehouse_enabled: boolean;
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = { fast_mode: false, warehouse_enabled: false };

let cached: WorkSettings | null = null;
let inflight: Promise<WorkSettings> | null = null;
const listeners = new Set<(s: WorkSettings) => void>();

const publish = (s: WorkSettings) => {
  cached = s;
  listeners.forEach((l) => l(s));
};

export async function loadWorkSettings(force = false): Promise<WorkSettings> {
  if (!getToken()) return DEFAULT_WORK_SETTINGS;
  if (cached && !force) return cached;
  inflight ??= apiClient
    .get('partner/work-settings/')
    .then((res) => ({ ...DEFAULT_WORK_SETTINGS, ...(res.data?.data ?? {}) }) as WorkSettings)
    .catch(() => cached ?? DEFAULT_WORK_SETTINGS)
    .then((s) => {
      publish(s);
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function saveWorkSettings(patch: Partial<WorkSettings>): Promise<WorkSettings> {
  const res = await apiClient.patch('partner/work-settings/', patch);
  const s = { ...DEFAULT_WORK_SETTINGS, ...(res.data?.data ?? {}) } as WorkSettings;
  publish(s);
  return s;
}

export function clearWorkSettingsCache() {
  cached = null;
}

// Boshqa qurilmada (masalan, rahbar telefonida) o'zgartirilsa — oynaga qaytilganda yangilanadi
let watching = false;
let lastLoad = 0;
function watch() {
  if (watching) return;
  watching = true;
  const refresh = () => {
    if (document.visibilityState !== 'visible' || !cached || Date.now() - lastLoad < 30_000) return;
    lastLoad = Date.now();
    void loadWorkSettings(true);
  };
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
}

export function useWorkSettings() {
  const [settings, setSettings] = useState<WorkSettings>(cached ?? DEFAULT_WORK_SETTINGS);
  const [loaded, setLoaded] = useState(!!cached);

  useEffect(() => {
    let alive = true;
    const listener = (s: WorkSettings) => alive && setSettings(s);
    listeners.add(listener);
    watch();
    loadWorkSettings().then((s) => {
      if (!alive) return;
      setSettings(s);
      setLoaded(true);
    });
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  const save = useCallback((patch: Partial<WorkSettings>) => saveWorkSettings(patch), []);
  return { settings, loaded, save };
}
