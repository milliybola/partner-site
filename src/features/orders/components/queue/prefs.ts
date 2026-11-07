/* Navbat sozlamalari (shu qurilmada) — Buyurtmalar va Sotuv sahifalari umumiy o'qiydi */
// Legacy key (kept for compatibility): list of visible kanban statuses. Absence of
// PREPARING meant "skip the preparing stage" — we keep honoring that.
const LEGACY_VISIBILITY_KEY = 'milliygo_kanban_visible_statuses';
const PREFS_KEY = 'milliygo_queue_prefs';

export interface QueuePrefs {
  skipPreparing: boolean;
  showDoneColumn: boolean;
}

export const readPrefs = (): QueuePrefs => {
  const prefs: QueuePrefs = { skipPreparing: false, showDoneColumn: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...prefs, ...JSON.parse(raw) };
    const legacy = localStorage.getItem(LEGACY_VISIBILITY_KEY);
    if (legacy) {
      const list: string[] = JSON.parse(legacy);
      prefs.skipPreparing = Array.isArray(list) && !list.includes('PREPARING');
      prefs.showDoneColumn = !Array.isArray(list) || list.includes('COMPLETED');
    }
  } catch {
    /* ignore */
  }
  return prefs;
};

export const writePrefs = (p: QueuePrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};
