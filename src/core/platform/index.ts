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

/** Absolute URL to a file shipped in /public (works on http(s), tauri:// and file://). */
export const publicAsset = (path: string) => {
  const clean = path.replace(/^\//, '');
  try {
    return new URL(clean, document.baseURI).href;
  } catch {
    return `./${clean}`;
  }
};
