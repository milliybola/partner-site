import QRCode from 'qrcode';
import { ordersApi } from '../services/ordersApi';
// window.location.origin is 'null' under file:// and differs under tauri:// — resolve
// public assets against document.baseURI instead.
import { publicAsset, sendToPrinter } from '../../../core/platform';
import { EscPos } from '../../../core/platform/escpos';
import { escposPrinter, getPrinterSettings, type PrinterDevice } from '../../../core/lib/printerConfig';

const money = (v: unknown) => Math.round(Number(v) || 0).toLocaleString('uz-UZ'); // bo'linmas bo'shliqni EscPos almashtiradi
const copiesCount = () => parseInt(localStorage.getItem('milliygo_print_copies') || '1', 10) || 1;
const PAY_LABEL: Record<string, string> = { CASH: 'Naqd', CARD: 'Karta', TRANSFER: "O'tkazma", CLICK: 'Click', PAYME: 'Payme' };

/* ------------------------------------------------------------ ESC/POS (desktop) */
// Desktop ilovada printer sozlangan bo'lsa chek oynasiz, to'g'ridan-to'g'ri printerga ketadi
// (Sozlamalar → Printerlar). Aks holda pastdagi HTML + window.print usuli ishlaydi.

const itemName = (item: { product_name?: string; name?: string; product?: { name?: string } | null }) =>
  item.product_name || item.name || item.product?.name || "Noma'lum taom";

const receiptEscpos = (d: ReceiptData, device: PrinterDevice, drawer: boolean): Uint8Array => {
  const p = new EscPos(device.width, device.codepage);
  const isDelivery = d.delivery_type === 'DELIVERY';
  p.align('center').bold().size(2, 2).para(d.partner_name || 'MilliyGo', 2).size().bold(false);
  const contacts = [d.partner_address, d.partner_phone].filter(Boolean).join(' | ');
  if (contacts) p.para(contacts);
  p.line('milliyapp.uz').align('left').divider();
  if (d.order_number) p.bold().pair('Buyurtma:', `#${d.order_number}`).bold(false);
  p.pair('Sana:', d.created_at || new Date().toLocaleString('uz-UZ'));
  if (d.delivery_type_display) p.pair('Turi:', d.delivery_type_display);
  if (d.table_number) p.bold().pair('Stol:', `${d.table_number}-stol`).bold(false);
  if (!isDelivery && d.contact_name) p.pair('Mijoz:', d.contact_name);
  if (!isDelivery && d.contact_phone) p.pair('Tel:', d.contact_phone);
  if (isDelivery) {
    p.divider().bold().line('YETKAZISH').bold(false);
    if (d.contact_name) p.para(d.contact_name);
    if (d.contact_phone) p.bold().size(1, 2).line(d.contact_phone).size().bold(false);
    p.para((d.address || '').trim() || `MANZIL KIRITILMAGAN - mijozga qo'ng'iroq qiling: ${d.contact_phone ?? ''}`);
    if (d.latitude != null && d.longitude != null && d.latitude !== '' && d.longitude !== '') {
      p.align('center').qr(`https://www.google.com/maps?q=${Number(d.latitude)},${Number(d.longitude)}`, 5).line('Xaritada ochish').align('left');
    }
  }
  p.divider();
  for (const item of d.items || []) {
    const qty = item.unit === 'KG' ? `${Number(Number(item.quantity).toFixed(3))} kg` : `${item.quantity}${item.packaging_name ? ` ${item.packaging_name}` : ''}`;
    p.bold().pair(itemName(item), money(item.line_total)).bold(false);
    const opts = (item.options || []).map((o) => o.name).join(', ');
    if (opts) p.para(`  ${opts}`);
    const free = Number(item.free_quantity) || 0;
    p.line(`  ${money(item.unit_price)} x ${qty}${free > 0 ? ` (+${free} bepul)` : ''}`);
  }
  p.divider().pair('Summa:', `${money(d.subtotal)} UZS`);
  if (isDelivery) p.pair('Yetkazib berish:', `${money(d.delivery_fee)} UZS`);
  if (Number(d.service_charge_amount || 0) > 0) {
    const pct = Number(d.service_charge_percent || 0) > 0 ? ` (${d.service_charge_percent}%)` : '';
    p.pair(`Xizmat haqi${pct}:`, `${money(d.service_charge_amount)} UZS`);
  }
  p.divider('=').bold().size(1, 2).pair('JAMI:', `${money(d.total_price)} UZS`).size().bold(false).divider('=');
  if (d.payment_breakdown?.length) {
    p.pair("To'lov turi:", 'Aralash');
    for (const part of d.payment_breakdown) p.pair(`  ${PAY_LABEL[part.method] || part.method}:`, `${money(part.amount)} UZS`);
  } else {
    p.pair("To'lov turi:", d.payment_method_display || d.payment_method || '');
  }
  if ((d.split_count ?? 1) > 1) p.pair(`Kishi boshiga (${d.split_count}):`, `${money(splitEach(d.total_price, d.split_count!))} UZS`);
  if (d.description) p.para(`Izoh: ${d.description}`);
  p.feed(1).align('center').bold().line('XARIDINGIZ UCHUN RAHMAT!').bold(false);
  if (drawer) p.openDrawer();
  return p.cut().build();
};

