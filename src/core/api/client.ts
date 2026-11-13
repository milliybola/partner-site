import axios from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../config/constants';
import { getWorkingFilial } from '../lib/workingFilial';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT unless the caller already set an Authorization header (manager PIN flows do).
apiClient.interceptors.request.use(
  (config) => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    } catch {
      /* storage blocked */
    }
    if (token && config.headers && !config.headers.Authorization && !config._skipAuth) {
      config.headers.Authorization = `Bearer ${token}`;
      config._autoAuth = true;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Rahbar tanlagan "ishlayotgan filial": ro'yxat so'rovlariga `filial_uuid` qo'shiladi, buyurtma yaratishda body'ga yoziladi.
// Xodim uchun getWorkingFilial() doim null — hech narsa o'zgarmaydi. Aniq berilgan filial_uuid ustuvor.
const FILIAL_SCOPED_LISTS = /^(orders|orders\/partner-pos|orders\/partner-management|partner\/statistics|partner\/couriers|partner\/tables|partner\/tables\/available|partner\/halls)\/?(\?.*)?$/;
const FILIAL_SCOPED_CREATES = /^(orders\/partner-pos\/create-(delivery|pickup)|partner\/tables|partner\/halls)\/?$/;
apiClient.interceptors.request.use((config) => {
  const filial = getWorkingFilial();
  if (!filial) return config;
  const url = String(config.url || '').replace(/^\//, '');
  const method = String(config.method || 'get').toLowerCase();
  if (method === 'get' && FILIAL_SCOPED_LISTS.test(url)) {
    config.params = { ...(config.params || {}) };
    if (!config.params.filial_uuid) config.params.filial_uuid = filial;
  } else if (method === 'post' && FILIAL_SCOPED_CREATES.test(url) && config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
    if (!config.data.filial_uuid) config.data = { ...config.data, filial_uuid: filial };
  }
  return config;
});


declare module 'axios' {
  interface AxiosRequestConfig {
    /** Bearer tokenni so'rov interceptori qo'ydi (joriy sessiya); yo'q bo'lsa — chaqiruvchining o'z tokeni (menejer PIN) */
    _autoAuth?: boolean;
    /** Token yangilangandan keyin qayta yuborilgan so'rov: yana 401 bo'lsa — chiqish (cheksiz takror yo'q) */
    _authRetry?: boolean;
    /** Token yangilash so'rovining o'zi: Bearer qo'shilmaydi, 401 da yangilash boshlanmaydi */
    _skipAuth?: boolean;
  }
}

const REFRESH_URL = 'api/token/refresh/';
const REFRESH_LOCK = 'milliygo_token_refresh';
const REFRESH_LOCK_TTL_MS = 15_000;
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const readLS = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

let redirectingToLogin = false;

/** Sessiya tugadi: saqlangan sessiya tozalanadi va kirish oynasiga o'tiladi (HashRouter: hash almashtiriladi). */
const endSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.PARTNER_DATA);
    localStorage.removeItem(STORAGE_KEYS.WORKING_FILIAL);
  } catch {
    /* ignore */
  }
  if (!redirectingToLogin && !window.location.hash.startsWith('#/login')) {
    redirectingToLogin = true;
    window.location.hash = '#/login';
    // Full reload drops in-memory state (sockets, caches) from the old session.
    setTimeout(() => window.location.reload(), 50);
  }
};

/** localStorage qulfi (Web Locks bo'lmasa): boshqa tab ushlab tursa — false; tab yopilib qolsa TTL dan keyin bo'shaydi */
const takeStorageLock = (): boolean => {
  try {
    const raw = localStorage.getItem(REFRESH_LOCK);
    const cur = raw ? (JSON.parse(raw) as { owner?: string; until?: number }) : null;
    if (cur && cur.owner !== TAB_ID && (cur.until ?? 0) > Date.now()) return false;
    localStorage.setItem(REFRESH_LOCK, JSON.stringify({ owner: TAB_ID, until: Date.now() + REFRESH_LOCK_TTL_MS }));
    return (JSON.parse(localStorage.getItem(REFRESH_LOCK) || 'null') as { owner?: string } | null)?.owner === TAB_ID;
  } catch {
    return true; // localStorage yo'q — tablar orasida ulashiladigan token ham yo'q
  }
};

