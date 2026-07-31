// Preload script runs before the renderer is loaded.
// Written as CommonJS (.cjs) deliberately — Electron's sandboxed preload context
// doesn't reliably support ESM `import`, regardless of the project's "type": "module".
const { contextBridge, ipcRenderer } = require('electron');

// Lets the renderer print HTML silently (no OS print dialog) via the main process,
// used by src/features/orders/utils/printing.ts when running inside the desktop app.
contextBridge.exposeInMainWorld('electronAPI', {
  silentPrint: (payload) => ipcRenderer.invoke('silent-print', payload),
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('Electron preload script loaded successfully.');
});
