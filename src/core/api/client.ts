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
    if (token && config.headers && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Rahbar tanlagan "ishlayotgan filial": ro'yxat so'rovlariga `filial_uuid` qo'shiladi, buyurtma yaratishda body'ga yoziladi.
// Xodim uchun getWorkingFilial() doim null — hech narsa o'zgarmaydi. Aniq berilgan filial_uuid ustuvor.
const FILIAL_SCOPED_LISTS = /^(orders|orders\/partner-pos|orders\/partner-management|partner\/statistics|partner\/couriers)\/?(\?.*)?$/;
const FILIAL_SCOPED_CREATES = /^orders\/partner-pos\/create-(delivery|pickup)\/?$/;
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

let redirectingToLogin = false;

// 401 => session is gone. Clear storage and go to the login screen.
//
// BUGFIX: the app uses HashRouter (required for file:// and tauri:// origins),
// so the old `window.location.href = '/login'` navigated to a non-existent
// server path (blank page in the desktop app, 404 on static hosts). We now
// change the hash instead. Login requests themselves are excluded so a wrong
// password shows an inline error instead of reloading the page.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || '';
    const isAuthCall = /auth\/login|staff\/login/.test(url);
    // Manager-override calls pass their own Bearer token; a 401 there must not log out the cashier.
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN); } catch { /* ignore */ }
    const sentAuth: string | undefined = error?.config?.headers?.Authorization;
    const usedCustomAuth = !!sentAuth && !!stored && sentAuth !== `Bearer ${stored}`;
    if (status === 401 && !isAuthCall && !usedCustomAuth) {
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
    }
    return Promise.reject(error);
  },
);

export default apiClient;
