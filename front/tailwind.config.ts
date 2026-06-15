import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand-primary)',
          secondary: 'var(--brand-secondary)',
        },
        surface: '#f6f7f9',
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.1rem' },
    },
  },
  plugins: [],
};
export default config;
