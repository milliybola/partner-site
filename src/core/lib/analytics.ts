/**
 * Yandex Metrica (Webvisor, bosish xaritasi, voronka). Hisoblagich raqami VITE_YM_ID da;
 * bo'sh bo'lsa yoki ilova fayldan (desktop: file://, tauri://) ochilgan bo'lsa hech narsa qilmaydi.
 */
const YM_ID = Number(import.meta.env.VITE_YM_ID) || 0;

type YmFn = (id: number, method: string, ...args: unknown[]) => void;

const enabled = () => !!YM_ID && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol);

const ym = (): YmFn | null => {
  if (!enabled()) return null;
  const fn = (window as unknown as { ym?: YmFn }).ym;
  return typeof fn === 'function' ? fn : null;
};

let started = false;

export const initAnalytics = () => {
  if (!enabled() || started) return;
  started = true;
  /* eslint-disable */
  (function (m: any, e: Document, t: string, r: string, i: string) {
    m[i] = m[i] || function (...args: unknown[]) { (m[i].a = m[i].a || []).push(args); };
    m[i].l = Date.now();
    const k = e.createElement(t) as HTMLScriptElement;
    const a = e.getElementsByTagName(t)[0];
    k.async = true;
    k.src = r;
    a.parentNode!.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
  /* eslint-enable */
  // defer: birinchi ko'rishni ham o'zimiz yuboramiz (HashRouter: URL'ning # qismi sahifa hisoblanadi)
  ym()?.(YM_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true, defer: true });
};

/** Sahifa ko'rish: hash marshrut (#/orders) bilan */
export const trackPageView = (path: string) => ym()?.(YM_ID, 'hit', `${window.location.pathname}#${path}`);

/** Maqsad (goal): masalan order_created, shift_opened */
export const trackGoal = (name: string, params?: Record<string, unknown>) => ym()?.(YM_ID, 'reachGoal', name, params);

/** Kim ishlayotganini sessiyalarda ajratish: xodim/egasi id, rol, muassasa, filial */
export const identifyUser = (id: string | undefined, params: Record<string, unknown>) => {
  const f = ym();
  if (!f) return;
  if (id) f(YM_ID, 'setUserID', id);
  f(YM_ID, 'userParams', params);
};
