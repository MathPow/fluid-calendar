import tailwindcssForms from "@tailwindcss/forms";
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class", "[data-theme='dark']"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        serif: ["var(--font-serif)", "Georgia", "ui-serif", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Client tint — the one "cold" colour. 400 for tiles/avatars,
           100 for the current-step chip. Never used for a status. */
        tint: {
          DEFAULT: "hsl(var(--tint-400))",
          soft: "hsl(var(--tint-100))",
          foreground: "hsl(var(--tint-foreground))",
        },
        /* Warm state colours — reserved for statuses. */
        positive: {
          DEFAULT: "hsl(var(--positive))",
          foreground: "hsl(var(--positive-foreground))",
        },
        pending: {
          DEFAULT: "hsl(var(--pending))",
          foreground: "hsl(var(--pending-foreground))",
        },
        negative: {
          DEFAULT: "hsl(var(--negative))",
          foreground: "hsl(var(--negative-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        tile: "30px",
        chip: "12px",
      },
      boxShadow: {
        tile: "var(--shadow-tile)",
        float: "var(--shadow-float)",
      },
      letterSpacing: {
        label: "0.08em",
        display: "-0.03em",
        title: "-0.015em",
      },
      fontSize: {
        etiquette: ["11px", { lineHeight: "1", letterSpacing: "0.08em" }],
        libelle: ["13px", { lineHeight: "1.25" }],
        corps: ["15px", { lineHeight: "1.5" }],
        rangee: ["16px", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        tuile: ["20px", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        section: ["32px", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
        chiffre: ["40px", { lineHeight: "1", letterSpacing: "-0.02em" }],
        affiche: ["96px", { lineHeight: "0.9", letterSpacing: "-0.03em" }],
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssForms],
};

export default config;
