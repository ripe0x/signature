import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
      },
      colors: {
        background: '#FAFAFA',
        foreground: '#0A0A0A',
        muted: '#737373',
        border: '#E5E5E5',
      },
    },
  },
  plugins: [],
};

export default config;
