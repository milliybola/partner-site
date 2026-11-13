import { useEffect, useState } from 'react';
import apiClient from '../api/client';

/**
 * Platforma bosqichi (backend: GET /platform/config/ → { stage, features: { pos, couriers } }).
 *   1 — Hamkor va mijoz (agregator: ilova buyurtmalari, menyu, aksiya, statistika, Tez rejim)
 *   2 — + POS tizimi (kassa, smena, kassir, zal/stol/ofitsiant, stol QR, telefon buyurtma, ombor, mijoz cheki)
 *   3 — + MilliyGo kuryerlari
 *   4 — Hammasi
 * Bosqich — platforma qarori: yopiq bo'lim reklamasiz yashiriladi (tarifdan farqli, «tarifni oshiring» yo'q).
 * Himoya backendda (403 STAGE_LOCKED); bu yerda faqat ko'rinish.
 */
export const STAGE = { PARTNER: 1, POS: 2, COURIERS: 3, ALL: 4 } as const;

export interface PlatformConfig {
  stage: number;
  features: { pos: boolean; couriers: boolean };
}

const KEY = 'milliygo:platform_config';

/** Hech qachon yuklanmagan va xato bo'lsa — eng xavfsiz standart: 1-bosqich (POS yo'q) */
export const SAFE_DEFAULT: PlatformConfig = { stage: STAGE.PARTNER, features: { pos: false, couriers: false } };

export const normalizeConfig = (raw: unknown): PlatformConfig | null => {
  const d = raw as { stage?: unknown; features?: { pos?: unknown; couriers?: unknown } } | null;
  const stage = Number(d?.stage);
  if (!Number.isInteger(stage) || stage < 1 || stage > 4) return null;
  return {
    stage,
    features: {
      pos: typeof d?.features?.pos === 'boolean' ? d.features.pos : stage >= STAGE.POS,
      couriers: typeof d?.features?.couriers === 'boolean' ? d.features.couriers : stage >= STAGE.COURIERS,
    },
  };
};

const readStored = (): PlatformConfig | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const store = (c: PlatformConfig) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
};

/** Oxirgi ma'lum qiymat (oldingi ochilishdan) — sahifa ochilganda bo'limlar «sakramasin» */
let cached: PlatformConfig | null = readStored();
/** Shu ochilishda serverdan javob keldimi (yoki oxirgi ma'lum qiymat bormi) */
let known = cached !== null;
let inflight: Promise<PlatformConfig> | null = null;
let lastLoad = 0;
const listeners = new Set<(c: PlatformConfig) => void>();

const publish = (c: PlatformConfig) => {
  const changed = !cached || cached.stage !== c.stage || cached.features.pos !== c.features.pos || cached.features.couriers !== c.features.couriers;
  cached = c;
  known = true;
  if (changed) listeners.forEach((l) => l(c));
};

/** Sinxron o'qish (hook bo'lmagan joylar uchun): oxirgi ma'lum qiymat, bo'lmasa 1-bosqich */
export const getPlatformConfig = (): PlatformConfig => cached ?? SAFE_DEFAULT;
export const getPlatformStage = (): number => getPlatformConfig().stage;
export const stageAtLeast = (required: number, c: PlatformConfig = getPlatformConfig()) => c.stage >= required;
/** Kassa (POS) imkoniyatlari ochiqmi — 2-bosqich */
export const posEnabled = (c: PlatformConfig = getPlatformConfig()) => c.stage >= STAGE.POS;

export async function loadPlatformConfig(force = false): Promise<PlatformConfig> {
  if (inflight) return inflight;
  if (!force && known && lastLoad && Date.now() - lastLoad < 15_000) return getPlatformConfig();
  lastLoad = Date.now();
  inflight = apiClient
    .get('platform/config/')
    .then((res) => {
      const c = normalizeConfig(res.data?.data ?? res.data);
      if (!c) return getPlatformConfig();
      store(c);
      publish(c);
      return c;
    })
    // Xato: oxirgi ma'lum qiymat qoladi (yo'q bo'lsa — 1-bosqich)
    .catch(() => {
      known = true;
      listeners.forEach((l) => l(getPlatformConfig()));
      return getPlatformConfig();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Testlar uchun */
export function __setPlatformConfigForTest(c: PlatformConfig | null) {
  cached = c;
  known = c !== null;
  lastLoad = 0;
}

// Superadmin bosqichni o'zgartirsa — oynaga qaytilganda va har 5 daqiqada yangilanadi
const REFRESH_MS = 5 * 60 * 1000;
let watching = false;
function watch() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  const refresh = () => {
    if (document.visibilityState === 'visible') void loadPlatformConfig();
  };
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  setInterval(() => void loadPlatformConfig(true), REFRESH_MS);
}

/**
 * Platforma bosqichi — bir joyda, keshlangan. `loaded` — ishonchli qiymat bormi (serverdan yoki oxirgi ma'lum);
 * hech narsa ma'lum bo'lmasa birinchi javobgacha false (yopiq ekran «sakrab» chiqmasin).
 */
export function usePlatformConfig() {
  const [config, setConfig] = useState<PlatformConfig>(getPlatformConfig);
  const [loaded, setLoaded] = useState(known);
  useEffect(() => {
    let alive = true;
    const listener = (c: PlatformConfig) => {
      if (!alive) return;
      setConfig(c);
      setLoaded(true);
    };
    listeners.add(listener);
    watch();
    loadPlatformConfig().then(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);
  return { config, stage: config.stage, pos: config.stage >= STAGE.POS, couriers: config.features.couriers, loaded };
}
