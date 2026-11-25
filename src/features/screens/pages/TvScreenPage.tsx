import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { formatMoney } from '../../../core/lib/format';
import { screensApi, type TvCategory, type TvPayload, type TvProduct } from '../screensApi';

/**
 * Zaldagi TV: menyu sahifama-sahifa aylanadi. Login yo'q — ulash kodi bilan (Sozlamalar → TV ekranlar).
 * Daqiqasiga bir marta yangilanadi (narx, rasm, stop-list); internet uzilsa oxirgi menyu ko'rsatilaveradi.
 * O'lchamlar `vw`/`vh` da — har qanday TV ga (720p…4K) bir xil sig'adi.
 */
const CODE_KEY = 'milliygo_tv_code';
const CACHE_KEY = 'milliygo_tv_cache';
const REFRESH_MS = 60_000;
const PER_PAGE_IMG = 8; // 4×2
const PER_PAGE_LIST = 16; // 2 ustun × 8

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* xotira yopiq — keshsiz ishlaydi */
    }
  },
};

const readCache = (code: string): TvPayload | null => {
  try {
    const c = JSON.parse(ls.get(CACHE_KEY) || 'null');
    return c && c.code === code ? (c.data as TvPayload) : null;
  } catch {
    return null;
  }
};

interface TvPage {
  category: TvCategory;
  products: TvProduct[];
  part: number;
  parts: number;
}

const paginate = (menu: TvCategory[], perPage: number): TvPage[] =>
  menu.flatMap((category) => {
    const parts = Math.max(1, Math.ceil(category.products.length / perPage));
    return Array.from({ length: parts }, (_, i) => ({
      category,
      products: category.products.slice(i * perPage, (i + 1) * perPage),
      part: i + 1,
      parts,
    }));
  });

const priceText = (p: TvProduct) =>
  p.variant_prices.length > 1 ? `${p.variant_prices.map((v) => formatMoney(v, false)).join(' / ')} so'm` : formatMoney(p.final_price);

const THEMES = {
  dark: { bg: '#0f0f12', card: '#1b1b21', ink: '#ffffff', muted: 'rgba(255,255,255,.55)', accent: '#f5b301', line: 'rgba(255,255,255,.08)' },
  light: { bg: '#f6f3ee', card: '#ffffff', ink: '#17171a', muted: 'rgba(23,23,26,.55)', accent: '#d48a00', line: 'rgba(0,0,0,.07)' },
} as const;

/** Soat — har daqiqada */
const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return <>{now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false })}</>;
};

/** Ekran o'chib qolmasin (brauzer qo'llasa) */
const useWakeLock = () => {
  useEffect(() => {
    type WakeLockSentinelLike = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    let lock: WakeLockSentinelLike | null = null;
    const take = () => {
      if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => undefined);
    };
  }, []);
};

const PairScreen: React.FC<{ error?: string; onCode: (c: string) => void }> = ({ error, onCode }) => {
  const [value, setValue] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = value.replace(/\s+/g, '').toUpperCase();
    if (c.length >= 4) onCode(c);
  };
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0f0f12] text-white">
      <form onSubmit={submit} className="w-[min(90vw,640px)] text-center">
        <div className="text-[clamp(28px,3vw,56px)] font-black">TV menyu</div>
        <p className="mt-3 text-[clamp(16px,1.4vw,26px)] text-white/60">
          Kassada: Sozlamalar → TV ekranlar → ekran kodini kiriting
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={8}
          placeholder="ABC123"
          className="mt-8 w-full rounded-2xl border-2 border-white/15 bg-white/5 px-6 py-5 text-center font-mono text-[clamp(32px,4vw,72px)] font-black uppercase tracking-[0.3em] text-white outline-none placeholder:text-white/20 focus:border-[#f5b301]"
        />
        {error && <div className="mt-4 text-[clamp(16px,1.3vw,24px)] font-bold text-red-400">{error}</div>}
        <button type="submit" className="mt-6 w-full rounded-2xl bg-[#f5b301] py-5 text-[clamp(20px,1.8vw,34px)] font-black text-black">
          Ulash
        </button>
      </form>
    </div>
  );
};

const ProductTile: React.FC<{ p: TvProduct; theme: (typeof THEMES)[keyof typeof THEMES] }> = ({ p, theme }) => (
  <div className="flex min-h-0 flex-col overflow-hidden rounded-[1.4vw]" style={{ background: theme.card }}>
    <div className="relative min-h-0 flex-1 bg-black/20">
      {p.image ? (
        <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[5vw]" style={{ color: theme.muted }}>
          🍽
        </div>
      )}
    </div>
    <div className="px-[1.1vw] py-[0.9vw]">
      <div className="truncate text-[1.55vw] font-extrabold leading-tight" style={{ color: theme.ink }}>
        {p.name}
      </div>
      <div className="mt-[0.3vw] flex items-baseline gap-[0.7vw]">
        <span className="whitespace-nowrap text-[1.7vw] font-black tabular-nums" style={{ color: theme.accent }}>
          {priceText(p)}
        </span>
        {p.final_price < p.price && p.variant_prices.length < 2 && (
          <span className="whitespace-nowrap text-[1.1vw] tabular-nums line-through" style={{ color: theme.muted }}>
            {formatMoney(p.price, false)}
          </span>
        )}
      </div>
    </div>
  </div>
);

