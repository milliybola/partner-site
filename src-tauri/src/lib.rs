//! MilliyGo Hamkor desktop shell (Tauri v2).
//!
//! Replaces the Electron `main.js`:
//! - Electron `BrowserWindow 1280x800, no menu bar`  -> `tauri.conf.json > app.windows[main]`
//!   (Tauri windows have no menu bar by default).
//! - Electron `app.commandLine.appendSwitch('kiosk-printing')` -> WebView2
//!   `additionalBrowserArgs: --kiosk-printing` in `tauri.conf.json` (see TAURI_MIGRATION.md
//!   "Silent receipt printing" — must be verified on the target printer).
//! - Electron dev `loadURL(localhost:7080)` / prod `loadFile(dist/index.html)` ->
//!   `build.devUrl` / `build.frontendDist`.
//! - Devtools auto-open in dev -> available via right click > Inspect in debug builds.
//!
//! New desktop features: single instance (prevents double printing / double sound when the
//! cashier double-clicks the shortcut), remembered window size/position, native notifications
//! for new orders (`@tauri-apps/plugin-notification`), opening links in the system browser
//! (`@tauri-apps/plugin-opener`), optional auto-updater (cargo feature `updater`).

use tauri::Manager;

/// Version shown on the Settings screen of the desktop app.
#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        // Must be registered first: focuses the existing window instead of opening a second app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(feature = "updater")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("MilliyGo Hamkor ilovasini ishga tushirishda xatolik");
}
