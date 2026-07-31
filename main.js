import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Kept as a fallback for window.print() calls, but the --kiosk-printing switch alone isn't
// reliable across Chromium versions — the renderer instead asks the 'silent-print' IPC
// handler below to print directly via webContents.print({ silent: true }), which is the
// approach Electron's docs actually recommend for a dialog-free print.
app.commandLine.appendSwitch('kiosk-printing');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Remove default menu bar
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:7080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

// Print arbitrary receipt HTML with no OS/print-dialog prompt. Loads the HTML into a
// throwaway hidden window and prints it silently to the default printer, then discards
// the window. `copies` is handled natively by webContents.print() (no need to repeat calls).
ipcMain.handle('silent-print', async (_event, { html, copies = 1 } = {}) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        { silent: true, printBackground: true, copies },
        (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || 'Print failed'));
          }
        }
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.destroy();
    }
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
