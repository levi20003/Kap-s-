const path = require('path');
const plugin = require('tailwindcss/plugin');

// the app's theme is an attribute: dark by default, light under data-theme="light"
module.exports = {
  content: [path.join(__dirname, '../app/src/main/assets/index.html')],
  corePlugins: { preflight: false },
  // words that also appear in the hand-written CSS; as utilities they would reset transforms without the base layer
  blocklist: ['transform', 'filter', 'backdrop-filter'],
  theme: {
    extend: {
      // emerald, olive and sand come from the season's palette (CSS variables in index.html), the neutral zinc stays
      colors: {
        emerald: { 200: 'rgb(var(--em-200) / <alpha-value>)', 300: 'rgb(var(--em-300) / <alpha-value>)', 500: 'rgb(var(--em-500) / <alpha-value>)', 700: 'rgb(var(--em-700) / <alpha-value>)', 800: 'rgb(var(--em-800) / <alpha-value>)', 900: 'rgb(var(--em-900) / <alpha-value>)' },
        olive: { 300: 'rgb(var(--ol-300) / <alpha-value>)', 400: 'rgb(var(--ol-400) / <alpha-value>)', 500: 'rgb(var(--ol-500) / <alpha-value>)', 600: 'rgb(var(--ol-600) / <alpha-value>)', 700: 'rgb(var(--ol-700) / <alpha-value>)' },
        sand: { 100: 'rgb(var(--sd-100) / <alpha-value>)', 200: 'rgb(var(--sd-200) / <alpha-value>)', 300: 'rgb(var(--sd-300) / <alpha-value>)', 400: 'rgb(var(--sd-400) / <alpha-value>)' },
      },
    },
  },
  plugins: [plugin(({ addVariant }) => { addVariant('light', '[data-theme="light"] &'); })],
};
