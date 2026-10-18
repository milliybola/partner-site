# Electron → Tauri v2 migration (Windows)

The desktop app is now a **Tauri v2** shell (`src-tauri/`) around the same Vite/React build that is deployed to the web. Electron files are still in the repo (marked **DEPRECATED**) as a fallback until the first Tauri installer has been tested on a cashier PC.

> Status: the scaffold is complete but has **not been compiled yet**, because Rust is not installed on the machine where this migration was written. `npx tauri info` confirms that the config parses and lists all plugins. The first `npm run tauri:build` on a machine with Rust is the real test.

## 1. What changed

| Electron (`main.js`) | Tauri v2 |
|---|---|
| `BrowserWindow({width:1280,height:800})`, `setMenuBarVisibility(false)` | `src-tauri/tauri.conf.json` → `app.windows[0]` (1280×800, min 400×600, no menu bar by default) |
| `app.commandLine.appendSwitch('kiosk-printing')` (silent receipt printing) | `additionalBrowserArgs: "--kiosk-printing …"` on the WebView2 window (see §5) |
| dev `loadURL('http://localhost:7080')` / prod `loadFile('dist/index.html')` | `build.devUrl` / `build.frontendDist: ../dist` |
| `openDevTools()` in dev | Right click → Inspect (debug builds) |
| `build-desktop.js` (manual copy of the Electron runtime, no installer) | `tauri build` → **NSIS `.exe` and MSI** installers |
| — | **New:** single instance (`tauri-plugin-single-instance`), so a second launch focuses the window instead of double-printing or double-alerting |
| — | **New:** remembers window size and position (`tauri-plugin-window-state`) |
| — | **New:** native Windows toast for new orders (`tauri-plugin-notification`, called from `src/core/platform/index.ts` → `notify()`) |
| — | **New:** links open in the system browser (`tauri-plugin-opener` → `openExternal()`) |
| — | **Optional:** auto-update (`tauri-plugin-updater`, cargo feature `updater`, off by default) |

Installer size goes from about 90 MB (bundled Chromium) to about 5–10 MB, because Tauri uses the system WebView2.

Files:
```
src-tauri/
  Cargo.toml            # crate milliy-partner, lib milliy_partner_lib
  build.rs
  tauri.conf.json       # v2 config: window, bundle (nsis+msi), WebView2 bootstrapper
  capabilities/default.json   # core, notification, opener, window-state permissions
  icons/                # generated from public/logo.png (npm run tauri:icons)
  src/main.rs           # entry, hides console window in release
  src/lib.rs            # plugins + `app_version` command
src/core/platform/index.ts    # isTauri(), notify(), openExternal(), saveBlob(), publicAsset()
```

Frontend changes needed for Tauri:
- **401 redirect.** It used `window.location.href = '/login'`, which shows a blank screen under `tauri://` and `file://`. It now uses `#/login` (HashRouter).
- **Receipt logo.** It used `window.location.origin` and now uses `publicAsset()`.
- **Login logo.** It used `/logo.png` and now uses `./logo.png`.
- **Vite.** Added `clearScreen:false`, `strictPort`, `envPrefix: TAURI_ENV_` and a modern build target.

## 2. One-time setup on a Windows build machine

1. **Microsoft C++ Build Tools.** Download from https://aka.ms/vs/17/release/vs_BuildTools.exe and select the workload **"Desktop development with C++"** (MSVC v143 + Windows 11 SDK).
2. **WebView2 Runtime.** It is preinstalled on Windows 10 (since 1803) and 11. If it is missing, install the Evergreen Bootstrapper from https://developer.microsoft.com/microsoft-edge/webview2/. The installer we build also downloads it automatically (`webviewInstallMode: downloadBootstrapper`).
3. **Rust (via rustup).**
   ```powershell
   winget install --id Rustlang.Rustup -e
   # or download rustup-init.exe from https://rustup.rs
   rustup default stable-msvc
   rustc --version     # needs >= 1.77.2
   ```
   Restart the terminal afterwards so `cargo` is on PATH.
4. **Node 20+** (already present) and project dependencies:
   ```powershell
   cd D:\Milliy\partner-site
   npm install
   npx tauri info      # every line under "Environment" should be green
   ```
5. **For MSI only:** WiX v3 is downloaded automatically by the Tauri CLI. It needs the **VBSCRIPT** Windows optional feature: Settings → System → Optional features → "VBSCRIPT". NSIS is also downloaded automatically.

