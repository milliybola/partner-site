import QRCode from 'qrcode';
import { ordersApi } from '../services/ordersApi';
// window.location.origin is 'null' under file:// and differs under tauri:// — resolve
// public assets against document.baseURI instead.
import { publicAsset } from '../../../core/platform';

// No fiscal (OFD) integration exists yet — this links to the OFD portal's homepage as a
// placeholder compliance QR code, not a signed per-receipt verification link. Once the
// backend/cash register integration returns real fiscal data (receipt id, fiscal sign),
// this should become a per-receipt verification URL instead of a fixed one.
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

const OFD_QR_URL = 'https://ofd.soliq.uz';

export interface ReceiptData {
  order_number?: string;
  created_at?: string;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
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
  total_price: number | string;
  payment_method_display?: string;
  payment_method?: string;
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
  const printCopies = parseInt(localStorage.getItem('milliygo_print_copies') || '1', 10) || 1;

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
// includeOfdQr is a temporary either/or choice (no fiscal integration yet — see
// OFD_QR_URL above) offered as two separate print actions rather than a single default.
const buildReceiptHtml = async (receiptData: ReceiptData, includeOfdQr: boolean): Promise<string> => {
  const qrCodeSvg = includeOfdQr
    ? await QRCode.toString(OFD_QR_URL, { type: 'svg', margin: 0, width: 90 }).catch(() => '')
    : '';

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
        ${receiptData.contact_name ? `
        <div class="info-row">
          <span class="info-label">Mijoz:</span>
          <span class="info-value">${esc(receiptData.contact_name)}</span>
        </div>` : ''}
        ${receiptData.contact_phone ? `
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
          <div class="totals-row">
            <span class="info-label">Yetkazib berish:</span>
            <span class="info-value">${Number(receiptData.delivery_fee || 0).toLocaleString('uz-UZ')} UZS</span>
          </div>

          <div class="grand-total-row">
            <span>JAMI:</span>
            <span>${Number(receiptData.total_price).toLocaleString('uz-UZ')} UZS</span>
          </div>

          <div class="info-row" style="margin-top: 4px;">
            <span class="info-label">To'lov turi:</span>
            <span class="info-value bold">${esc(receiptData.payment_method_display || receiptData.payment_method)}</span>
          </div>

          ${receiptData.description ? `
          <div class="info-row" style="margin-top: 3px;">
            <span class="info-label">Izoh:</span>
            <span class="info-value">${esc(receiptData.description)}</span>
          </div>` : ''}
        </div>

        <div class="footer">
          <p class="bold" style="font-size: 11px; margin-bottom: 2px;">XARIDINGIZ UCHUN RAHMAT!</p>
          ${qrCodeSvg ? `
          <div style="display: flex; flex-direction: column; align-items: center; margin-top: 8px;">
            ${qrCodeSvg}
            <p style="margin: 2px 0 0 0; font-size: 8px; color: #000;">Soliq QR kodi</p>
          </div>` : ''}
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
  await printHtmlCopies(await buildReceiptHtml(receiptData, includeOfdQr));
};

// Print the same official receipt layout, but built purely from local data —
// used before the order actually exists on the backend (e.g. reviewing before submit).
export const printReceiptPreview = async (receiptData: ReceiptData, includeOfdQr: boolean): Promise<void> => {
  await printHtmlCopies(await buildReceiptHtml(receiptData, includeOfdQr));
};

export interface PreCheckOrderInput {
  table_number?: string | null;
  total_price: number | string;
  items: Array<{
    product_name?: string;
    name?: string;
    product?: { name?: string; price?: number | string } | null;
    price_at_time_of_order?: string | number;
    quantity: number;
  }>;
}

// Print a simple preliminary (not-yet-paid) receipt built purely from local order data
export const printPreCheck = async (order: PreCheckOrderInput): Promise<void> => {
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
      </body>
    </html>
  `;

  await printHtmlCopies(preCheckHtml);
};
