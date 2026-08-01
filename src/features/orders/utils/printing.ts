import { ordersApi } from '../services/ordersApi';

declare global {
  interface Window {
    electronAPI?: {
      // Prints HTML silently (no OS print dialog) via the Electron main process.
      silentPrint: (payload: { html: string; copies: number }) => Promise<void>;
    };
  }
}

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

// Send an HTML document to the printer, silently and without any OS/browser print dialog.
const printHtmlCopies = async (html: string): Promise<void> => {
  const printCopies = parseInt(localStorage.getItem('milliygo_print_copies') || '1', 10) || 1;

  // Desktop app — print via the main process (webContents.print({ silent: true })).
  // Reliable across Chromium versions, unlike the browser-only --kiosk-printing switch below.
  if (window.electronAPI?.silentPrint) {
    try {
      await window.electronAPI.silentPrint({ html, copies: printCopies });
    } catch (err) {
      console.error("Silent print failed:", err);
    }
    return;
  }

  // Plain browser fallback — relies on the browser itself being launched with the
  // --kiosk-printing flag (see Settings page instructions) for a dialog-free print.
  //
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

// Appends a self-triggering print script to an HTML document — used only for the
// browser/iframe fallback above. The Electron path prints the raw `html` as-is, since
// the main process triggers the print itself (adding this script there would double-print).
const withAutoPrintScript = (html: string): string => {
  const autoPrintScript = `
    <script>
      window.onload = function() {
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
const buildReceiptHtml = (receiptData: ReceiptData): string => {
  const itemsHtml = (receiptData.items || []).map((item: any) => {
    const productName = item.product_name || item.name || item.product?.name || "Noma'lum taom";
    const unitPrice = Number(item.unit_price || 0).toLocaleString('uz-UZ');
    const lineTotal = Number(item.line_total || 0).toLocaleString('uz-UZ');
    return `
      <div style="margin-bottom: 6px; font-size: 11px; font-weight: 500; color: #000;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: #000;">
          <span>${productName}</span>
          <span>${lineTotal} UZS</span>
        </div>
        <div style="font-size: 10px; color: #000; font-weight: 500; margin-top: 1px;">
          ${unitPrice} UZS x ${item.quantity}
        </div>
      </div>
    `;
  }).join('');

  const formattedDate = receiptData.created_at || new Date().toLocaleString('uz-UZ');

  const receiptHtml = `
    <html>
      <head>
        <title>Chek #${receiptData.order_number}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            width: 74mm;
            margin: 0 auto;
            padding: 8px 4px;
            color: #000;
            background: #fff;
            line-height: 1.35;
            font-weight: 500;
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
              <img src="${window.location.origin}/logo_bw.png" alt="MilliyGo Logo" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;" />
              
              <span style="font-size: 15px; font-weight: 700; letter-spacing: 0.5px; color: #000;">MilliyGo</span>
            </div>
            |
            <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #000; text-transform: uppercase; text-align: left;">${receiptData.partner_name || ''}</h2>
          </div>
          <div style="font-size: 10px; color: #000; font-weight: 500; margin-top: 2px; line-height: 1.2; text-align: center;">
            <p style="margin: 1px 0;">${[receiptData.partner_address, receiptData.partner_phone].filter(Boolean).join(' | ')}</p>
          </div>
        </div>

        <div class="divider"></div>

        ${receiptData.order_number ? `
        <div class="info-row">
          <span class="info-label">Buyurtma:</span>
          <span class="info-value bold">${receiptData.order_number}</span>
        </div>` : ''}
        <div class="info-row">
          <span class="info-label">Sana:</span>
          <span class="info-value">${formattedDate}</span>
        </div>
        ${receiptData.contact_name ? `
        <div class="info-row">
          <span class="info-label">Mijoz:</span>
          <span class="info-value">${receiptData.contact_name}</span>
        </div>` : ''}
        ${receiptData.contact_phone ? `
        <div class="info-row">
          <span class="info-label">Tel:</span>
          <span class="info-value">${receiptData.contact_phone}</span>
        </div>` : ''}
        
        ${receiptData.delivery_type_display ? `
        <div class="info-row">
          <span class="info-label">Turi:</span>
          <span class="info-value">${receiptData.delivery_type_display}</span>
        </div>` : ''}
        ${receiptData.table_number ? `
        <div class="info-row">
          <span class="info-label">Stol:</span>
          <span class="info-value bold">${receiptData.table_number}-stol</span>
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
            <span class="info-value bold">${receiptData.payment_method_display || receiptData.payment_method || ''}</span>
          </div>

          ${receiptData.description ? `
          <div class="info-row" style="margin-top: 3px;">
            <span class="info-label">Izoh:</span>
            <span class="info-value">${receiptData.description}</span>
          </div>` : ''}
        </div>

        <div class="footer">
          <p class="bold" style="font-size: 11px; margin-bottom: 2px;">XARIDINGIZ UCHUN RAHMAT!</p>
          <p style="margin: 0; font-weight: 700;">milliyapp.uz</p>

        </div>
      </body>
    </html>
  `;

  return receiptHtml;
};

// Print the full backend-generated receipt for an existing (already created) order
export const printReceipt = async (orderUuid: string): Promise<void> => {
  const responseData = await ordersApi.getOrderReceipt(orderUuid);
  const receiptData = responseData.data || responseData;
  await printHtmlCopies(buildReceiptHtml(receiptData));
};

// Print the same official receipt layout, but built purely from local data —
// used before the order actually exists on the backend (e.g. reviewing before submit).
export const printReceiptPreview = async (receiptData: ReceiptData): Promise<void> => {
  await printHtmlCopies(buildReceiptHtml(receiptData));
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
  const tableLabel = order.table_number ? `stol "${order.table_number}"` : '';

  const preCheckHtml = `
    <html>
      <head>
        <title>Pre-chek</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 74mm;
            margin: 0 auto;
            padding: 70px 6px 8px 6px;
            color: #000;
            background: #fff;
            font-size: 12px;
            font-weight: 700;
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
                <span style="font-size: 12px;">${productName}</span>
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