const releaseStorageLock = () => {
  try {
    const raw = localStorage.getItem(REFRESH_LOCK);
    if (raw && (JSON.parse(raw) as { owner?: string }).owner === TAB_ID) localStorage.removeItem(REFRESH_LOCK);
  } catch {
    /* ignore */
  }
};

/** Tablar orasida navbat bilan (kutadi, o'tkazib yubormaydi): ROTATE+BLACKLIST da bitta refresh token ikki marta ishlatilmasin */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) return locks.request(REFRESH_LOCK, fn);
  const deadline = Date.now() + REFRESH_LOCK_TTL_MS;
  while (!takeStorageLock() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    return await fn();
  } finally {
    releaseStorageLock();
  }
}

/**
 * Access tokenni jim yangilaydi. `failedAccess` — 401 olgan so'rov yuborgan token.
 * Qulf ichida: boshqa tab (yoki shu tabdagi oldingi yangilash) allaqachon yangilagan bo'lsa — o'sha token olinadi,
 * serverga so'rov yuborilmaydi. Shu orada sessiya almashgan bo'lsa (PIN bilan boshqa xodim) — uning tokeni ustiga yozilmaydi.
 * Natija: yangi access yoki null (yangilab bo'lmadi — chiqish kerak).
 */
const refreshAccess = (failedAccess: string | null): Promise<string | null> =>
  withRefreshLock(async () => {
    const access = readLS(STORAGE_KEYS.ACCESS_TOKEN);
    if (access && access !== failedAccess) return access;
    const refresh = readLS(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refresh) return null;
    try {
      const res = await apiClient.post(REFRESH_URL, { refresh }, { _skipAuth: true });
      const next: string | undefined = res.data?.access;
      if (!next) return null;
      if (readLS(STORAGE_KEYS.REFRESH_TOKEN) !== refresh) return readLS(STORAGE_KEYS.ACCESS_TOKEN); // sessiya almashgan
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, next);
      if (res.data?.refresh) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, res.data.refresh); // ROTATE: eskisi qora ro'yxatda
      return next;
    } catch {
      return null;
    }
  });

/** Shu tabda bir vaqtda kelgan 401 lar bitta yangilashni kutadi */
let refreshing: Promise<string | null> | null = null;
const sharedRefresh = (failedAccess: string | null): Promise<string | null> => {
  if (!refreshing) {
    refreshing = refreshAccess(failedAccess).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
};

// 401: access token muddati o'tgan bo'lsa — jim yangilanadi va so'rov bir marta qayta yuboriladi (401 view'dan oldin,
// autentifikatsiyada qaytadi — serverda hech narsa bajarilmagan). Yangilab bo'lmasa yoki qayta yuborilgan so'rov ham
// 401 — sessiya tugadi: tozalanadi va kirish oynasiga o'tiladi. Login so'rovlari bunga kirmaydi (noto'g'ri parol joyida
// ko'rinadi). Oflayn navbat (offline.ts) o'zgarmaydi: yangilash muvaffaqiyatli bo'lsa so'rov shu yerda qayta yuboriladi.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config;
    const url: string = config?.url || '';
    const isAuthCall = /auth\/login|staff\/login/.test(url);
    if (status !== 401 || !config || isAuthCall || config._skipAuth) return Promise.reject(error);
    // Manager-override calls pass their own Bearer token; a 401 there must not log out the cashier.
    if (config.headers?.Authorization && !config._autoAuth) return Promise.reject(error);
    if (!config._authRetry) {
      const sentAuth: string | undefined = config.headers?.Authorization;
      const failedAccess = sentAuth?.startsWith('Bearer ') ? sentAuth.slice(7) : null;
      const next = await sharedRefresh(failedAccess);
      if (next) {
        config._authRetry = true;
        config.headers.Authorization = `Bearer ${next}`;
        return apiClient.request(config);
      }
    }
    endSession();
    return Promise.reject(error);
  },
);

export default apiClient;
