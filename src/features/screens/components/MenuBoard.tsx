import React, { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../../../core/lib/format';
import type { TvPayload, TvProduct } from '../screensApi';
import { alpha, buildBoards, mix, onColor, type CategoryPanel, type FeaturePanel, type Panel } from '../tvLayout';
import './menuBoard.css';

/**
 * Zal TV menyu taxtasi. Bir ekranda bir nechta kategoriya paneli (bento), bo'sh joyda «Tavsiya» paneli.
 * Animatsiya: panellar va taomlar navbat bilan kirib keladi, narx tugmalarida yaltirash, tavsiya rasmi suzadi,
 * naqsh lentasi sekin siljiydi, taxta almashishida chiqib ketish. O'lchamlar vw/vh — har qanday TV ga sig'adi.
 */
interface Palette {
  frame: string;
  frameInk: string;
  panel: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  tint: string;
  feature: string;
  line: string;
}

const paletteOf = (accent: string, theme: 'dark' | 'light'): Palette =>
  theme === 'light'
    ? {
        frame: accent,
        frameInk: onColor(accent),
        panel: '#ffffff',
        ink: '#16181d',
        muted: 'rgba(22,24,29,.55)',
        accent,
        onAccent: onColor(accent),
        tint: alpha(accent, 0.12),
        feature: mix(accent, '#000000', 0.28),
        line: 'rgba(22,24,29,.08)',
      }
    : {
        frame: '#0b0c0f',
        frameInk: '#ffffff',
        panel: '#16181d',
        ink: '#ffffff',
        muted: 'rgba(255,255,255,.55)',
        accent,
        onAccent: onColor(accent),
        tint: alpha(accent, 0.2),
        feature: mix(accent, '#0b0c0f', 0.35),
        line: 'rgba(255,255,255,.08)',
      };

const LEAVE_MS = 650;

const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <span className="tabular-nums">
      {hh}
      <span className="tv-colon">:</span>
      {mm}
    </span>
  );
};

const Prices: React.FC<{ p: TvProduct; c: Palette; size: number; shine: number; invert?: boolean }> = ({ p, c, size, shine, invert }) => {
  const bg = invert ? '#ffffff' : c.accent;
  const fg = invert ? c.accent : c.onAccent;
  const values = p.variant_prices.length > 1 ? p.variant_prices : [p.final_price];
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-[0.35vw]">
      {values.map((v, i) => (
        <span
          key={i}
          className="tv-pill relative inline-flex items-baseline overflow-hidden whitespace-nowrap rounded-full font-black tabular-nums"
          style={{ background: bg, color: fg, fontSize: `${size}vw`, padding: `${size * 0.2}vw ${size * 0.6}vw`, animationDelay: `${(shine % 9) * 0.7}s` }}
        >
          {formatMoney(v, false)}
          {values.length === 1 && <span style={{ fontSize: '.62em', marginLeft: '.3em', opacity: 0.85 }}>so'm</span>}
        </span>
      ))}
      {values.length === 1 && p.final_price < p.price && (
        <span className="font-bold tabular-nums line-through" style={{ color: invert ? 'rgba(255,255,255,.6)' : c.muted, fontSize: `${size * 0.72}vw` }}>
          {formatMoney(p.price, false)}
        </span>
      )}
    </div>
  );
};

const Badge: React.FC<{ text: string; size?: number }> = ({ text, size = 0.75 }) => (
  <div
    className="tv-badge absolute z-10 flex items-center justify-center rounded-full bg-[#e3262f] text-center font-black uppercase leading-none text-white shadow-lg"
    style={{ width: `${size * 5}vw`, height: `${size * 5}vw`, fontSize: `${size}vw`, top: `-${size * 0.6}vw`, right: `-${size * 0.6}vw` }}
  >
    {text.length > 8 ? text.slice(0, 8) : text}
  </div>
);

const Photo: React.FC<{ src: string | null; c: Palette; className?: string; delay: number }> = ({ src, c, className = 'relative', delay }) => (
  <div className={`tv-photo overflow-hidden ${className}`} style={{ background: c.tint, animationDelay: `${delay}ms` }}>
    {src ? (
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center text-[3vw] opacity-40">🍽</div>
    )}
  </div>
);

const Tab: React.FC<{ title: string; c: Palette }> = ({ title, c }) => (
  <div
    className="absolute left-0 top-[1.4vh] z-10 max-w-[90%] truncate rounded-r-full py-[0.55vh] pl-[1.1vw] pr-[1.4vw] text-[1.15vw] font-black uppercase tracking-wide"
    style={{ background: c.accent, color: c.onAccent }}
  >
    {title}
  </div>
);