## 3. Commands

```powershell
npm run tauri:dev          # Vite on :7080 + native window with hot reload
npm run tauri:build        # NSIS + MSI (release)
npm run tauri:build:nsis   # only the .exe installer (recommended for cashiers)
npm run tauri:build:msi    # only the MSI (for IT / GPO deployment)
npm run tauri:icons        # regenerate src-tauri/icons from public/logo.png
```

Output:
```
src-tauri/target/release/bundle/nsis/MilliyGo Hamkor_1.0.0_x64-setup.exe
src-tauri/target/release/bundle/msi/MilliyGo Hamkor_1.0.0_x64_en-US.msi
```
The first build compiles about 400 crates and takes 5–10 minutes. Later builds take under a minute.

NSIS installs per user (`installMode: currentUser`), so no admin rights are needed. Bump `version` in `src-tauri/tauri.conf.json` and `Cargo.toml` for each release; MSI requires a numeric `x.y.z`.

## 4. Code signing (recommended before distribution)
Unsigned installers trigger SmartScreen ("Windows protected your PC"). Get an OV or EV code-signing certificate and add this to `bundle.windows`:
```json
"certificateThumbprint": "<SHA1 thumbprint>", "digestAlgorithm": "sha256", "timestampUrl": "http://timestamp.digicert.com"
```

## 5. Silent receipt printing (must verify on the real printer)
Receipts print through a hidden iframe plus `window.print()` (`src/features/orders/utils/printing.ts`), exactly as before.
- Under Electron, the `kiosk-printing` switch skipped the dialog.
- Under Tauri, the WebView2 window is started with `additionalBrowserArgs: "--kiosk-printing --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"`. The `--disable-features` part repeats Tauri's defaults, because setting `additionalBrowserArgs` replaces them.

**Verify** on a cashier PC with the thermal printer set as the Windows default:
1. Open Sozlamalar → "Sinov cheki" (test receipt).
2. Expected: it prints straight away with no dialog.
3. If WebView2 ignores `--kiosk-printing` and a print dialog appears, the fallback is a Rust command that opens the receipt in a hidden `WebviewWindow` and calls WebView2 `ICoreWebView2_16::PrintAsync` with `ICoreWebView2PrintSettings` (default printer, 80 mm, no UI) through `webview.with_webview(...)`. This needs the `webview2-com` version that matches the `wry` version in `Cargo.lock`. It was intentionally **not** added untested, so that the first build cannot be broken by COM binding mismatches.

## 6. Auto-update (optional)
1. `npx tauri signer generate -w %USERPROFILE%\.tauri\milliy-partner.key`
2. Add the following to `tauri.conf.json`:
   ```json
   "bundle": { "createUpdaterArtifacts": true },
   "plugins": { "updater": { "pubkey": "<content of .key.pub>", "endpoints": ["https://mytizim.uz/desktop/partner/latest.json"] } }
   ```
3. Add `"updater:default"` to `capabilities/default.json`, then run `npm i @tauri-apps/plugin-updater`.
4. Build with `npm run tauri:build -- --features updater`, with `TAURI_SIGNING_PRIVATE_KEY` set.

## 7. Security notes
- `app.security.csp` is `null` for now. The app talks to `https://mytizim.uz`, `wss://mytizim.uz`, Yandex Maps, Google Fonts and image CDNs. The receipt iframe also relies on an inline script, and that inline script would be blocked by the nonces Tauri adds to CSP. Before tightening the CSP, move the receipt print trigger out of the inline script, then set the policy:
  ```
  default-src 'self'; connect-src 'self' https://mytizim.uz wss://mytizim.uz https://*.yandex.ru https://*.yandex.net; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://api-maps.yandex.ru https://*.yandex.ru https://*.yandex.net
  ```
- Receipt HTML now escapes all customer-supplied text (fixed during the redesign).
- Capabilities grant only core, notification, opener (http/https/mailto/tel) and window-state. There is no filesystem or shell access.

## 8. Removing Electron (after Tauri is verified)
```powershell
git rm main.js build-desktop.js
npm uninstall electron electron-builder electron-packager concurrently wait-on
```
Then remove `"main": "main.js"` and the `electron:*` scripts from `package.json`, the `dist-electron` entry from `.gitignore`, and `electron_mirror` from `.npmrc`.
