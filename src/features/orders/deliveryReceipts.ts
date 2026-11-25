/** Yetkazish cheki (qabul qilinganda) — sozlama va shu qurilmada chop etilganlar ro'yxati */
export const DELIVERY_RECEIPT_KEY = 'milliygo_delivery_receipt_on_accept';
const PRINTED_KEY = 'milliygo_delivery_receipts_printed';
const KEEP = 300;

/** Sozlama: standart — yoqilgan (Sozlamalar → Printerlar) */
export const deliveryReceiptEnabled = () => {
  try {
    return localStorage.getItem(DELIVERY_RECEIPT_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const loadDeliveryPrinted = (): string[] | null => {
  try {
    const raw = localStorage.getItem(PRINTED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
};
export const saveDeliveryPrinted = (list: string[]) => {
  try {
    localStorage.setItem(PRINTED_KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    /* ignore */
  }
};

/** Qo'lda yoki boshqa yo'l bilan chek chiqqan yetkazish buyurtmasi — agent qayta chiqarmasin */
export const markDeliveryReceiptPrinted = (uuid: string) => {
  const list = loadDeliveryPrinted() ?? [];
  if (!list.includes(uuid)) saveDeliveryPrinted([...list, uuid]);
};

