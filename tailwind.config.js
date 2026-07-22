/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          dark: 'rgb(var(--color-brand-dark) / <alpha-value>)',
          soft: '#F0F9FF',
        },
        // Semantic surface/text tokens — theme-aware via CSS custom properties
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surface2: 'rgb(var(--color-surface-2) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
        edge: 'var(--color-edge)',
        'edge-strong': 'var(--color-edge-strong)',
        overlay: 'var(--color-overlay)',
        'overlay-strong': 'var(--color-overlay-strong)',
        // Back-compat aliases so existing bg-darkBg / bg-darkCard usages
        // automatically become theme-aware without touching every file
        darkBg: 'rgb(var(--color-canvas) / <alpha-value>)',
        darkCard: 'rgb(var(--color-surface) / <alpha-value>)',
        // Redefine the slate scale itself as theme-aware. This codebase uses
        // slate-300..600 as de-facto "muted text" and slate-700..950 as
        // de-facto "surface" tokens throughout — making the scale itself
        // flip with the theme retrofits dark/light support across the whole
        // app without editing every component.
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
      }
    },
  },
  plugins: [],
}
