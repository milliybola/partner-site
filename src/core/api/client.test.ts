import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../config/constants';

/**
 * D35 — 401 da jim token yangilash (brauzersiz, vitest + jsdom). Server o'rniga axios adapteri:
 * `api/token/refresh/` — refresh token bo'yicha javob; boshqa so'rovlar — faqat `valid` access bilan 200, aks holda 401.
 */

type Handler = (cfg: InternalAxiosRequestConfig) => { status: number; data: unknown };

const respond = (cfg: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> => {
  const res = { status, statusText: '', data, headers: {}, config: cfg } as AxiosResponse;
  if (status >= 200 && status < 300) return Promise.resolve(res);
  return Promise.reject(new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', cfg, null, res));
};

const setTokens = (access: string | null, refresh: string | null) => {
  if (access) localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access);
  else localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  if (refresh) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh);
  else localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
};

let calls: Array<{ url: string; auth?: string; body?: unknown }>;

/** Yangi modul (refreshing / redirectingToLogin holati toza) va soxta server */
async function setup(opts: { valid: string; refreshes: Record<string, { access: string; refresh: string } | 'reject'> }) {
  vi.resetModules();
  const apiClient = (await import('./client')).default;
  const handler: Handler = (cfg) => {
    if (cfg.url === 'api/token/refresh/') {
      const body = typeof cfg.data === 'string' ? JSON.parse(cfg.data) : cfg.data;
      const r = opts.refreshes[body?.refresh];
      // ROTATE+BLACKLIST: ishlatilgan refresh token qayta ishlamaydi
      if (r && r !== 'reject') delete opts.refreshes[body.refresh];
      return !r || r === 'reject' ? { status: 401, data: { code: 'token_not_valid' } } : { status: 200, data: r };
    }
    return cfg.headers?.Authorization === `Bearer ${opts.valid}` ? { status: 200, data: { ok: cfg.url } } : { status: 401, data: {} };
  };
  apiClient.defaults.adapter = async (cfg) => {
    const body = typeof cfg.data === 'string' ? JSON.parse(cfg.data) : cfg.data;
    calls.push({ url: String(cfg.url), auth: cfg.headers?.Authorization as string | undefined, body });
    await new Promise((r) => setTimeout(r, 5));
    const { status, data } = handler(cfg);
    return respond(cfg, status, data);
  };
  return apiClient;
}

const refreshCalls = () => calls.filter((c) => c.url === 'api/token/refresh/');

beforeEach(() => {
  localStorage.clear();
  calls = [];
  window.location.hash = '#/pos';
  localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify({ uuid: 'p-1', staff_uuid: 's-1', role: 'cashier' }));
});

