/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        // This creates a breakpoint that applies UP TO 1900px
        // You can name it whatever you like, e.g., 'until-1900', 'max-1900xl', etc.
        "until-1900": { max: "1900px" },
      },
      colors: {
        "book-primary": "var(--book-primary-color)",
        "book-secondary": "var(--book-secondary-color)",
        "book-tertiary": "var(--book-tertiary-color)",
        "book-quaternary": "var(--book-quaternary-color)",
      },
    },
  },
  plugins: [import("tailwindcss-animate")],
  darkMode: "class",
};
