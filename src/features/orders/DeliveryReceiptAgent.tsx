import React, { useEffect, useRef, useState } from 'react';
import { ordersApi } from './services/ordersApi';
import { printReceipt } from './utils/printing';
import { escposPrinter, PRINTERS_CHANGED_EVENT } from '../../core/lib/printerConfig';
import { useRealtime } from '../../core/realtime/RealtimeProvider';
import { useToast } from '../../core/components/ToastProvider';
import { usePlatformConfig } from '../../core/lib/platformStage';
import { deliveryReceiptEnabled, loadDeliveryPrinted, saveDeliveryPrinted } from './deliveryReceipts';

/**
 * Yetkazib berish cheki agenti (kassa printeri ESC/POS bo'lgan kassada).
 *
 * Yetkazish buyurtmasi qabul qilinishi bilan (qayerda qabul qilinmasin — Buyurtmalar, kuryer biriktirish,
 * Oshxona ekrani, Merchant ilovasi) kassa printeridan BIR MARTA chek chiqadi: oshxona cheki bilan bir vaqtda.
 * Shuning uchun «Tayyor» va yakunlashda chek qayta chiqmaydi. Nima chop etilgani shu qurilmada saqlanadi.
 */
const ACCEPTED = new Set(['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']);
const POLL_MS = 30_000;

const syncOnce = async (onError: (m: string) => void) => {
  const orders = (await ordersApi.getOrders()).filter((o) => o.delivery_type === 'DELIVERY' && ACCEPTED.has(o.status));
  const prev = loadDeliveryPrinted();
  // Birinchi yoqilganda mavjud buyurtmalar chop etilmaydi — faqat bundan keyin qabul qilinganlari
  if (prev === null) {
    saveDeliveryPrinted(orders.map((o) => o.uuid));
    return;
  }
  const done = new Set(prev);
  for (const o of orders) {
    if (done.has(o.uuid)) continue;
    try {
      await printReceipt(o.uuid, true);
      done.add(o.uuid);
      saveDeliveryPrinted([...done]);
    } catch (err) {
      // Chiqmagan chek keyingi urinishda qayta yuboriladi
      onError(err instanceof Error ? `Kassa printeri: ${err.message}` : "Yetkazish chekini chop etib bo'lmadi");
    }
  }
};

let running = false;
let pending = false;
const runSync = async (onError: (m: string) => void) => {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    do {
      pending = false;
      await syncOnce(onError).catch(() => undefined); // tarmoq xatosi — keyingi so'rovda qayta urinadi
    } while (pending);
  } finally {
    running = false;
  }
};

const Agent: React.FC = () => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useRealtime((e) => {
    if (e.type === 'new_order_alert' || e.type === 'order_status_update') void runSync((m) => toastRef.current.error(m));
  });

  useEffect(() => {
    const run = () => void runSync((m) => toastRef.current.error(m));
    run();
    const t = setInterval(run, POLL_MS);
    return () => clearInterval(t);
  }, []);

  return null;
};

/** Kassa printeri (ESC/POS) sozlanmagan yoki sozlama o'chiq bo'lsa hech narsa qilmaydi */
export const DeliveryReceiptAgent: React.FC = () => {
  const { pos: posStage } = usePlatformConfig(); // mijoz cheki — 2-bosqich
  const check = () => !!escposPrinter('receipt') && deliveryReceiptEnabled();
  const [enabled, setEnabled] = useState(check);
  useEffect(() => {
    const sync = () => setEnabled(check());
    window.addEventListener(PRINTERS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PRINTERS_CHANGED_EVENT, sync);
  }, []);
  return posStage && enabled ? <Agent /> : null;
};
