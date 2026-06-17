/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0EA5E9', // Sky blue accent
          dark: '#0284C7',
          soft: '#F0F9FF',
        },
        darkBg: '#0F172A', // Slate 900
        darkCard: '#1E293B', // Slate 800
      }
    },
  },
  plugins: [],
}