/** Naqd to'lovli chekda pul qutisi ochiladi (sozlamada yoqilgan bo'lsa) */
const wantsDrawer = (d: ReceiptData) => getPrinterSettings().openDrawer && String(d.payment_method || '').toUpperCase() === 'CASH';

const printReceiptData = async (d: ReceiptData, includeOfdQr: boolean) => {
  const device = escposPrinter('receipt');
  if (!device) return printHtmlCopies(await buildReceiptHtml(d, includeOfdQr));
  const copies = copiesCount();
  for (let i = 0; i < copies; i++) await sendToPrinter(device, receiptEscpos(d, device, i === 0 && wantsDrawer(d)));
};

export interface KitchenTicketInput {
  order_number?: string;
  table_number?: string | null;
  delivery_type?: string;
  waiter_name?: string | null;
  description?: string;
  /** true — avval yuborilgan buyurtmaga qo'shimcha taomlar */
  addition?: boolean;
  items: Array<{ name: string; quantity: number | string; options?: string }>;
}

const KIND_LABEL: Record<string, string> = { DINE_IN: 'ZALDA', PICKUP: 'OLIB KETISH', DELIVERY: 'YETKAZISH' };

/** Oshxona cheki: narxsiz, katta shrift — oshpaz uzoqdan o'qiydi */
export const kitchenTicketEscpos = (t: KitchenTicketInput, device: PrinterDevice): Uint8Array => {
  const p = new EscPos(device.width, device.codepage);
  p.align('center').bold().size(2, 2);
  if (t.addition) p.line("QO'SHIMCHA");
  p.line(t.table_number ? `${t.table_number}-STOL` : KIND_LABEL[t.delivery_type || ''] || 'BUYURTMA');
  p.size().bold(false);
  if (t.order_number) p.line(`#${t.order_number}`);
  p.line(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }));
  if (t.waiter_name) p.line(`Ofitsiant: ${t.waiter_name}`);
  p.align('left').divider();
  for (const it of t.items) {
    p.bold().size(1, 2).pair(it.name, `x${Number(it.quantity)}`).size().bold(false);
    if (it.options) p.para(`  + ${it.options}`);
  }
  p.divider();
  if (t.description && t.description !== "Izoh yo'q") p.bold().para(`IZOH: ${t.description}`).bold(false);
  return p.cut().build();
};

/** Oshxona printeri sozlangan bo'lsa — oshxona chekini chiqaradi. Sozlanmagan bo'lsa false. */
export const printKitchenTicket = async (t: KitchenTicketInput): Promise<boolean> => {
  const device = escposPrinter('kitchen');
  if (!device || !t.items.length) return false;
  await sendToPrinter(device, kitchenTicketEscpos(t, device));
  return true;
};

/** Printer sozlamasini tekshirish uchun qisqa sinov cheki (Sozlamalar sahifasi) */
export const printTestTicket = async (device: PrinterDevice, label: string) => {
  const p = new EscPos(device.width, device.codepage);
  p.align('center').bold().size(2, 2).line('MilliyGo').size().line(label).bold(false).align('left').divider();
  p.pair('Lotin:', "O'zbekiston, g'isht").pair('Kirill:', 'Ўзбекистон, Ёзув').pair('Raqam:', '1 234 567 UZS');
  p.divider().align('center').line(new Date().toLocaleString('uz-UZ'));
  await sendToPrinter(device, p.cut().build());
};

