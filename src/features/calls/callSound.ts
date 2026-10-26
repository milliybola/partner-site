/**
 * Qo'ng'iroq signali — yangi buyurtma "chime"idan farqli: ikki balandlikdagi qisqa "ding-dong" (telefon jiringi),
 * ikki marta takrorlanadi. Ovoz kontekst brauzer siyosati tufayli sahifada kamida bir marta bosilgandan keyin ochiladi.
 */
let ctx: AudioContext | null = null;

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
};

if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'running') {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    }
  };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock);
}

export const playCallRing = () => {
  try {
    const c = getCtx();
    if (!c) return;
    const tone = (freq: number, start: number, dur: number, vol: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(vol, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.start(start);
      o.stop(start + dur);
    };
    const t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const base = t + i * 0.55;
      tone(880, base, 0.22, 0.16);
      tone(660, base + 0.2, 0.3, 0.16);
    }
  } catch {
    /* ovoz — qo'shimcha imkoniyat */
  }
};
