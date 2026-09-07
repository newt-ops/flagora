import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'tg-bg': 'var(--bg-color, var(--tg-theme-bg-color, #ffffff))',
        'tg-secondary-bg': 'var(--secondary-bg-color, var(--tg-theme-secondary-bg-color, #f4f4f5))',
        'tg-text': 'var(--text-color, var(--tg-theme-text-color, #000000))',
        'tg-hint': 'var(--hint-color, var(--tg-theme-hint-color, #707579))',
        'tg-link': 'var(--link-color, var(--tg-theme-link-color, #2481cc))',
        'tg-button': 'var(--button-color, var(--tg-theme-button-color, #2481cc))',
        'tg-button-text': 'var(--button-text-color, var(--tg-theme-button-text-color, #ffffff))',
        'tg-header-bg': 'var(--header-bg-color, var(--tg-theme-header-bg-color, #ffffff))',
        'tg-accent': 'var(--accent-text-color, var(--tg-theme-accent-text-color, #2481cc))',
        'tg-section': 'var(--section-bg-color, var(--tg-theme-section-bg-color, #ffffff))',
        'tg-separator': 'var(--section-separator-color, var(--tg-theme-section-separator-color, rgba(128, 128, 128, 0.16)))',
      },
    },
  },
  plugins: [],
};

export default config;
