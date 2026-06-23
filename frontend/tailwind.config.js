/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        hpa: {
          // Azul marino profundo — autoridad financiera
          950: '#030B1A',
          900: '#071428',
          800: '#0D2147',
          700: '#122D5E',
          600: '#1A3F7E',
          500: '#2252A0',
          // Dorado — rendimiento y premium
          gold: '#C9A84C',
          'gold-light': '#E8CC7A',
          'gold-dark': '#9C7B2E',
          // Esmeraldas — positivo, activo
          green: '#10B981',
          'green-dark': '#059669',
          // Rojo operativo
          red: '#EF4444',
          'red-dark': '#DC2626',
          // Ámbar — alertas
          amber: '#F59E0B',
          // Neutros
          'slate-1': '#F8FAFC',
          'slate-2': '#F1F5F9',
          'slate-3': '#E2E8F0',
          'slate-4': '#CBD5E1',
          'slate-5': '#94A3B8',
          'slate-6': '#64748B',
          'slate-7': '#475569',
          'slate-8': '#334155',
          'slate-9': '#1E293B',
        }
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(3,11,26,0.08), 0 1px 2px -1px rgba(3,11,26,0.04)',
        'card-md': '0 4px 6px -1px rgba(3,11,26,0.08), 0 2px 4px -2px rgba(3,11,26,0.04)',
        'card-lg': '0 10px 15px -3px rgba(3,11,26,0.08), 0 4px 6px -4px rgba(3,11,26,0.04)',
        'glow-gold': '0 0 20px rgba(201,168,76,0.25)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      }
    }
  },
  plugins: []
}
