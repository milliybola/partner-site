import { defineConfig } from 'vitest/config';

// Birlik testlari: `npm test` (localStorage va window kerak — jsdom)
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    // Haqiqiy server manzili kerak emas (API soxtalashtiriladi), lekin env.ts ularsiz ishga tushmaydi
    env: { VITE_API_URL: 'http://test.local/api/', VITE_WS_URL: 'ws://test.local/ws/' },
  },
});