/** Faqat pul qutisini ochish (kassa printeri orqali) */
export const openCashDrawer = async () => {
  const device = escposPrinter('receipt');
  if (!device) throw new Error('Kassa printeri sozlanmagan');
  const p = new EscPos(device.width, device.codepage);
  await sendToPrinter(device, p.openDrawer().build());
};

// SECURITY: receipts are rendered in a same-origin iframe, so every value that can
// come from a customer (name, address, comment, product names) must be escaped —
// otherwise a crafted comment could run script with access to the session token.
const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface ReceiptData {
  order_number?: string;
  created_at?: string;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  delivery_type?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  delivery_type_display?: string;
  table_number?: string | null;
  items: Array<{
    product_name?: string;
    name?: string;
    product?: { name?: string } | null;
    unit_price?: number | string;
    line_total?: number | string;
    quantity: number;
    unit?: 'PIECE' | 'KG';
    packaging_name?: string;
    options?: Array<{ name: string; price_delta?: number | string }>;
    free_quantity?: number | string;
    promotion_label?: string;
  }>;
  subtotal: number | string;
  delivery_fee?: number | string;
  service_charge_percent?: number | string;
  service_charge_amount?: number | string;
  total_price: number | string;
  payment_method_display?: string;
  payment_method?: string;
  /** Aralash to'lov qismlari */
  payment_breakdown?: Array<{ method: string; amount: number | string }>;
  split_count?: number;
  description?: string;
  partner_name?: string;
  partner_address?: string;
  partner_phone?: string;
}

// Send an HTML document to the printer via a hidden iframe + window.print(). Relies on the
// app being launched with the --kiosk-printing flag for a dialog-free print — set globally
// in main.js for the Electron desktop app, or configured manually for a plain browser (see
// the Settings page instructions). This is used uniformly for both: an earlier attempt to
// print silently from Electron's main process via webContents.print() consistently failed
// with "Invalid printer settings" on some printer/driver combinations regardless of any
// option tried (deviceName, pageSize, silent on/off), while this simpler approach is the
// same one that's known to actually reach the printer via a real browser tab.
const printHtmlCopies = async (html: string): Promise<void> => {
  const printCopies = copiesCount();

  // The print trigger MUST live inside the written document itself (not on iframe.onload):
  // a freshly-appended, src-less iframe first loads "about:blank" and fires its own load
  // event before doc.write() ever runs, then fires a second load event once the real
  // content is written. Listening on iframe.onload prints that blank first pass too —
  // a stray empty job that some thermal receipt printers respond to with a runaway blank
  // paper feed. Embedding the script in the document ties it to that document's own
  // window.onload, which only fires once, after the real content has loaded.
  for (let i = 0; i < printCopies; i++) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(withAutoPrintScript(html));
      doc.close();
    }
  }
};

// Appends a self-triggering print script to an HTML document.
//
// The template below declares `@page { size: 80mm auto; }`, but Chromium's real-printer
// path (unlike its "Save as PDF" output) doesn't actually shrink the page to fit the
// content for `auto` — it falls back to whatever paper size the printer driver reports
// as its default, which for many generic thermal-printer Windows drivers is a large fixed
// placeholder (observed: "80 x 3276mm"). That prints the receipt at the very top of a
// multi-meter blank page. So before printing, this measures the real rendered height and
// injects an explicit `@page` override in millimeters — a concrete number Chromium can
// actually hand to the driver, instead of the ambiguous "auto" it silently ignores.
//
// The measured height must never be allowed below the 80mm width: `@page { size: W H }`
// is a plain width-then-height pair with no orientation keyword, so a short receipt (e.g.
// a pre-check with just one or two items) can measure out shorter than 80mm and flip the
// page landscape — which is what was producing sideways-printed short receipts while long
// ones (always taller than 80mm) never showed the problem. A fixed floor keeps every
// receipt portrait-shaped regardless of how little content it has.
const MIN_RECEIPT_HEIGHT_MM = 100;
const withAutoPrintScript = (html: string): string => {
  const autoPrintScript = `
    <script>
      window.onload = function() {
        try {
          var measuredMm = Math.ceil(document.body.getBoundingClientRect().height / 96 * 25.4);
          var heightMm = Math.max(measuredMm, ${MIN_RECEIPT_HEIGHT_MM});
          var pageSizeStyle = document.createElement('style');
          pageSizeStyle.textContent = '@page { size: 80mm ' + heightMm + 'mm; margin: 0; }';
          document.head.appendChild(pageSizeStyle);
        } catch (e) {}
        window.print();
        setTimeout(function() {
          if (window.frameElement) window.frameElement.remove();
        }, 1000);
      };
    </script>
  `;
  return html.includes('</body>')
    ? html.replace('</body>', `${autoPrintScript}</body>`)
    : html + autoPrintScript;
};

