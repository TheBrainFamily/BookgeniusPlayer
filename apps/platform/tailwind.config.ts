import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "../player/src/**/*.{ts,tsx,css}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        library: {
          mahogany: "hsl(var(--library-mahogany))",
          walnut: "hsl(var(--library-walnut))",
          gold: "hsl(var(--library-gold))",
          "gold-glow": "hsl(var(--library-gold-glow))",
          green: "hsl(var(--library-green))",
          burgundy: "hsl(var(--library-burgundy))",
          parchment: "hsl(var(--library-parchment))",
        },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: { serif: ["Playfair Display", "Times New Roman", "serif"], sans: ["Inter", "system-ui", "sans-serif"] },
      backgroundImage: {
        "gradient-candlelight": "var(--gradient-candlelight)",
        "gradient-bookshelf": "var(--gradient-bookshelf)",
        "gradient-leather": "var(--gradient-leather)",
        "gradient-parchment": "var(--gradient-parchment)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        candleflicker: { "0%, 100%": { opacity: "1", transform: "scale(1)" }, "50%": { opacity: "0.8", transform: "scale(1.05)" } },
        bookglow: { "0%, 100%": { boxShadow: "0 0 10px hsl(var(--library-gold) / 0.3)" }, "50%": { boxShadow: "0 0 20px hsl(var(--library-gold) / 0.5)" } },
        float: { "0%, 100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-5px)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        candleflicker: "candleflicker 3s ease-in-out infinite",
        bookglow: "bookglow 4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
