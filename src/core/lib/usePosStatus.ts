import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CloudOff, Printer, Wifi } from 'lucide-react';
import { OFFLINE_SHEET_EVENT, isShiftWaiting, queueWhat, summarizeQueue, useOfflineQueue, useOnline } from './offline';
import { PRINTERS_CHANGED_EVENT, deviceReady, getPrinterSettings } from './printerConfig';
import { printerKey, usePrintResults } from './printerStatus';
import { isTauri, pingPrinterAgent } from '../platform';
import { isShop } from './session';
import { SHIFT_EVENT, shiftApi } from '../../features/shifts/services/shiftApi';
import type { Shift } from '../../features/shifts/services/shiftApi';
import { t } from '../i18n';

/**
 * Kassa pastidagi holat qatori: internet (oflayn navbat), smena, printer.
 * Hammasi joyida bo'lsa — kulrang, ko'zga tashlanmaydi; muammo bo'lsa sariq/qizil.
 * Bosilsa tegishli joy ochiladi (oflayn navbat, Smena, Sozlamalar → Printerlar).
 */

const POLL_MS = 60_000;

export type Tone = 'ok' | 'idle' | 'warn' | 'bad';
export interface StatusItem {
  id: 'net' | 'shift' | 'printer';
  tone: Tone;
  text: string;
  hint?: string;
  icon: React.ElementType;
  /** Yo'q bo'lsa — bosilmaydi */
  action?: () => void;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })} ${time}`;
};

/* -------------------------------------------------------------- shift */
// undefined — hali bilinmaydi (yuklanmoqda yoki server javob bermadi)
const useCurrentShift = (enabled: boolean, online: boolean): Shift | null | undefined => {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);

  useEffect(() => {
    const onShift = (e: Event) => setShift((e as CustomEvent<Shift | null>).detail);
    window.addEventListener(SHIFT_EVENT, onShift);
    return () => window.removeEventListener(SHIFT_EVENT, onShift);
  }, []);

  useEffect(() => {
    if (!enabled || !online) return;
    // Natija SHIFT_EVENT orqali keladi; xatoda oxirgi ma'lum holat qoladi
    const load = () => void shiftApi.getCurrentShift().catch(() => undefined);
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [enabled, online]);

  return shift;
};

/* ------------------------------------------------------------ printer */
const usePrinterItem = (enabled: boolean, go: () => void): StatusItem => {
  const [settings, setSettings] = useState(getPrinterSettings);
  const results = usePrintResults();
  const [agentUp, setAgentUp] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setSettings(getPrinterSettings());
    window.addEventListener(PRINTERS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PRINTERS_CHANGED_EVENT, sync);
  }, []);

  const direct = isTauri() || settings.agent;
  const devices = direct ? [settings.receipt, settings.kitchen].filter(deviceReady) : [];
  const needsAgent = !isTauri() && devices.length > 0;

  useEffect(() => {
    if (!enabled || !needsAgent) return;
    let alive = true;
    const ping = () => void pingPrinterAgent().then((r) => alive && setAgentUp(!!r));
    ping();
    const timer = setInterval(ping, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled, needsAgent]);

  const base = { id: 'printer' as const, icon: Printer, action: go };
  if (!devices.length) return { ...base, tone: 'idle', text: t('bar.printerBrowser') };
  if (needsAgent && agentUp === false) return { ...base, tone: 'bad', text: t('bar.agentDown') };

  const last = devices.map((d) => results[printerKey(d).key]).filter(Boolean);
  const failed = last.filter((r) => !r.ok).sort((a, b) => b.at - a.at)[0];
  if (failed) return { ...base, tone: 'bad', text: t('bar.printerError', { time: hhmm(failed.at) }), hint: `${failed.label}: ${failed.error ?? ''}` };
  const ok = last.sort((a, b) => b.at - a.at)[0];
  if (ok) return { ...base, tone: 'ok', text: t('bar.printerOk', { time: hhmm(ok.at) }), hint: ok.label };
  return { ...base, tone: 'idle', text: t('bar.printerReady') };
};

/* ------------------------------------------------------------- status */
/** Holat qatori ma'lumotlari. Layout bir marta chaqiradi; pastki qator va «Ko'proq» bir xil ma'lumotni ko'rsatadi. */
export const usePosStatus = (enabled: boolean): StatusItem[] => {
  const navigate = useNavigate();
  const online = useOnline();
  const queue = useOfflineQueue();
  const shift = useCurrentShift(enabled, online);
  const openPrinters = useCallback(() => navigate('/settings', { state: { focus: 'printers' } }), [navigate]);
  const printer = usePrinterItem(enabled, openPrinters);

  const openQueue = () => window.dispatchEvent(new Event(OFFLINE_SHEET_EVENT));
  // Yuqoridagi banner bilan bir xil sonlar (summarizeQueue); to'lov bo'lsa — birinchi o'rinda u (pul)
  const { payments, orders, rejected } = summarizeQueue(queue);
  const hint = queueWhat({ payments, orders }) || undefined;
  // D36: smenani kutayotganlar «yuborilmoqda» emas — smena ochilgach ketadi
  const waiting = queue.filter(isShiftWaiting).length;
  const sending = summarizeQueue(queue.filter((o) => !isShiftWaiting(o)));
  const goShift = () => navigate('/shift');
  const net: StatusItem = !online
    ? {
        id: 'net',
        tone: 'bad',
        icon: CloudOff,
        text: payments ? t('bar.offlinePay', { n: payments }) : t('bar.offline', { n: queue.length }),
        hint,
        action: openQueue,
      }
    : rejected
      ? { id: 'net', tone: 'bad', icon: Wifi, text: t('bar.rejected', { n: rejected }), action: openQueue }
      : sending.pending
        ? { id: 'net', tone: 'warn', icon: Wifi, text: sending.payments ? t('bar.sendingPay', { n: sending.payments }) : t('bar.sending', { n: sending.pending }), hint, action: openQueue }
        : waiting
          ? { id: 'net', tone: 'warn', icon: Clock, text: t('bar.shiftWait', { n: waiting }), hint, action: goShift }
          : { id: 'net', tone: 'ok', icon: Wifi, text: t('bar.online') };

  const shiftItem: StatusItem =
    shift === undefined
      ? { id: 'shift', tone: 'idle', icon: Clock, text: t('bar.shiftUnknown'), action: goShift }
      : shift
        ? {
            id: 'shift',
            tone: 'ok',
            icon: Clock,
            text: t('bar.shiftOpen', { name: shift.opened_by_name || '—', time: hhmm(new Date(shift.opened_at).getTime()) }),
            hint: shift.filial_name || undefined, // A3: qaysi filial smenasi
            action: goShift,
          }
        : isShop()
          ? { id: 'shift', tone: 'idle', icon: Clock, text: t('bar.shiftClosedShop'), action: goShift }
          : { id: 'shift', tone: 'warn', icon: Clock, text: t('bar.shiftClosed'), action: goShift };

  return [net, shiftItem, printer];
};