// Build the official receipt HTML markup from receipt data — shared between the
// backend-fetched (post-order) receipt and the locally-built (pre-order) preview.
// Soliq (OFD) QR chekda chiqarilmaydi: `_includeOfdQr` faqat eski chaqiruvlar mosligi uchun qoldirilgan.
const buildReceiptHtml = async (receiptData: ReceiptData, _includeOfdQr: boolean): Promise<string> => {

  const isDelivery = receiptData.delivery_type === 'DELIVERY';
  const hasPoint = receiptData.latitude != null && receiptData.longitude != null && receiptData.latitude !== '' && receiptData.longitude !== '';
  const mapUrl = hasPoint ? `https://www.google.com/maps?q=${Number(receiptData.latitude)},${Number(receiptData.longitude)}` : '';
  const mapQrSvg = isDelivery && mapUrl
    ? await QRCode.toString(mapUrl, { type: 'svg', margin: 0, width: 110 }).catch(() => '')
    : '';
  // Kuryerga yo'l ko'rsatish: ruchka bilan yozish o'rniga chekning o'zida manzil, telefon va xarita QR.
  const deliveryBlock = isDelivery ? `
        <div class="divider"></div>
        <div style="font-weight: 800; font-size: 13px; margin-bottom: 3px;">YETKAZISH</div>
        ${receiptData.contact_name ? `<div style="font-size: 13px; font-weight: 700;">${esc(receiptData.contact_name)}</div>` : ''}
        ${receiptData.contact_phone ? `<div style="font-size: 18px; font-weight: 800; margin: 2px 0;">${esc(receiptData.contact_phone)}</div>` : ''}
        ${(receiptData.address || '').trim()
          ? `<div style="font-size: 13px; font-weight: 700; line-height: 1.3;">${esc(receiptData.address)}</div>`
          : `<div style="font-size: 13px; font-weight: 800; border: 2px solid #000; padding: 4px; margin-top: 3px;">MANZIL KIRITILMAGAN — mijozga qo'ng'iroq qiling: ${esc(receiptData.contact_phone)}</div>`}
        ${mapQrSvg ? `<div style="text-align: center; margin-top: 6px;">${mapQrSvg}<div style="font-size: 10px;">Xaritada ochish uchun skanerlang</div><div style="font-size: 9px; word-break: break-all;">${esc(mapUrl)}</div></div>` : ''}
  ` : '';

  const itemsHtml = (receiptData.items || []).map((item: any) => {
    const productName = item.product_name || item.name || item.product?.name || "Noma'lum taom";
    const unitPrice = Number(item.unit_price || 0).toLocaleString('uz-UZ');
    const lineTotal = Number(item.line_total || 0).toLocaleString('uz-UZ');
    const qty = item.unit === 'KG' ? `${Number(Number(item.quantity).toFixed(3))} kg` : `${item.quantity}${item.packaging_name ? ` ${item.packaging_name}` : ''}`;
    const options = (item.options || []).map((o: { name: string }) => o.name).join(', ');
    const free = Number(item.free_quantity) || 0;
    return `
      <div style="margin-bottom: 6px; font-size: 11px; font-weight: 500; color: #000;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: #000;">
          <span>${esc(productName)}</span>
          <span>${lineTotal} UZS</span>
        </div>
        ${options ? `<div style="font-size: 10px; color: #000;">${esc(options)}</div>` : ''}
        <div style="font-size: 10px; color: #000; font-weight: 500; margin-top: 1px;">
          ${unitPrice} UZS x ${qty}${free > 0 ? ` (+${free} bepul${item.promotion_label ? `, ${esc(item.promotion_label)}` : ''})` : ''}
        </div>
      </div>
    `;
  }).join('');

  const formattedDate = receiptData.created_at || new Date().toLocaleString('uz-UZ');

  const receiptHtml = `
    <html>
      <head>
        <title>Chek #${esc(receiptData.order_number)}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            width: 80mm;
            max-width: 80mm;
            margin: 0 auto;
            padding: 8px 4px 0 4px;
            color: #000;
            background: #fff;
            line-height: 1.35;
            font-weight: 500;
            overflow-wrap: break-word;
          }
          .text-center { text-align: center; }
          .bold { font-weight: 700; }
          .header { margin-bottom: 8px; }
          .header h2 { margin: 0 0 2px 0; font-size: 16px; font-weight: 700; letter-spacing: -0.3px; color: #000; }
          .header p { margin: 1px 0; font-size: 11px; color: #000; font-weight: 500; }
          .logo-box {
            border: 1px solid #000;
            display: inline-block;
            padding: 1px 6px;
            font-weight: 700;
            font-size: 12px;
            margin-bottom: 4px;
            letter-spacing: 1px;
            color: #000;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 4px;
            font-weight: 500;
            color: #000;
          }
          .info-label { color: #000; font-weight: 500; }
          .info-value { font-weight: 700; text-align: right; color: #000; }

          .items-header {
            display: flex;
            justify-content: space-between;
            font-weight: 700;
            font-size: 11px;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
            margin-bottom: 5px;
            color: #000;
          }

          .totals-section {
            margin-top: 6px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 4px;
            font-weight: 500;
            color: #000;
          }
          .grand-total-row {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            font-weight: 700;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 5px 0;
            margin: 8px 0;
            color: #000;
          }
          .footer {
            margin-top: 15px;
            font-size: 10px;
            text-align: center;
            color: #000;
            font-weight: 500;
          }
          .barcode {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            margin-top: 6px;
            letter-spacing: 2px;
            font-weight: 700;
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="header text-center" style="display: flex; flex-direction: column; align-items: center; margin-bottom: 6px;">
          <div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; margin-bottom: 2px;">
            <div style="display: flex; flex-direction: row; align-items: center; gap: 4px; flex-shrink: 0;">
              <img src="${publicAsset('logo_bw.png')}" alt="MilliyGo Logo" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;" />
              
              <span style="font-size: 15px; font-weight: 700; letter-spacing: 0.5px; color: #000;">MilliyGo</span>
            </div>
            |
            <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #000; text-transform: uppercase; text-align: left;">${esc(receiptData.partner_name)}</h2>
          </div>
          <div style="font-size: 10px; color: #000; font-weight: 500; margin-top: 2px; line-height: 1.2; text-align: center;">
          <p style="margin: 1px 0;">${esc([receiptData.partner_address, receiptData.partner_phone].filter(Boolean).join(' | '))}</p>
          </div>
          <p style="margin: 0; font-weight: 700;">milliyapp.uz</p>
            </div>

        <div class="divider"></div>

        ${receiptData.order_number ? `
        <div class="info-row">
          <span class="info-label">Buyurtma:</span>
          <span class="info-value bold">${esc(receiptData.order_number)}</span>
        </div>` : ''}
        <div class="info-row">
          <span class="info-label">Sana:</span>
          <span class="info-value">${formattedDate}</span>
        </div>
        ${!isDelivery && receiptData.contact_name ? `
        <div class="info-row">
          <span class="info-label">Mijoz:</span>
          <span class="info-value">${esc(receiptData.contact_name)}</span>
        </div>` : ''}
        ${!isDelivery && receiptData.contact_phone ? `
        <div class="info-row">
          <span class="info-label">Tel:</span>
          <span class="info-value">${esc(receiptData.contact_phone)}</span>
        </div>` : ''}
        
        ${receiptData.delivery_type_display ? `
        <div class="info-row">
          <span class="info-label">Turi:</span>
          <span class="info-value">${esc(receiptData.delivery_type_display)}</span>
        </div>` : ''}
        ${receiptData.table_number ? `
        <div class="info-row">
          <span class="info-label">Stol:</span>
          <span class="info-value bold">${esc(receiptData.table_number)}-stol</span>
        </div>` : ''}
        ${deliveryBlock}


        <div class="divider"></div>

        <div class="items-header">
          <span>MAHSULOT</span>
          <span>SUMMA</span>
        </div>

        ${itemsHtml}

        <div class="divider"></div>

        <div class="totals-section">
          <div class="totals-row">
            <span class="info-label">Summa:</span>
            <span class="info-value">${Number(receiptData.subtotal).toLocaleString('uz-UZ')} UZS</span>
          </div>
          ${
            isDelivery
              ? `<div class="totals-row">
            <span class="info-label">Yetkazib berish:</span>
            <span class="info-value">${Number(receiptData.delivery_fee || 0).toLocaleString('uz-UZ')} UZS</span>
          </div>`
              : ''
          }
          ${
            Number(receiptData.service_charge_amount || 0) > 0
              ? `<div class="totals-row">
            <span class="info-label">Xizmat haqi${Number(receiptData.service_charge_percent || 0) > 0 ? ` (${receiptData.service_charge_percent}%)` : ''}:</span>
            <span class="info-value">${Number(receiptData.service_charge_amount).toLocaleString('uz-UZ')} UZS</span>
          </div>`
              : ''
          }

          <div class="grand-total-row">
            <span>JAMI:</span>
            <span>${Number(receiptData.total_price).toLocaleString('uz-UZ')} UZS</span>
          </div>

          <div class="info-row" style="margin-top: 4px;">
            <span class="info-label">To'lov turi:</span>
            <span class="info-value bold">${esc(receiptData.payment_breakdown?.length ? 'Aralash' : receiptData.payment_method_display || receiptData.payment_method)}</span>
          </div>
          ${(receiptData.payment_breakdown || []).map((part) => `
          <div class="info-row">
            <span class="info-label">&nbsp;&nbsp;${esc(PAY_LABEL[part.method] || part.method)}:</span>
            <span class="info-value">${money(part.amount)} UZS</span>
          </div>`).join('')}

          ${(receiptData.split_count ?? 1) > 1 ? `
          <div class="divider"></div>
          <div class="info-row">
            <span class="info-label">Kishi boshiga (${receiptData.split_count} kishi):</span>
            <span class="info-value bold">${splitEach(receiptData.total_price, receiptData.split_count!).toLocaleString('uz-UZ')} UZS</span>
          </div>` : ''}

          ${receiptData.description ? `
          <div class="info-row" style="margin-top: 3px;">
            <span class="info-label">Izoh:</span>
            <span class="info-value">${esc(receiptData.description)}</span>
          </div>` : ''}
        </div>

        <div class="footer">
          <p class="bold" style="font-size: 11px; margin-bottom: 2px;">XARIDINGIZ UCHUN RAHMAT!</p>
        </div>
      </body>
    </html>
  `;

  return receiptHtml;
};

