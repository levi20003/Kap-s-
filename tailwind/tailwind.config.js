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
      // olive and sand accents for the challenges (Kap-ás Kihívások)
      colors: {
        olive: { 300: '#c9d08f', 400: '#adb86b', 500: '#8d9851', 600: '#6f7840', 700: '#545b31' },
        sand: { 100: '#f4eedf', 200: '#e8dcbd', 300: '#d6c597', 400: '#c0aa70' },
      },
    },
  },
  plugins: [plugin(({ addVariant }) => { addVariant('light', '[data-theme="light"] &'); })],
};
