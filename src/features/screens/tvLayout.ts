import type { TvCategory, TvProduct } from './screensApi';

/**
 * TV menyu taxtasi (bento): ekran 2 qatorga bo'lingan, har qator 6 «birlik».
 * Kategoriya paneli o'z taomlari soniga qarab joy oladi (2 qator plitka → 1 birlik = 2 ta taom).
 * Qatorda bo'sh joy qolsa — «Tavsiya» paneli (katta rasm, aksiya) to'ldiradi.
 * Menyu sig'masa — bir nechta taxta, navbat bilan almashadi.
 */
export const ROWS = 2;

export interface CategoryPanel {
  kind: 'category';
  key: string;
  title: string;
  products: TvProduct[];
  units: number;
  /** 1–2 ta taom: keng qator ko'rinishi (rasm chapda, matn o'ngda) */
  wide: boolean;
}

export interface FeaturePanel {
  kind: 'feature';
  key: string;
  product: TvProduct;
  category: string;
  units: number;
}

export type Panel = CategoryPanel | FeaturePanel;
export type Board = Panel[][]; // qatorlar → panellar

interface Segment {
  key: string;
  title: string;
  products: TvProduct[];
  units: number;
}

const segmentsOf = (menu: TvCategory[], withImages: boolean): Segment[] => {
  // Rasmli: panelda ko'pi bilan 12 taom (6 birlik × 2). Ro'yxat: 1 birlik = 1 ustun × 7 qator, ko'pi bilan 3 ustun.
  const perPanel = withImages ? 12 : 21;
  return menu.flatMap((c) => {
    // Teng bo'linadi: 14 ta → 7 + 7 (12 + 2 emas)
    const parts = Math.ceil(c.products.length / perPanel);
    const size = Math.ceil(c.products.length / Math.max(1, parts));
    return Array.from({ length: parts }, (_, i) => {
      const products = c.products.slice(i * size, (i + 1) * size);
      const n = products.length;
      const units = withImages ? (n <= 2 ? 2 : Math.ceil(n / 2)) : Math.ceil(n / 7);
      return { key: `${c.uuid}-${i}`, title: parts > 1 ? `${c.name} · ${i + 1}` : c.name, products, units };
    });
  });
};

/** Kategoriyalarni taxtalarga joylash: tartib saqlanadi, qatordagi bo'sh joyga keyingi 4 ta paneldan sig'adigani olinadi */
export const buildBoards = (menu: TvCategory[], withImages: boolean): Board[] => {
  const rowUnits = withImages ? 6 : 3;
  const queue = segmentsOf(menu, withImages);
  const boards: Board[] = [];
  // Tavsiya uchun nomzodlar: avval aksiyadagilar, keyin rasmli taomlar (har taxtada boshqasi)
  const featurePool = withImages
    ? [...menu.flatMap((c) => c.products.filter((p) => p.image && p.badge).map((p) => ({ p, c: c.name }))),
       ...menu.flatMap((c) => c.products.filter((p) => p.image && !p.badge).map((p) => ({ p, c: c.name })))]
    : [];
  let featureIdx = 0;

  while (queue.length) {
    const rows: Panel[][] = [];
    for (let r = 0; r < ROWS && queue.length; r++) {
      const row: Panel[] = [];
      let used = 0;
      for (;;) {
        const i = queue.slice(0, 4).findIndex((s) => used + Math.min(s.units, rowUnits) <= rowUnits);
        if (i < 0) break;
        const [s] = queue.splice(i, 1);
        const units = Math.min(s.units, rowUnits);
        row.push({ kind: 'category', key: s.key, title: s.title, products: s.products, units, wide: withImages && s.products.length <= 2 });
        used += units;
      }
      const left = rowUnits - used;
      if (left >= 2 && featurePool.length) {
        const f = featurePool[featureIdx++ % featurePool.length];
        row.push({ kind: 'feature', key: `f-${boards.length}-${r}`, product: f.p, category: f.c, units: left });
      }
      rows.push(row);
    }
    boards.push(rows);
  }
  return boards;
};

// --- Ranglar (eski TV brauzerlarida color-mix yo'q — JS da hisoblanadi) ---
const rgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex) ?? ['', '1f7a4d'];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const mix = (hex: string, other: string, t: number): string => {
  const a = rgb(hex);
  const b = rgb(other);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
};

export const alpha = (hex: string, a: number): string => `rgba(${rgb(hex).join(',')},${a})`;

/** Matn rangi (oq yoki qora) — fon yorqinligiga qarab */
export const onColor = (hex: string): string => {
  const [r, g, b] = rgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? '#16181d' : '#ffffff';
};
