import type { Config } from "tailwindcss";

/**
 * Colours are declared as CSS custom properties in globals.css and referenced
 * here through `rgb(var(--token) / <alpha-value>)`. One definition, themable at
 * runtime, and the high-contrast mode the GIGW guidelines ask for is a matter
 * of swapping the variables rather than rewriting components.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "rgb(var(--bhumi-primary) / <alpha-value>)",
          fg: "rgb(var(--bhumi-primary-fg) / <alpha-value>)",
          soft: "rgb(var(--bhumi-primary-soft) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--bhumi-accent) / <alpha-value>)",
          soft: "rgb(var(--bhumi-accent-soft) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--bhumi-success) / <alpha-value>)",
          soft: "rgb(var(--bhumi-success-soft) / <alpha-value>)",
        },
        warn: {
          DEFAULT: "rgb(var(--bhumi-warn) / <alpha-value>)",
          soft: "rgb(var(--bhumi-warn-soft) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--bhumi-danger) / <alpha-value>)",
          soft: "rgb(var(--bhumi-danger-soft) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--bhumi-info) / <alpha-value>)",
          soft: "rgb(var(--bhumi-info-soft) / <alpha-value>)",
        },
        surface: "rgb(var(--bhumi-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--bhumi-surface-2) / <alpha-value>)",
        ground: "rgb(var(--bhumi-bg) / <alpha-value>)",
        line: "rgb(var(--bhumi-border) / <alpha-value>)",
        ink: "rgb(var(--bhumi-text) / <alpha-value>)",
        muted: "rgb(var(--bhumi-muted) / <alpha-value>)",
        // The confidence ramp - BHUMI's signature visual.
        conf: {
          high: "rgb(var(--conf-high) / <alpha-value>)",
          good: "rgb(var(--conf-good) / <alpha-value>)",
          medium: "rgb(var(--conf-medium) / <alpha-value>)",
          low: "rgb(var(--conf-low) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
        deva: ["var(--font-deva)", "Noto Sans Devanagari", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "0.625rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)",
        raised: "0 4px 12px rgb(15 23 42 / 0.08), 0 1px 3px rgb(15 23 42 / 0.06)",
        overlay: "0 12px 32px rgb(15 23 42 / 0.16)",
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateY(1100%)", opacity: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "stamp-in": {
          "0%": { opacity: "0", transform: "scale(1.6) rotate(-14deg)" },
          "60%": { opacity: "1", transform: "scale(0.94) rotate(-8deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-9deg)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--bhumi-primary) / 0.45)" },
          "70%": { boxShadow: "0 0 0 10px rgb(var(--bhumi-primary) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--bhumi-primary) / 0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        scanline: "scanline 2s ease-in-out infinite",
        "fade-up": "fade-up 200ms ease-out",
        "stamp-in": "stamp-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards",
        "pulse-ring": "pulse-ring 1.4s ease-out 2",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
