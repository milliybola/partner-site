/**
 * Thin platform layer so the same React build runs in:
 *   - a normal browser / phone (web deploy, Vercel)
 *   - the Tauri v2 Windows desktop app (src-tauri/)
 *
 * Tauri plugins are loaded lazily via dynamic import so the web bundle never
 * breaks if they're absent at runtime.
 */

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** Ask for OS notification permission (no-op if unsupported). */
export const ensureNotificationPermission = async (): Promise<boolean> => {
  try {
    if (isTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      if (await n.isPermissionGranted()) return true;
      return (await n.requestPermission()) === 'granted';
    }
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
};

/** Show a system notification (desktop app: native toast; browser: Web Notification). */
export const notify = async (title: string, body?: string) => {
  try {
    if (isTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      if (!(await n.isPermissionGranted())) return;
      n.sendNotification({ title, body });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: './logo.png' });
    }
  } catch {
    /* notifications are best-effort */
  }
};

/** Open a URL in the system browser (desktop) or a new tab (web). */
export const openExternal = async (url: string) => {
  if (isTauri()) {
    try {
      const o = await import('@tauri-apps/plugin-opener');
      await o.openUrl(url);
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Save a Blob (Excel exports). In the desktop app WebView2 handles
 * <a download> natively and saves into the user's Downloads folder, so the
 * same code path works for both platforms.
 */
export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Kassa kompyuteridagi printer agenti (printer-agent/agent.mjs) manzili */
export const PRINTER_AGENT_URL = 'http://127.0.0.1:9101';

/** Agent ishlayaptimi (qisqa timeout). Ishlamasa — null. */
export const pingPrinterAgent = async (): Promise<{ version: string } | null> => {
  try {
    const r = await fetch(`${PRINTER_AGENT_URL}/health`, { signal: AbortSignal.timeout(1500) });
    const j = (await r.json()) as { ok?: boolean; version?: string };
    return j.ok ? { version: j.version ?? '' } : null;
  } catch {
    return null;
  }
};

/** Windows'ga o'rnatilgan printerlar (desktop ilova yoki printer agenti; ikkalasi yo'q bo'lsa — bo'sh ro'yxat). */
export const listPrinters = async (): Promise<string[]> => {
  if (!isTauri()) {
    try {
      const r = await fetch(`${PRINTER_AGENT_URL}/printers`, { signal: AbortSignal.timeout(4000) });
      const j = (await r.json()) as { ok?: boolean; printers?: string[] };
      return j.ok ? (j.printers ?? []) : [];
    } catch {
      return [];
    }
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string[]>('printer_list');
  } catch {
    return [];
  }
};

const toBase64 = (data: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Brauzer: baytlarni kompyuterdagi printer agentiga yuboradi. Xatoda — Error(matn). */
const sendViaAgent = async (target: Record<string, unknown>, data: Uint8Array): Promise<void> => {
  let res: Response;
  try {
    res = await fetch(`${PRINTER_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, data: toBase64(data) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Printer agenti ishlamayapti. Kassa kompyuterida printer-agent'ni ishga tushiring.");
  }
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !j?.ok) throw new Error(j?.error || "Printerga yuborib bo'lmadi");
};

/** ESC/POS baytlarini printerga to'g'ridan-to'g'ri yuborish (desktop ilova yoki printer agenti). Xatoda — Error(matn). */
export const sendToPrinter = async (device: import('../lib/printerConfig').PrinterDevice, data: Uint8Array): Promise<void> => {
  const target =
    device.kind === 'network'
      ? { kind: 'network', host: device.host?.trim() ?? '', port: device.port || 9100 }
      : { kind: 'system', name: device.name ?? '' };
  if (!isTauri()) return sendViaAgent(target, data);
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    await invoke('printer_send', { target, data: Array.from(data) });
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : "Printerga yuborib bo'lmadi", { cause: e });
  }
};

/** Absolute URL to a file shipped in /public (works on http(s), tauri:// and file://). */
export const publicAsset = (path: string) => {
  const clean = path.replace(/^\//, '');
  try {
    return new URL(clean, document.baseURI).href;
  } catch {
    return `./${clean}`;
  }
};
