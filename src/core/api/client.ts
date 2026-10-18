import axios from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../config/constants';

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
