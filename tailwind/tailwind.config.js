const path = require('path');
const plugin = require('tailwindcss/plugin');

// the app's theme is an attribute: dark by default, light under data-theme="light"
module.exports = {
  content: [path.join(__dirname, '../app/src/main/assets/index.html')],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [plugin(({ addVariant }) => { addVariant('light', '[data-theme="light"] &'); })],
};