const ProductRow: React.FC<{ p: TvProduct; theme: (typeof THEMES)[keyof typeof THEMES] }> = ({ p, theme }) => (
  <div className="flex items-baseline gap-[1vw] py-[0.8vh]" style={{ borderBottom: `1px solid ${theme.line}` }}>
    <span className="min-w-0 flex-1 truncate text-[1.9vw] font-bold" style={{ color: theme.ink }}>
      {p.name}
    </span>
    <span className="whitespace-nowrap text-[1.9vw] font-black tabular-nums" style={{ color: theme.accent }}>
      {priceText(p)}
    </span>
  </div>
);

const MenuBoard: React.FC<{ data: TvPayload; offline: boolean }> = ({ data, offline }) => {
  const theme = THEMES[data.theme] ?? THEMES.dark;
  const pages = useMemo(() => paginate(data.menu, data.show_images ? PER_PAGE_IMG : PER_PAGE_LIST), [data.menu, data.show_images]);
  const [index, setIndex] = useState(0);
  const interval = Math.max(5, data.interval || 10) * 1000;
  const safeIndex = pages.length ? index % pages.length : 0;
  const page = pages[safeIndex];

  useEffect(() => {
    if (pages.length < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % pages.length), interval);
    return () => clearTimeout(t);
  }, [safeIndex, pages.length, interval]);

  // Keyingi sahifa rasmlari oldindan yuklanadi — almashganda bo'sh joy ko'rinmaydi
  useEffect(() => {
    const next = pages[(safeIndex + 1) % Math.max(1, pages.length)];
    next?.products.forEach((p) => {
      if (p.image) new Image().src = p.image;
    });
  }, [safeIndex, pages]);

  return (
    <div className="fixed inset-0 flex cursor-none select-none flex-col overflow-hidden" style={{ background: theme.bg, color: theme.ink }}>
      <header className="flex h-[11vh] shrink-0 items-center gap-[1.5vw] px-[3vw]">
        {data.partner.logo && <img src={data.partner.logo} alt="" className="h-[7vh] w-[7vh] rounded-[1vh] object-cover" />}
        <div className="min-w-0 flex-1 truncate text-[1.7vw] font-extrabold" style={{ color: theme.muted }}>
          {data.partner.name}
        </div>
        <div className="flex items-center gap-[1vw] text-[1.9vw] font-black tabular-nums">
          {offline && <span className="h-[1vw] w-[1vw] rounded-full bg-red-500" title="Internet yo'q" />}
          <Clock />
        </div>
      </header>

      {!page ? (
        <div className="flex flex-1 items-center justify-center text-[2.4vw] font-bold" style={{ color: theme.muted }}>
          Menyu bo'sh
        </div>
      ) : (
        <main key={safeIndex} className="flex min-h-0 flex-1 flex-col px-[3vw] pb-[2vh] animate-[tvfade_.6s_ease]">
          <div className="mb-[2.2vh] flex items-baseline gap-[1.2vw]">
            <h1 className="text-[3.6vw] font-black leading-none">{page.category.name}</h1>
            {page.parts > 1 && (
              <span className="text-[1.6vw] font-bold tabular-nums" style={{ color: theme.muted }}>
                {page.part}/{page.parts}
              </span>
            )}
          </div>
          {data.show_images ? (
            <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-[1.4vw]">
              {page.products.map((p) => (
                <ProductTile key={p.uuid} p={p} theme={theme} />
              ))}
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-[4vw]">
              {page.products.map((p) => (
                <ProductRow key={p.uuid} p={p} theme={theme} />
              ))}
            </div>
          )}
        </main>
      )}

      {pages.length > 1 && (
        <footer className="h-[0.8vh] shrink-0" style={{ background: theme.line }}>
          <div
            key={`bar-${safeIndex}`}
            className="h-full origin-left"
            style={{ background: theme.accent, animation: `tvbar ${interval}ms linear forwards` }}
          />
        </footer>
      )}
      <style>{`@keyframes tvfade{from{opacity:0;transform:translateY(1.2vh)}to{opacity:1;transform:none}}@keyframes tvbar{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
    </div>
  );
};

const TvScreenPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState<string | null>(() => {
    const fromUrl = params.get('code')?.trim().toUpperCase();
    if (fromUrl) ls.set(CODE_KEY, fromUrl);
    return fromUrl || ls.get(CODE_KEY);
  });
  const [data, setData] = useState<TvPayload | null>(() => (code ? readCache(code) : null));
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  useWakeLock();

  // Kod URL dan olingach manzildan olib tashlanadi (TV sahifani yangilasa ham saqlangan kod ishlaydi)
  useEffect(() => {
    if (params.get('code')) setParams({}, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async () => {
    const c = codeRef.current;
    if (!c) return;
    try {
      const d = await screensApi.publicScreen(c);
      if (codeRef.current !== c) return;
      setData(d);
      setOffline(false);
      ls.set(CACHE_KEY, JSON.stringify({ code: c, data: d }));
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Ekran o'chirildi yoki kod yangilandi — qayta ulash
        ls.set(CODE_KEY, null);
        ls.set(CACHE_KEY, null);
        setCode(null);
        setData(null);
        setError("Kod topilmadi yoki o‘chirilgan. Kassadagi kodni tekshiring.");
        return;
      }
      setOffline(true); // tarmoq xatosi — oxirgi menyu ko'rsatilaveradi
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [code, load]);

  if (!code)
    return (
      <PairScreen
        error={error}
        onCode={(c) => {
          ls.set(CODE_KEY, c);
          setError(undefined);
          setCode(c);
        }}
      />
    );
  if (!data)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0f0f12] text-[2vw] font-bold text-white/60">
        {offline ? "Internet yo'q — ulanish kutilmoqda…" : 'Menyu yuklanmoqda…'}
      </div>
    );
  return (
    <div onDoubleClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
      <MenuBoard data={data} offline={offline} />
    </div>
  );
};

export default TvScreenPage;
