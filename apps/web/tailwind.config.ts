import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'tg-bg': 'var(--tg-theme-bg-color, #0f172a)',
        'tg-secondary-bg': 'var(--tg-theme-secondary-bg-color, #1e293b)',
        'tg-text': 'var(--tg-theme-text-color, #f8fafc)',
        'tg-hint': 'var(--tg-theme-hint-color, #94a3b8)',
        'tg-link': 'var(--tg-theme-link-color, #2481cc)',
        'tg-button': 'var(--tg-theme-button-color, #2481cc)',
        'tg-button-text': 'var(--tg-theme-button-text-color, #ffffff)',
      },
    },
  },
  plugins: [],
};

export default config;
