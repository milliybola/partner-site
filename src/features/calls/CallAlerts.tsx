import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Phone, PhoneMissed, PhoneOff, ShoppingBag, X } from 'lucide-react';
import { Badge, Button } from '../../core/ui';
import { formatPhone, timeAgo } from '../../core/lib/format';
import type { IncomingCall } from './callsApi';
import { useIncomingCalls } from './useIncomingCalls';

const MAX_VISIBLE = 3;

const STATUS: Record<IncomingCall['status'], { label: string; tone: 'success' | 'warning' | 'danger'; icon: React.ReactNode }> = {
  RINGING: { label: "Qo'ng'iroq bo'lmoqda", tone: 'success', icon: <Phone className="w-5 h-5" /> },
  ENDED: { label: "Qo'ng'iroq tugadi", tone: 'warning', icon: <PhoneOff className="w-5 h-5" /> },
  MISSED: { label: "O'tkazib yuborilgan", tone: 'danger', icon: <PhoneMissed className="w-5 h-5" /> },
};

const CallCard: React.FC<{ call: IncomingCall; onOpen: () => void; onDismiss: () => void }> = ({ call, onOpen, onDismiss }) => {
  const s = STATUS[call.status] ?? STATUS.ENDED;
  const ringing = call.status === 'RINGING';
  return (
    <article
      role="alert"
      className={`rounded-2xl bg-surface border shadow-xl p-3.5 md:p-4 ${ringing ? 'border-brand-bright animate-new-order' : 'border-edge'}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
            ringing ? 'bg-brand text-white' : call.status === 'MISSED' ? 'bg-danger-soft text-danger' : 'bg-gold-soft text-gold-ink'
          }`}
        >
          {s.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-black tracking-tightest text-ink tabular-nums">{formatPhone(call.phone)}</span>
            <Badge tone={s.tone} dot>
              {s.label}
            </Badge>
          </div>
          <div className="mt-0.5 text-[13px] text-muted truncate">
            {call.customer_name ? <b className="text-ink font-bold">{call.customer_name}</b> : 'Yangi mijoz'}
            {call.orders_count > 0 ? ` · ${call.orders_count} marta buyurtma bergan` : ''}
            {' · '}
            {timeAgo(call.created_at)}
          </div>
          {!ringing && <p className="mt-1.5 text-[14px] font-semibold text-ink">Shu raqamga buyurtma yaratamizmi?</p>}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Yopish"
          className="w-9 h-9 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-subtle hover:bg-field cursor-pointer shrink-0"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="md" block icon={<ShoppingBag className="w-4 h-4" />} onClick={onOpen}>
          Buyurtma ochish
        </Button>
        <Button size="md" variant="outline" onClick={onDismiss}>
          Yopish
        </Button>
      </div>
    </article>
  );
};

/** Yangi kelgan qo'ng'iroq uchun katta markaziy modal; 3 soniyada o'zi yopiladi (karta pastda qoladi). */
const CallModal: React.FC<{ call: IncomingCall; onOpen: () => void; onClose: () => void }> = ({ call, onOpen, onClose }) => (
  <div
    className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in"
    role="dialog"
    aria-modal="true"
    onClick={onClose}
  >
    <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface shadow-pop animate-pop" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Yopish"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 cursor-pointer"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="bg-brand px-6 pb-7 pt-8 text-center text-white">
        <span className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 animate-bounce">
          <Phone className="h-10 w-10" />
        </span>
        <div className="text-[13px] font-bold uppercase tracking-[0.18em] opacity-90">Qo'ng'iroq!</div>
        <div className="mt-1.5 text-[28px] font-black leading-none tabular-nums">{formatPhone(call.phone)}</div>
        <div className="mt-2.5 text-[14px] font-semibold opacity-90">
          {call.customer_name ? call.customer_name : 'Yangi mijoz'}
          {call.orders_count > 0 ? ` · ${call.orders_count} marta buyurtma bergan` : ''}
        </div>
      </div>
      <div className="flex gap-2.5 p-4">
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
          Yopish
        </Button>
        <Button variant="gold" size="lg" className="flex-[2]" icon={<ShoppingBag className="w-4 h-4" />} onClick={onOpen}>
          Buyurtma ochish
        </Button>
      </div>
    </div>
  </div>
);

/** Ekran tepasidagi qo'ng'iroq alert-kartalari (Layout'da bir marta). 3 tagacha, qolgani — "yana N ta". */
export const CallAlerts: React.FC = () => {
  const navigate = useNavigate();
  const { calls, dismiss, hide } = useIncomingCalls();
  const [expanded, setExpanded] = useState(false);
  const [modalCall, setModalCall] = useState<IncomingCall | null>(null);
  const announced = useRef<Set<string>>(new Set());

  // Yangi kelgan RINGING qo'ng'iroq uchun katta modal (eski/boshqa holatdagilar uchun emas).
  useEffect(() => {
    const fresh = calls.find(
      (c) => c.status === 'RINGING' && !announced.current.has(c.uuid) && Date.now() - new Date(c.created_at).getTime() < 20_000,
    );
    if (fresh) {
      announced.current.add(fresh.uuid);
      setModalCall(fresh);
    }
  }, [calls]);

  // 3 soniyada o'zi yopiladi.
  useEffect(() => {
    if (!modalCall) return;
    const t = setTimeout(() => setModalCall(null), 3000);
    return () => clearTimeout(t);
  }, [modalCall]);

  const open = (c: IncomingCall) => {
    const q = new URLSearchParams({ phone: c.phone, call: c.uuid });
    if (c.customer_name) q.set('name', c.customer_name);
    hide(c.uuid);
    navigate(`/new-order?${q.toString()}`);
  };

  if (calls.length === 0 && !modalCall) return null;

  const shown = expanded ? calls : calls.slice(0, MAX_VISIBLE);
  const rest = calls.length - shown.length;

  return (
    <>
      {modalCall && (
        <CallModal
          call={modalCall}
          onOpen={() => {
            open(modalCall);
            setModalCall(null);
          }}
          onClose={() => setModalCall(null)}
        />
      )}
      {calls.length > 0 && (
        <div className="fixed z-[60] top-3 left-3 right-3 md:left-auto md:right-6 md:top-4 md:w-[420px] space-y-2.5 pointer-events-none">
          {shown.map((c) => (
            <div key={c.uuid} className="pointer-events-auto">
              <CallCard call={c} onOpen={() => open(c)} onDismiss={() => void dismiss(c.uuid)} />
            </div>
          ))}
          {rest > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="pointer-events-auto mx-auto flex items-center gap-1.5 h-9 px-4 rounded-full bg-ink text-white text-[13px] font-bold shadow-lg cursor-pointer"
            >
              Yana {rest} ta qo'ng'iroq <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </>
  );
};
