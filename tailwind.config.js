module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        // This creates a breakpoint that applies UP TO 1900px
        // You can name it whatever you like, e.g., 'until-1900', 'max-1900xl', etc.
        "until-1900": { max: "1900px" },
      },
    },
  },
  plugins: [],
  darkMode: "class",
};
