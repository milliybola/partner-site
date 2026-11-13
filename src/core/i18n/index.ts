import { ru, uz } from './dict';
import type { I18nKey } from './dict';

/**
 * Juda kichik til moduli (kutubxonasiz). Til QURILMA bo'yicha saqlanadi (kassadagi kompyuter
 * bir tilda ochilaveradi), standart — o'zbekcha. Til almashtirilganda sahifa qayta yuklanadi:
 * shuning uchun t() oddiy funksiya, modul darajasidagi jadvallarda ham ishlaydi.
 * Chiqishda (clearSession) til o'chirilmaydi.
 */
export type Lang = 'uz' | 'ru';
export type { I18nKey };

export const LANG_KEY = 'milliygo:lang';

const readLang = (): Lang => {
  try {
    return localStorage.getItem(LANG_KEY) === 'ru' ? 'ru' : 'uz';
  } catch {
    return 'uz';
  }
};

let current: Lang = readLang();

export const getLang = (): Lang => current;

/** Tilni saqlaydi va sahifani qayta yuklaydi (reload: false — faqat testlar uchun). */
export const setLang = (lang: Lang, opts: { reload?: boolean } = {}) => {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  current = lang;
  if (opts.reload !== false) window.location.reload();
};

/** t('cart.totalCount', { n: 3 }) → "Jami · 3 ta". Ruschada kalit bo'lmasa — o'zbekcha. */
export const t = (key: I18nKey, vars?: Record<string, string | number>): string => {
  const text = (current === 'ru' ? ru[key] : undefined) ?? uz[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
};
