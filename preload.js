// Preload script runs before the renderer is loaded
// Expose protected APIs to the renderer here via contextBridge if needed.
window.addEventListener('DOMContentLoaded', () => {
  console.log('Electron preload script loaded successfully.');
});
