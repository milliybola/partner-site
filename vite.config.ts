import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: required for the Tauri desktop bundle (and the legacy Electron file:// build).
  base: './',
  // Tauri: keep Rust compiler output visible and fail fast if the port is taken.
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Tauri on Windows) is evergreen Chromium; phones are modern Safari/Chrome.
    target: ['es2021', 'chrome100', 'safari15'],
  },
})
