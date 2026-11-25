import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenMedia, TvPayload } from '../screensApi';
import { MenuBoard } from './MenuBoard';
import './menuBoard.css';

/**
 * Video ekran: pleylist ketma-ket aylanadi — video oxirigacha, rasm va menyu taxtasi `duration` soniya.
 * Fayllar TV ning o'zida saqlanadi (Cache Storage): bir marta yuklanadi, internet uzilsa ham o'ynayveradi.
 * Saqlab bo'lmasa (eski brauzer, CORS) — to'g'ridan-to'g'ri serverdan o'ynaydi.
 */
const CACHE_NAME = 'milliygo-tv-media-v1';

/** Pleylist fayllarini TV xotirasiga yuklab, `url → blob:` xaritasini qaytaradi */
const useCachedMedia = (items: ScreenMedia[]): Record<string, string> => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const created = useRef<Record<string, string>>({});
  const key = items
    .map((m) => m.url)
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    if (typeof caches === 'undefined' || !key) return;
    let cancelled = false;
    const wanted = key.split('|');
    void (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // Pleylistdan chiqarilgan fayllar TV xotirasidan o'chiriladi
        for (const req of await cache.keys()) if (!wanted.includes(req.url)) await cache.delete(req);
        // Navbat bilan (bir vaqtda bittadan) — tarmoqni bo'g'ib qo'ymaslik uchun
        for (const url of wanted) {
          if (cancelled) return;
          if (created.current[url]) continue;
          let res = await cache.match(url);
          if (!res) {
            const fresh = await fetch(url, { mode: 'cors', credentials: 'omit' }).catch(() => null);
            if (!fresh || !fresh.ok) continue;
            await cache.put(url, fresh.clone()).catch(() => undefined); // joy tugasa — keshsiz o'ynaydi
            res = fresh;
          }
          const blobUrl = URL.createObjectURL(await res.blob());
          if (cancelled) {
            URL.revokeObjectURL(blobUrl);
            return;
          }
          created.current[url] = blobUrl;
          setUrls((u) => ({ ...u, [url]: blobUrl }));
        }
      } catch {
        /* Cache Storage yo'q — serverdan o'ynaydi */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(
    () => () => {
      Object.values(created.current).forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  return urls;
};

/** Video: ovoz bilan o'ynashga urinadi, brauzer ruxsat bermasa — ovozsiz */
const VideoSlide: React.FC<{ src: string; sound: boolean; loop: boolean; onDone: () => void }> = ({ src: initial, sound, loop, onDone }) => {
  const [src] = useState(initial); // o'ynayotgan video keshdan kelgan nusxa bilan qayta boshlanmasin
  const ref = useRef<HTMLVideoElement>(null);
  const back = useRef<HTMLVideoElement>(null);
  const [portrait, setPortrait] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !sound;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => done.current());
    });
    // Video qotib qolsa (buzilgan fayl, tarmoq) — 15 daqiqadan keyin keyingisiga
    const guard = setTimeout(() => done.current(), 15 * 60_000);
    return () => clearTimeout(guard);
  }, [sound]);

  // Vertikal video (reels) — yon tomonlarda o'sha videoning xiralashgan nusxasi
  useEffect(() => {
    if (portrait) back.current?.play().catch(() => undefined);
  }, [portrait]);

  return (
    <>
      {portrait && (
        <video ref={back} src={src} muted playsInline loop className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-3xl" />
      )}
      <video
        ref={ref}
        src={src}
        playsInline
        loop={loop}
        onLoadedMetadata={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
        onTimeUpdate={(e) => {
          // Orqa nusxa asosiy video bilan bir maromda
          const b = back.current;
          if (b && Math.abs(b.currentTime - e.currentTarget.currentTime) > 0.6) b.currentTime = e.currentTarget.currentTime;
        }}
        onEnded={() => done.current()}
        onError={() => setTimeout(() => done.current(), 1500)}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </>
  );
};

const ImageSlide: React.FC<{ src: string }> = ({ src: initial }) => {
  const [src] = useState(initial);
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* Rasm ekranga to'liq sig'masa — chetlarida xiralashgan nusxasi */}
      <img src={src} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
      <img src={src} alt="" className="tv-kenburns absolute inset-0 h-full w-full object-contain" />
    </div>
  );
};

export const MediaPlayer: React.FC<{ data: TvPayload; offline: boolean }> = ({ data, offline }) => {
  const items = useMemo(
    () => data.playlist.filter((m) => (m.kind === 'MENU' ? data.menu.length > 0 : !!m.url)),
    [data.playlist, data.menu.length],
  );
  const urls = useCachedMedia(items);
  const [step, setStep] = useState(0); // o'sib boradi: bir xil element qaytsa ham qaytadan boshlanadi
  const item = items.length ? items[step % items.length] : null;
  const next = useMemo(() => () => setStep((s) => s + 1), []);

  // Rasm va menyu taxtasi — belgilangan vaqt
  useEffect(() => {
    if (!item || item.kind === 'VIDEO') return;
    const t = setTimeout(next, Math.max(3, item.duration) * 1000);
    return () => clearTimeout(t);
  }, [step, item, next]);

  if (!item)
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-black text-center text-white/60">
        <div className="text-[2.4vw] font-black text-white/80">Pleylist bo'sh</div>
        <div className="text-[1.4vw]">Kassada: Sozlamalar → TV ekranlar → video yoki rasm qo'shing</div>
      </div>
    );

  const src = item.url ? urls[item.url] ?? item.url : '';
  return (
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black">
      <div key={step} className="tv-media-in absolute inset-0">
        {item.kind === 'VIDEO' && <VideoSlide src={src} sound={data.sound} loop={items.length === 1} onDone={next} />}
        {item.kind === 'IMAGE' && <ImageSlide src={src} />}
        {item.kind === 'MENU' && <MenuBoard data={data} offline={offline} />}
      </div>
      {offline && item.kind !== 'MENU' && <span className="absolute right-[1.2vw] top-[1.2vw] h-[0.9vw] w-[0.9vw] rounded-full bg-red-500" />}
    </div>
  );
};