const CategoryView: React.FC<{ panel: CategoryPanel; c: Palette; images: boolean; delay: number }> = ({ panel, c, images, delay }) => {
  const n = panel.products.length;
  if (!images) {
    const cols = Math.max(1, Math.ceil(n / 7));
    return (
      <div className="grid h-full gap-x-[2vw] px-[1.4vw] pb-[1.4vh] pt-[6.4vh]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: 'repeat(7, minmax(0,1fr))', gridAutoFlow: 'column' }}>
        {panel.products.map((p, j) => (
          <div key={p.uuid} className="tv-item flex min-w-0 items-center gap-[0.6vw]" style={{ animationDelay: `${delay + 120 + j * 45}ms`, borderBottom: `1px dashed ${c.line}` }}>
            <span className="min-w-0 truncate text-[1.25vw] font-extrabold uppercase" style={{ color: c.ink }}>
              {p.name}
            </span>
            <span className="min-w-[1vw] flex-1" />
            <Prices p={p} c={c} size={1.05} shine={j} />
          </div>
        ))}
      </div>
    );
  }
  if (panel.wide) {
    return (
      <div className="flex h-full flex-col gap-[1.4vh] px-[1.2vw] pb-[1.6vh] pt-[6.4vh]">
        {panel.products.map((p, j) => (
          <div key={p.uuid} className="tv-item flex min-h-0 flex-1 items-center gap-[1.1vw]" style={{ animationDelay: `${delay + 140 + j * 80}ms` }}>
            <div className="relative h-full max-h-[15vh] shrink-0" style={{ aspectRatio: '1' }}>
              <Photo src={p.image} c={c} className="relative h-full w-full rounded-full" delay={delay + 200 + j * 80} />
              {p.badge && <Badge text={p.badge} size={0.62} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[1.35vw] font-black uppercase leading-tight" style={{ color: c.ink }}>
                {p.name}
              </div>
              {p.description && (
                <div className="mt-[0.3vh] line-clamp-2 text-[0.78vw] leading-snug" style={{ color: c.muted }}>
                  {p.description}
                </div>
              )}
              <div className="mt-[0.8vh]">
                <Prices p={p} c={c} size={1.05} shine={j + 2} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  const cols = Math.ceil(n / 2);
  return (
    <div className="grid h-full gap-x-[1vw] gap-y-[1.4vh] px-[1.1vw] pb-[1.4vh] pt-[6.2vh]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: 'repeat(2, minmax(0,1fr))' }}>
      {panel.products.map((p, j) => (
        <div key={p.uuid} className="tv-item flex min-h-0 min-w-0 flex-col items-center text-center" style={{ animationDelay: `${delay + 120 + j * 55}ms` }}>
          <div className="relative min-h-0 w-full flex-1">
            <Photo src={p.image} c={c} className="absolute inset-0 rounded-[1vw]" delay={delay + 180 + j * 55} />
            {p.badge && <Badge text={p.badge} size={0.8} />}
          </div>
          <div className="mt-[0.7vh] w-full truncate text-[1.02vw] font-black uppercase leading-tight" style={{ color: c.ink }}>
            {p.name}
          </div>
          <div className="mt-[0.5vh]">
            <Prices p={p} c={c} size={0.92} shine={j} />
          </div>
        </div>
      ))}
    </div>
  );
};

const FeatureView: React.FC<{ panel: FeaturePanel; c: Palette; delay: number }> = ({ panel, c, delay }) => {
  const p = panel.product;
  const big = panel.units >= 3;
  return (
    <div className="relative flex h-full overflow-hidden" style={{ background: c.feature }}>
      {/* yumshoq yorug'lik va naqsh lentasi */}
      <div className="tv-glow pointer-events-none absolute right-[-10%] top-[-20%] h-[140%] w-[70%] rounded-full" style={{ background: `radial-gradient(closest-side, ${alpha('#ffffff', 0.18)}, transparent)` }} />
      <div className="tv-ornament pointer-events-none absolute bottom-0 left-0 right-0 h-[4.2vh] opacity-25" />
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center gap-[1vh] py-[3vh] pl-[1.6vw] pr-[0.6vw]">
        <div className="tv-item w-max rounded-full bg-white/15 px-[0.9vw] py-[0.4vh] text-[0.85vw] font-black uppercase tracking-[0.18em] text-white" style={{ animationDelay: `${delay + 150}ms` }}>
          ★ Tavsiya · {panel.category}
        </div>
        <div className={`tv-item font-black uppercase leading-[1.02] text-white ${big ? 'text-[2.5vw]' : 'text-[1.8vw]'}`} style={{ animationDelay: `${delay + 230}ms` }}>
          {p.name}
        </div>
        {p.description && (
          <div className="tv-item line-clamp-3 text-[0.9vw] leading-snug text-white/75" style={{ animationDelay: `${delay + 300}ms` }}>
            {p.description}
          </div>
        )}
        <div className="tv-item mt-[0.6vh]" style={{ animationDelay: `${delay + 380}ms` }}>
          <Prices p={p} c={c} size={big ? 1.5 : 1.2} shine={1} invert />
        </div>
      </div>
      <div className="relative z-[1] flex shrink-0 items-center justify-center pr-[1.6vw]" style={{ width: big ? '48%' : '44%' }}>
        <div className="tv-hero relative w-full" style={{ aspectRatio: '1', animationDelay: `${delay + 200}ms` }}>
          <div className="tv-float absolute inset-0">
            <div className="absolute inset-0 overflow-hidden rounded-full shadow-[0_2vh_5vh_rgba(0,0,0,.35)] ring-[0.35vw] ring-white/20">
              {p.image && <img src={p.image} alt="" className="tv-kenburns h-full w-full object-cover" draggable={false} />}
            </div>
            {p.badge && <Badge text={p.badge} size={0.9} />}
          </div>
        </div>
      </div>
    </div>
  );
};

const PanelView: React.FC<{ panel: Panel; c: Palette; images: boolean; index: number }> = ({ panel, c, images, index }) => {
  const delay = index * 110;
  return (
    <section
      className="tv-panel relative min-w-0 overflow-hidden rounded-[1.3vw] shadow-[0_0.8vh_2.4vh_rgba(0,0,0,.18)]"
      style={{ flex: `${panel.units} 1 0`, background: c.panel, animationDelay: `${delay}ms` }}
    >
      {panel.kind === 'category' ? (
        <>
          <Tab title={panel.title} c={c} />
          <CategoryView panel={panel} c={c} images={images} delay={delay} />
        </>
      ) : (
        <FeatureView panel={panel} c={c} delay={delay} />
      )}
    </section>
  );
};

export const MenuBoard: React.FC<{ data: TvPayload; offline: boolean }> = ({ data, offline }) => {
  const c = useMemo(() => paletteOf(data.accent || '#1f7a4d', data.theme === 'light' ? 'light' : 'dark'), [data.accent, data.theme]);
  const boards = useMemo(() => buildBoards(data.menu, data.show_images), [data.menu, data.show_images]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const interval = Math.max(5, data.interval || 10) * 1000;
  const safe = boards.length ? index % boards.length : 0;
  const board = boards[safe];

  useEffect(() => {
    if (boards.length < 2) return;
    const out = setTimeout(() => setLeaving(true), interval - LEAVE_MS);
    const next = setTimeout(() => {
      setIndex((i) => (i + 1) % boards.length);
      setLeaving(false);
    }, interval);
    return () => {
      clearTimeout(out);
      clearTimeout(next);
    };
  }, [safe, boards.length, interval]);

  // Keyingi taxta rasmlari oldindan yuklanadi
  useEffect(() => {
    boards[(safe + 1) % Math.max(1, boards.length)]?.flat().forEach((p) => {
      const imgs = p.kind === 'category' ? p.products.map((x) => x.image) : [p.product.image];
      imgs.forEach((src) => {
        if (src) new Image().src = src;
      });
    });
  }, [safe, boards]);

  let n = 0;
  return (
    <div className="tv-root fixed inset-0 flex cursor-none select-none flex-col overflow-hidden" style={{ background: c.frame, color: c.frameInk }}>
      {data.theme !== 'light' && (
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 50% at 15% 0%, ${alpha(c.accent, 0.22)}, transparent 70%), radial-gradient(50% 50% at 100% 100%, ${alpha(c.accent, 0.14)}, transparent 70%)` }} />
      )}
      <header className="relative flex h-[8vh] shrink-0 items-center gap-[1vw] px-[1.8vw]">
        {data.partner.logo && <img src={data.partner.logo} alt="" className="h-[5.2vh] w-[5.2vh] rounded-full object-cover ring-2 ring-white/30" />}
        <div className="min-w-0 flex-1 truncate text-[1.6vw] font-black uppercase tracking-wide">{data.partner.name}</div>
        {boards.length > 1 && (
          <div className="flex items-center gap-[0.4vw]">
            {boards.map((_, i) => (
              <span key={i} className="h-[0.9vh] rounded-full transition-all duration-500" style={{ width: i === safe ? '2.2vw' : '0.9vh', background: i === safe ? c.frameInk : alpha(c.frameInk === '#ffffff' ? '#ffffff' : '#16181d', 0.35) }} />
            ))}
          </div>
        )}
        <div className="ml-[1vw] flex items-center gap-[0.6vw] text-[1.8vw] font-black">
          {offline && <span className="h-[0.9vw] w-[0.9vw] rounded-full bg-red-500" title="Internet yo'q" />}
          <Clock />
        </div>
      </header>

      {!board ? (
        <div className="relative flex flex-1 items-center justify-center text-[2.4vw] font-bold opacity-60">Menyu bo'sh</div>
      ) : (
        <main key={safe} className={`relative flex min-h-0 flex-1 flex-col gap-[1.1vw] px-[1.8vw] pb-[2.2vh] ${leaving ? 'tv-leave' : ''}`}>
          {board.map((row, r) => (
            <div key={r} className="flex min-h-0 flex-1 gap-[1.1vw]">
              {row.map((panel) => (
                <PanelView key={panel.key} panel={panel} c={c} images={data.show_images} index={n++} />
              ))}
            </div>
          ))}
        </main>
      )}

      {boards.length > 1 && (
        <div className="relative h-[0.6vh] shrink-0" style={{ background: alpha(c.frameInk === '#ffffff' ? '#ffffff' : '#16181d', 0.15) }}>
          <div key={`bar-${safe}`} className="h-full origin-left" style={{ background: c.frameInk, animation: `tv-bar ${interval}ms linear forwards` }} />
        </div>
      )}
    </div>
  );
};
