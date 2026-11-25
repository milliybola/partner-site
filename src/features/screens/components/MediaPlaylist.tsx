import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Film, ImageIcon, LayoutGrid, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { screensApi, type PartnerScreen, type ScreenMedia } from '../screensApi';

/** Backend cheklovlari bilan bir xil (screen_views.py) */
const MAX_VIDEO = 50 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const VIDEO_RE = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const DURATIONS = [5, 8, 10, 15, 20, 30, 45, 60, 90, 120];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

const Thumb: React.FC<{ m: ScreenMedia }> = ({ m }) => {
  const box = 'h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black';
  if (m.kind === 'VIDEO' && m.url)
    return (
      <div className={box}>
        <video src={`${m.url}#t=1`} muted preload="metadata" className="h-full w-full object-cover" />
      </div>
    );
  if (m.kind === 'IMAGE' && m.url)
    return (
      <div className={box}>
        <img src={m.url} alt="" className="h-full w-full object-cover" />
      </div>
    );
  return (
    <div className={`${box} flex items-center justify-center bg-field`}>
      <LayoutGrid className="h-6 w-6 text-ink" />
    </div>
  );
};

/**
 * Video ekran pleylisti: video va rasm yuklash, «Menyu taxtasi» qo'shish, tartib, davomiylik.
 * TV o'zgarishni bir daqiqada oladi; yangi fayl TV ga bir marta yuklanib, o'zida saqlanadi.
 */
export const MediaPlaylist: React.FC<{ screen: PartnerScreen; onItems?: (items: ScreenMedia[]) => void }> = ({ screen, onItems }) => {
  const toast = useToast();
  const [items, setItems] = useState<ScreenMedia[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onItemsRef = useRef(onItems);
  useEffect(() => {
    onItemsRef.current = onItems;
  }, [onItems]);

  const apply = (list: ScreenMedia[]) => {
    setItems(list);
    onItemsRef.current?.(list);
  };

  useEffect(() => {
    screensApi
      .media(screen.uuid)
      .then(apply)
      .catch(() => setItems([]));
  }, [screen.uuid, screen.code]);

  const run = async (fn: () => Promise<ScreenMedia[]>, fallback: string) => {
    setBusy(true);
    try {
      apply(await fn());
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    // Navbat bilan yuklanadi — har birining foizi ko'rinadi
    for (const file of Array.from(files)) {
      const isVideo = VIDEO_RE.test(file.name);
      if (!isVideo && !IMAGE_RE.test(file.name)) {
        toast.error(`«${file.name}»: faqat MP4/WebM video yoki JPG/PNG/WebP rasm`);
        continue;
      }
      const limit = isVideo ? MAX_VIDEO : MAX_IMAGE;
      if (file.size > limit) {
        toast.error(`«${file.name}» juda katta (${mb(file.size)}). Ko'pi bilan ${mb(limit)}.`);
        continue;
      }
      setUpload({ name: file.name, pct: 0 });
      try {
        apply(await screensApi.uploadMedia(screen.uuid, file, (pct) => setUpload({ name: file.name, pct })));
      } catch (err) {
        toast.error(getErrorMessage(err, `«${file.name}» yuklanmadi`));
      }
    }
    setUpload(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const move = (i: number, dir: -1 | 1) => {
    if (!items) return;
    const order = items.map((m) => m.uuid);
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    void run(() => screensApi.reorderMedia(screen.uuid, order), "Tartibni saqlab bo'lmadi");
  };

  const total = (items ?? []).reduce((s, m) => s + m.size, 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px] font-bold text-ink">
        <span>
          Pleylist <span className="font-normal text-muted">— yuqoridan pastga, keyin boshidan</span>
        </span>
        {total > 0 && <span className="font-normal tabular-nums text-muted">{mb(total)}</span>}
      </div>

      <div className="space-y-2">
        {items === null && <div className="py-4 text-center text-[13px] text-muted">Yuklanmoqda…</div>}
        {items?.length === 0 && !upload && (
          <div className="rounded-xl border border-dashed border-edge py-6 text-center text-[13px] text-muted">
            Hali hech narsa yo'q. Video yoki rasm yuklang.
          </div>
        )}
        {items?.map((m, i) => (
          <div key={m.uuid} className="flex items-center gap-3 rounded-xl border border-edge p-2">
            <Thumb m={m} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate text-[14px] font-bold text-ink">
                {m.kind === 'VIDEO' ? <Film className="h-4 w-4 shrink-0" /> : m.kind === 'IMAGE' ? <ImageIcon className="h-4 w-4 shrink-0" /> : <LayoutGrid className="h-4 w-4 shrink-0" />}
                <span className="truncate">{m.name || (m.kind === 'MENU' ? 'Menyu taxtasi' : 'Fayl')}</span>
              </div>
              <div className="text-[12px] text-muted">
                {m.kind === 'VIDEO' ? `Video · oxirigacha · ${mb(m.size)}` : m.kind === 'IMAGE' ? `Rasm · ${mb(m.size)}` : 'Katalogdagi menyu (narx, stop-list bilan)'}
              </div>
            </div>
            {m.kind !== 'VIDEO' && (
              <select
                value={m.duration}
                disabled={busy}
                onChange={(e) => void run(() => screensApi.updateMedia(screen.uuid, m.uuid, { duration: Number(e.target.value) }), "Saqlab bo'lmadi")}
                className="h-9 rounded-lg border border-edge bg-white px-2 text-[13px] font-bold text-ink"
              >
                {(DURATIONS.includes(m.duration) ? DURATIONS : [...DURATIONS, m.duration].sort((a, b) => a - b)).map((d) => (
                  <option key={d} value={d}>
                    {d} soniya
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-col">
              <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" aria-label="Yuqoriga">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" disabled={busy || i === (items?.length ?? 0) - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" aria-label="Pastga">
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => screensApi.removeMedia(screen.uuid, m.uuid), "O'chirib bo'lmadi")}
              className="rounded-lg p-2 text-muted hover:bg-field hover:text-red-600"
              aria-label="O'chirish"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {upload && (
          <div className="rounded-xl border border-edge p-3">
            <div className="flex justify-between text-[13px] font-bold text-ink">
              <span className="truncate">{upload.name}</span>
              <span className="tabular-nums">{upload.pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-field">
              <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${upload.pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" multiple accept="video/mp4,video/webm,video/quicktime,.m4v,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pickFiles(e.target.files)} />
        <Button size="sm" icon={<Upload className="h-4 w-4" />} loading={!!upload} disabled={busy} onClick={() => fileRef.current?.click()}>
          Video yoki rasm yuklash
        </Button>
        <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} disabled={busy || !!upload} onClick={() => void run(() => screensApi.addMenuSlide(screen.uuid), "Qo'shib bo'lmadi")}>
          Menyu taxtasi
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Video — MP4 (H.264, 1080p), ko'pi bilan 50 MB (30–60 soniyalik reklama shunga sig'adi); rasm — 10 MB gacha. Barcha ekranlar uchun jami 300 MB. Gorizontal (16:9) fayllar ekranni to'liq egallaydi.
      </p>
    </div>
  );
};