// Print the full backend-generated receipt for an existing (already created) order.
// includeOfdQr picks between the two receipt variants (see buildReceiptHtml) — callers
// offer this as two separate print actions rather than a single default.
export const printReceipt = async (orderUuid: string, includeOfdQr: boolean): Promise<void> => {
  const responseData = await ordersApi.getOrderReceipt(orderUuid);
  const receiptData = responseData.data || responseData;
  await printReceiptData(receiptData, includeOfdQr);
};

// Print the same official receipt layout, but built purely from local data —
// used before the order actually exists on the backend (e.g. reviewing before submit).
export const printReceiptPreview = async (receiptData: ReceiptData, includeOfdQr: boolean): Promise<void> => {
  await printReceiptData(receiptData, includeOfdQr);
};

export interface PreCheckOrderInput {
  table_number?: string | null;
  total_price: number | string;
  /** Hisob nechta kishiga bo'linadi (1 — bo'linmaydi) */
  split_count?: number;
  items: Array<{
    product_name?: string;
    name?: string;
    product?: { name?: string; price?: number | string } | null;
    price_at_time_of_order?: string | number;
    quantity: number;
  }>;
}

// Hisobni teng bo'lganda bir kishiga to'g'ri keladigan summa (so'mgacha yaxlitlanadi).
export const splitEach = (total: number | string, count: number): number => Math.round((Number(total) || 0) / Math.max(1, count));

