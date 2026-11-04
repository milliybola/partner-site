/**
 * Ovozli xabarlar (public/sounds/*.mp3). Ovozlar navbat bilan chalinadi: bir vaqtda kelgan ikki hodisa
 * bir-birining ustiga tushib, tushunarsiz bo'lib qolmasin. Fayl chalinmasa (brauzer avtomatik ijroni
 * bloklasa yoki fayl yo'q bo'lsa) hech narsa buzilmaydi.
 */
export type SoundName =
  | 'new_order'
  | 'new_qr_order'
  | 'order_changed'
  | 'order_cancelled'
  | 'order_rejected'
  | 'order_ready'
  | 'order_paid'
  | 'order_waiting'
  | 'table_call'
  | 'table_bill'
  | 'no_courier'
  | 'courier_offer'
  | 'courier_offer_taken'
  | 'courier_assigned'
  | 'courier_pickup_ready'
  | 'courier_address_changed';

const MAX_QUEUE = 4;
const queue: SoundName[] = [];
let playing = false;
const cache = new Map<SoundName, HTMLAudioElement>();

const audioFor = (name: SoundName) => {
  let a = cache.get(name);
  if (!a) {
    a = new Audio(`/sounds/${name}.mp3`);
    a.preload = 'auto';
    cache.set(name, a);
  }
  return a;
};

const next = () => {
  const name = queue.shift();
  if (!name) {
    playing = false;
    return;
  }
  playing = true;
  const a = audioFor(name);
  const done = () => {
    a.removeEventListener('ended', done);
    a.removeEventListener('error', done);
    next();
  };
  a.addEventListener('ended', done);
  a.addEventListener('error', done);
  a.currentTime = 0;
  a.play().catch(done);
};

export const playSound = (name: SoundName) => {
  if (typeof window === 'undefined') return;
  if (queue.includes(name)) return; // bir xil ovoz navbatda turgan bo'lsa takrorlamaymiz
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(name);
  if (!playing) next();
};

type Ev = { type?: string; order_data?: { status?: string; order_source?: string; delivery_type?: string }; call?: { kind?: string } };

/** Hamkor paneliga kelgan WebSocket hodisasi uchun ovoz (yo'q bo'lsa null). */
export const soundForEvent = (e: Ev): SoundName | null => {
  switch (e?.type) {
    case 'new_order_alert':
      return e.order_data?.order_source === 'QR' ? 'new_qr_order' : 'new_order';
    case 'order_status_update':
      switch (e.order_data?.status) {
        case 'CANCELLED':
          return 'order_cancelled';
        case 'REJECTED':
          return 'order_rejected';
        case 'READY_FOR_PICKUP':
          return 'order_ready';
        default:
          return null;
      }
    // table_call: TableCallAlerts o'zi chaladi (zaxira so'rovi bilan ikki marta chalinmasin)
    case 'no_courier_alert':
      return 'no_courier';
    default:
      return null;
  }
};
