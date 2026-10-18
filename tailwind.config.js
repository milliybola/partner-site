/** @type {import('tailwindcss').Config} */
// MilliyGo Partner — design tokens.
// Light-only UI (MilliyGo brief). Semantic tokens live in src/index.css as CSS
// variables so they can be tuned in one place.
//
// Back-compat: older screens use `slate-*`, `darkBg`, `darkCard`, `emerald-*`,
// `rose-*`, `amber-*` utilities. The slate scale and the 300/400 shades of the
// accent palettes are remapped below so legacy markup stays legible on white.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        Outfit: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          dark: 'rgb(var(--color-brand-dark) / <alpha-value>)',
          bright: 'rgb(var(--color-brand-bright) / <alpha-value>)',
          soft: 'rgb(var(--color-brand-soft) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--color-gold) / <alpha-value>)',
          soft: 'rgb(var(--color-gold-soft) / <alpha-value>)',
          ink: 'rgb(var(--color-gold-ink) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          soft: 'rgb(var(--color-danger-soft) / <alpha-value>)',
          ink: 'rgb(var(--color-danger-ink) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
          ink: 'rgb(var(--color-warning-ink) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          soft: 'rgb(var(--color-info-soft) / <alpha-value>)',
        },
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surface2: 'rgb(var(--color-surface-2) / <alpha-value>)',
        field: 'rgb(var(--color-field) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
        edge: 'rgb(var(--color-edge) / <alpha-value>)',
        'edge-strong': 'rgb(var(--color-edge-strong) / <alpha-value>)',
        overlay: 'var(--color-overlay)',
        'overlay-strong': 'var(--color-overlay-strong)',
        // Legacy aliases
        darkBg: 'rgb(var(--color-canvas) / <alpha-value>)',
        darkCard: 'rgb(var(--color-surface) / <alpha-value>)',
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
        // Darken the light shades legacy code used as "text on dark" so they
        // stay readable on white surfaces.
        emerald: { 300: '#15803D', 400: '#16A34A' },
        rose: { 300: '#DC2626', 400: '#EF4444' },
        amber: { 300: '#B45309', 400: '#D97706' },
        sky: { 300: '#0369A1', 400: '#0284C7' },
        indigo: { 300: '#4338CA', 400: '#4F46E5' },
        violet: { 300: '#6D28D9', 400: '#7C3AED' },
        purple: { 300: '#7E22CE', 400: '#9333EA' },
        blue: { 300: '#1D4ED8', 400: '#2563EB' },
        orange: { 300: '#C2410C', 400: '#EA580C' },
        teal: { 300: '#0F766E', 400: '#0D9488' },
        cyan: { 300: '#0E7490', 400: '#0891B2' },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,17,17,0.04)',
        pop: '0 8px 24px rgba(17,17,17,0.08), 0 2px 6px rgba(17,17,17,0.04)',
        sheet: '0 -8px 32px rgba(17,17,17,0.12)',
      },
      letterSpacing: {
        tightest: '-0.4px',
      },
      screens: {
        xs: '420px',
      },
    },
  },
  plugins: [],
};
