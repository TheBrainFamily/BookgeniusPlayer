/* global module */
module.exports = {
  plugins: {
    "postcss-nesting": {},
    "@tailwindcss/postcss": {}, // Tells PostCSS to use the Tailwind plugin
    autoprefixer: {}, // Optional but recommended for browser compatibility
  },
};
