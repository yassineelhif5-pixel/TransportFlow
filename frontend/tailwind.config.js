/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Archivo Variable', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Palette de marque (cahier des charges)
        navy: { DEFAULT: '#142337', 950: '#0B1524', 900: '#0F1C2D', 800: '#142337', 700: '#1B2E47', 600: '#24405F' },
        brand: { DEFAULT: '#236EBE', 600: '#1D5FA6', 400: '#4A8BD4', 100: '#DCE9F7' },
        cyan: { DEFAULT: '#2CAABF', 400: '#4FC0D2', 100: '#D6F1F5' },
        go: { DEFAULT: '#2A9B64', 400: '#3DB97C', 100: '#D7F0E3' },
        mist: '#F4F7FA',
        warn: { DEFAULT: '#D99A2B', 100: '#FBEFD6' },
        stop: { DEFAULT: '#D6455A', 100: '#FADDE2' },
        // Jetons sémantiques pilotés par les variables CSS (thème clair / sombre)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 0 rgb(var(--shadow) / 0.04), 0 8px 24px -12px rgb(var(--shadow) / 0.18)',
        lift: '0 18px 48px -18px rgb(var(--shadow) / 0.45)',
        glow: '0 0 0 1px rgb(44 170 191 / 0.35), 0 0 24px -4px rgb(44 170 191 / 0.45)',
      },
      keyframes: {
        'toast-in': { from: { opacity: 0, transform: 'translateY(8px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        'modal-in': { from: { opacity: 0, transform: 'translateY(10px) scale(.985)' }, to: { opacity: 1, transform: 'none' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'dash-run': { to: { strokeDashoffset: '-48' } },
        pulse2: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
      },
      animation: {
        'toast-in': 'toast-in .22s cubic-bezier(.2,.8,.2,1)',
        'modal-in': 'modal-in .22s cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in .18s ease-out',
        shimmer: 'shimmer 1.4s infinite',
        'dash-run': 'dash-run 1.6s linear infinite',
        pulse2: 'pulse2 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
