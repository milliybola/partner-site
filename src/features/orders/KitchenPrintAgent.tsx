import React, { useEffect, useRef, useState } from 'react';
import { ordersApi } from './services/ordersApi';
import { itemLabel, lineKey, loadPrinted as load, quantities, savePrinted as save, type Printed } from './kitchenPrinted';
import { printKitchenTicket } from './utils/printing';
import { escposPrinter, PRINTERS_CHANGED_EVENT } from '../../core/lib/printerConfig';
import { useRealtime } from '../../core/realtime/RealtimeProvider';
import { useToast } from '../../core/components/ToastProvider';

/**
 * Oshxona printeri agenti (faqat oshxona printeri sozlangan desktop kassada ishlaydi).
 *
 * Buyurtma qayerdan kelmasin — kassa, ofitsiant ilovasi, stol QR yoki MilliyGo ilovasi —
 * u oshxonaga tushganda (ACCEPTED/PREPARING) bir marta oshxona cheki chiqadi; keyin taom
 * qo'shilsa — faqat qo'shilganlari «QO'SHIMCHA» bo'lib chiqadi. Nima chop etilgani shu qurilmada
 * saqlanadi, shuning uchun ilova qayta ochilganda takror chiqmaydi.
 */
const COOKING = new Set(['ACCEPTED', 'PREPARING']);
const POLL_MS = 30_000;

/** Oshxonadagi buyurtmalarni oxirgi chop etilgan holat bilan solishtirib, yangi taomlarni chiqaradi */
const syncOnce = async (onError: (message: string) => void) => {
  const orders = (await ordersApi.getOrders()).filter((o) => COOKING.has(o.status));
  const prev = load();
  const next: Printed = {};
  for (const o of orders) {
    const now = quantities(o);
    next[o.uuid] = now;
    // Birinchi yoqilganda mavjud buyurtmalar chop etilmaydi — faqat bundan keyin kelganlari
    if (prev === null) continue;
    const before = prev[o.uuid];
    // Bir xil mahsulot ikki qatorda bo'lsa — farq bir marta chiqadi
    const seen = new Set<string>();
    const items = (o.items || [])
      .map((it) => ({ it, key: lineKey(it) }))
      .filter(({ key }) => !seen.has(key) && !!seen.add(key))
      .map(({ it, key }) => ({ it, diff: (now[key] || 0) - (before?.[key] || 0) }))
      .filter(({ diff }) => diff > 0)
      .map(({ it, diff }) => ({ name: itemLabel(it), quantity: diff, options: (it.options || []).map((x) => x.name).join(', ') }));
    if (!items.length) continue;
    try {
      await printKitchenTicket({
        order_number: o.order_number,
        table_number: o.table_number,
        delivery_type: o.delivery_type,
        waiter_name: o.waiter_name,
        description: before ? undefined : o.description,
        addition: !!before,
        items,
      });
    } catch (err) {
      // Chiqmagan chek keyingi urinishda qayta yuboriladi (yangi buyurtma — yana «yangi» bo'lib)
      if (before) next[o.uuid] = before;
      else delete next[o.uuid];
      onError(err instanceof Error ? `Oshxona printeri: ${err.message}` : "Oshxona chekini chop etib bo'lmadi");
    }
  }
  // Shu tekshiruv paytida oflayn navbatdan kelib belgilangan buyurtmalar o'chib ketmasin
  const latest = load() ?? {};
  for (const [uuid, q] of Object.entries(latest)) if (!(uuid in next) && !(uuid in (prev ?? {}))) next[uuid] = q;
  save(next);
};

// Bir vaqtda faqat bitta tekshiruv; ish paytida kelgan so'rov tugagach yana bir marta bajariladi
let running = false;
let pending = false;
const runSync = async (onError: (message: string) => void) => {
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
    if (e.type === 'new_order_alert' || e.type === 'order_status_update' || e.type === 'order_items_update') {
      void runSync((m) => toastRef.current.error(m));
    }
  });

  useEffect(() => {
    const run = () => void runSync((m) => toastRef.current.error(m));
    run();
    const t = setInterval(run, POLL_MS);
    return () => clearInterval(t);
  }, []);

  return null;
};

/** Oshxona printeri sozlanmagan qurilmada hech narsa qilmaydi */
export const KitchenPrintAgent: React.FC = () => {
  const [enabled, setEnabled] = useState(() => !!escposPrinter('kitchen'));
  useEffect(() => {
    const sync = () => setEnabled(!!escposPrinter('kitchen'));
    window.addEventListener(PRINTERS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PRINTERS_CHANGED_EVENT, sync);
  }, []);
  return enabled ? <Agent /> : null;
};