// Print a simple preliminary (not-yet-paid) receipt built purely from local order data
export const printPreCheck = async (order: PreCheckOrderInput): Promise<void> => {
  const device = escposPrinter('receipt');
  if (device) {
    const total = Number(order.total_price || 0);
    const p = new EscPos(device.width, device.codepage);
    p.align('center').bold().size(1, 2).line('PRE-CHEK').size().bold(false);
    if (order.table_number) p.line(`${order.table_number}-stol`);
    p.line(new Date().toLocaleString('uz-UZ')).align('left').divider();
    for (const item of order.items || []) {
      const unit = Number(item.price_at_time_of_order || item.product?.price || 0);
      const qty = item.quantity || 1;
      p.pair(itemName(item), String(qty)).pair(`  Narxi: ${money(unit)}`, money(unit * qty));
    }
    p.divider().bold().size(1, 2).pair('Jami:', `${money(total)} so'm`).size().bold(false);
    if ((order.split_count ?? 1) > 1) p.pair(`Kishi boshiga (${order.split_count}):`, `${money(splitEach(total, order.split_count!))} so'm`);
    p.feed(1).align('center').line("To'lov emas - hisobni tekshirish uchun");
    await sendToPrinter(device, p.cut().build());
    return;
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const totalAmount = Number(order.total_price || 0);
  const tableLabel = order.table_number ? `stol "${esc(order.table_number)}"` : '';

  const preCheckHtml = `
    <html>
      <head>
        <title>Pre-chek</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 80mm;
            max-width: 80mm;
            margin: 0 auto;
            padding: 8px 6px 0 6px;
            color: #000;
            background: #fff;
            font-size: 12px;
            font-weight: 700;
            overflow-wrap: break-word;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .center { text-align: center; }
          .divider { border-top: 2px dashed #000; margin: 7px 0; }
          .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
          .total-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; margin-top: 3px; }
        </style>
      </head>
      <body>
        <div class="center" style="font-size: 15px; margin-bottom: 8px;">Buyurtmalaringiz</div>
        <div style="margin-bottom: 2px;">Chek chiqarilgan vaqti: ${timeStr}</div>
        ${tableLabel ? `<div style="margin-bottom: 2px;">${tableLabel}</div>` : ''}
        <div class="divider"></div>
        ${(order.items || []).map((item) => {
          const productName = item.product_name || item.name || item.product?.name || "Noma'lum taom";
          const unitPrice = Number(item.price_at_time_of_order || item.product?.price || 0);
          const quantity = item.quantity || 1;
          const lineTotal = unitPrice * quantity;
          return `
            <div style="margin: 8px 0;">
              <div class="row">
                <span style="font-size: 12px;">${esc(productName)}</span>
                <span style="font-size: 12px; margin-left: 6px; white-space: nowrap;">${quantity}</span>
              </div>
              <div class="row">
                <span style="font-size: 11px;">Narxi: ${unitPrice.toLocaleString('uz-UZ')}</span>
                <span style="font-size: 11px;">${lineTotal.toLocaleString('uz-UZ')}</span>
              </div>
            </div>
          `;
        }).join('')}
        <div class="divider"></div>
        <div class="total-row"><span>Jami:</span><span>${totalAmount.toLocaleString('uz-UZ')} so'm</span></div>
        <div class="total-row" style="margin-top: 4px;"><span>Jami to'lov:</span><span>${totalAmount.toLocaleString('uz-UZ')} so'm</span></div>
        ${(order.split_count ?? 1) > 1 ? `
        <div class="divider"></div>
        <div class="row"><span>Kishi boshiga (${order.split_count} kishi):</span><span>${splitEach(totalAmount, order.split_count!).toLocaleString('uz-UZ')} so'm</span></div>` : ''}
      </body>
    </html>
  `;

  await printHtmlCopies(preCheckHtml);
};