describe('client.ts — 401 da jim token yangilash', () => {
  it("bitta 401: refresh bir marta, yangi tokenlar saqlanadi, asl so'rov bir marta qayta yuboriladi", async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'A2', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    const res = await api.get('orders/');
    expect(res.data).toEqual({ ok: 'orders/' });
    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0].auth).toBeUndefined(); // refresh so'roviga eski Bearer qo'shilmaydi
    expect(calls.filter((c) => c.url === 'orders/').map((c) => c.auth)).toEqual(['Bearer A1', 'Bearer A2']);
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('A2');
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('R2'); // ROTATE
    expect(window.location.hash).toBe('#/pos');
  });

  it('bir vaqtda bir nechta 401: hammasi bitta refreshni kutadi va qayta yuboriladi', async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'A2', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    const res = await Promise.all([api.get('orders/'), api.get('partner/tables/'), api.post('orders/partner-pos/create-pickup/', { x: 1 })]);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls()).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('R2');
    expect(window.location.hash).toBe('#/pos');
  });

  it("yangilangandan keyin kelgan kechikkan 401 (eski token bilan): refresh qayta chaqirilmaydi, yangi token bilan yuboriladi", async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'A2', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    await api.get('orders/');
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'A2');
    // Eski token bilan yuborilgan so'rov (masalan, uzoq javob) — R2 behuda ishlatilmasin
    const res = await api.get('orders/', { headers: { Authorization: 'Bearer A1' }, _autoAuth: true });
    expect(res.status).toBe(200);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('refresh yiqilsa: sessiya tozalanadi va kirish oynasiga o\'tiladi', async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'A2', refreshes: { R1: 'reject' } });
    await expect(api.get('orders/')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls()).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PARTNER_DATA)).toBeNull();
    expect(window.location.hash).toBe('#/login');
  });

  it("refresh token yo'q: serverga refresh yuborilmaydi, darhol chiqiladi", async () => {
    setTokens('A1', null);
    const api = await setup({ valid: 'A2', refreshes: {} });
    await expect(api.get('orders/')).rejects.toBeTruthy();
    expect(refreshCalls()).toHaveLength(0);
    expect(window.location.hash).toBe('#/login');
  });

  it("qayta yuborilgan so'rov ham 401 (masalan, xodim o'chirilgan): bir marta, keyin chiqish — cheksiz takror yo'q", async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'NONE', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    await expect(api.get('orders/')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls()).toHaveLength(1);
    expect(calls.filter((c) => c.url === 'orders/')).toHaveLength(2);
    expect(window.location.hash).toBe('#/login');
  });

  it("menejer PIN (o'z Bearer tokeni) 401: yangilanmaydi va kassir chiqarilmaydi", async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'A1', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    await expect(api.post('orders/partner-pos/o-1/discount/', {}, { headers: { Authorization: 'Bearer MANAGER' } })).rejects.toBeTruthy();
    expect(refreshCalls()).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('A1');
    expect(window.location.hash).toBe('#/pos');
  });

  it("login so'rovidagi 401 (noto'g'ri parol): yangilanmaydi va chiqarilmaydi", async () => {
    setTokens(null, 'R1');
    const api = await setup({ valid: 'X', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    await expect(api.post('partner/staff/auth/login/', { pin: '0000' })).rejects.toBeTruthy();
    expect(refreshCalls()).toHaveLength(0);
    expect(window.location.hash).toBe('#/pos');
  });

  it("ikki tab: boshqa tab yangilayotgan bo'lsa (qulf), bu tab kutadi va uning tokenini oladi — R1 ikki marta ishlatilmaydi", async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'A2', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    // Boshqa tab qulfni olgan va R1 ni ishlatmoqda
    localStorage.setItem('milliygo_token_refresh', JSON.stringify({ owner: 'other-tab', until: Date.now() + 10_000 }));
    setTimeout(() => {
      setTokens('A2', 'R2');
      localStorage.removeItem('milliygo_token_refresh');
    }, 250);
    const res = await api.get('orders/');
    expect(res.status).toBe(200);
    expect(refreshCalls()).toHaveLength(0); // bu tab serverga refresh yubormadi
    expect(calls.filter((c) => c.url === 'orders/').map((c) => c.auth)).toEqual(['Bearer A1', 'Bearer A2']);
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('R2');
    expect(window.location.hash).toBe('#/pos');
  });

  it("ikki tab ketma-ket: ikkinchi tab birinchisi saqlagan yangi (aylantirilgan) tokendan foydalanadi", async () => {
    setTokens('A1', 'R1');
    const refreshes: Record<string, { access: string; refresh: string } | 'reject'> = { R1: { access: 'A2', refresh: 'R2' } };
    const tab1 = await setup({ valid: 'A2', refreshes });
    await tab1.get('orders/');
    const tab2 = await setup({ valid: 'A2', refreshes }); // yangi modul — boshqa tab (TAB_ID, xotira holati alohida)
    const res = await tab2.get('orders/', { headers: { Authorization: 'Bearer A1' }, _autoAuth: true }); // eski token xotirasida
    expect(res.status).toBe(200);
    expect(refreshCalls()).toHaveLength(1);
    expect(window.location.hash).toBe('#/pos');
  });

  it("yangilash paytida sessiya almashsa (PIN bilan boshqa xodim): yangi sessiya tokenlari ustiga yozilmaydi", async () => {
    setTokens('A1', 'R1');
    const api = await setup({ valid: 'B1', refreshes: { R1: { access: 'A2', refresh: 'R2' } } });
    const p = api.get('orders/');
    await new Promise((r) => setTimeout(r, 7)); // birinchi 401 qaytdi, refresh yo'lda
    setTokens('B1', 'RB1');
    const res = await p;
    expect(res.status).toBe(200);
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('B1');
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('RB1');
  });
});
