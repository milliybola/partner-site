// DEPRECATED: Electron packaging is replaced by Tauri v2 (see src-tauri/ and TAURI_MIGRATION.md).
// Kept only as a fallback until the Tauri build is verified on a cashier PC. Remove afterwards
// together with the electron, electron-builder, electron-packager, concurrently and wait-on devDependencies.
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Skip the print preview dialog and send window.print() straight to the OS default printer.
// (An earlier attempt to print via webContents.print({ silent: true }) from the main process
// consistently failed with "Invalid printer settings" on some printer/driver combinations
// regardless of any option tried — deviceName, custom pageSize, silent on/off. This simpler
// approach is what the renderer's printing.ts actually uses now for both Electron and browser.)
app.commandLine.appendSwitch('kiosk-printing');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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
