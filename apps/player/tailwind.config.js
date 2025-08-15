/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "book-primary": "var(--book-primary-color)",
        "book-secondary": "var(--book-secondary-color)",
        "book-tertiary": "var(--book-tertiary-color)",
        "book-quaternary": "var(--book-quaternary-color)",
      },
    },
  },
  darkMode: "class",
};
