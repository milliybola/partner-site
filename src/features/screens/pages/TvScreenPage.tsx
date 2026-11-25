import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { screensApi, type TvPayload } from '../screensApi';
import { MenuBoard } from '../components/MenuBoard';
import { MediaPlayer } from '../components/MediaPlayer';

/**
 * Zaldagi TV: menyu sahifama-sahifa aylanadi. Login yo'q — ulash kodi bilan (Sozlamalar → TV ekranlar).
 * Daqiqasiga bir marta yangilanadi (narx, rasm, stop-list); internet uzilsa oxirgi menyu ko'rsatilaveradi.
 * O'lchamlar `vw`/`vh` da — har qanday TV ga (720p…4K) bir xil sig'adi.
 */
const CODE_KEY = 'milliygo_tv_code';
const CACHE_KEY = 'milliygo_tv_cache';
const REFRESH_MS = 60_000;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap';

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

  // Taxta shrifti (internet bo'lmasa — Inter)
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    document.head.appendChild(l);
  }, []);

  // Ishlab chiqishda dizaynni tekshirish: #/tv?demo=<public/ dagi json>
  const demo = import.meta.env.DEV ? params.get('demo') : null;
  const [demoData, setDemoData] = useState<TvPayload | null>(null);
  useEffect(() => {
    if (!demo) return;
    fetch(`/${demo}`).then((r) => r.json()).then(setDemoData).catch(() => undefined);
  }, [demo]);

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

  if (demo) return demoData ? demoData.kind === 'MEDIA' ? <MediaPlayer data={demoData} offline={false} /> : <MenuBoard data={demoData} offline={false} /> : null;
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
      {data.kind === 'MEDIA' ? <MediaPlayer data={data} offline={offline} /> : <MenuBoard data={data} offline={offline} />}
    </div>
  );
};

export default TvScreenPage;
