import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#123B5D", deep: "#0D2E4A", dark: "#081D32" },
        lemon: { DEFAULT: "#DCE94F", bright: "#E4EF59" },
        emerald: "#16724A",
        obsidian: "#17324B",
        gold: "#DCE94F",
        surface: "var(--surface)",
        canvas: "var(--bg)",
        foreground: "var(--text)",
        muted: "var(--muted)",
        border: "var(--border)"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-ethiopic)", "system-ui", "sans-serif"],
        heading: ["var(--font-manrope)", "var(--font-inter)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "var(--shadow)",
        raised: "var(--shadow-raised)"
      },
      borderRadius: {
        "mpa-sm": "var(--radius-sm)",
        "mpa-md": "var(--radius-md)",
        "mpa-lg": "var(--radius-lg)"
      }
    }
  },
  plugins: []
};
export default config;
