import type { Config } from "tailwindcss";

const config: Config = {
  // New components use CSS-custom-property-backed color tokens (bg-surface,
  // text-primary, bg-accent, ...) whose values already flip between light/
  // dark/manual-override in globals.css, so they don't need Tailwind's
  // `dark:` variant at all. Phase 1 components still using the `dark:`
  // variant keep responding to the OS preference via "media" - it's an
  // acceptable limitation for code not yet migrated to the new tokens.
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Kept so existing Phase 1 classNames (bg-brand, text-brand-dark, ...)
        // keep working without a mass find/replace; new components should
        // prefer the token names below.
        brand: {
          DEFAULT: "#6366f1",
          dark: "#818cf8",
        },
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-elevated": "var(--color-surface-elevated)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        border: "var(--color-border)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          pressed: "var(--color-accent-pressed)",
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        info: "var(--color-info)",
        "progress-track": "var(--color-progress-track)",
        overlay: "var(--color-overlay)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Inter",
          "sans-serif",
        ],
      },
      fontSize: {
        "page-title": ["1.75rem", { lineHeight: "2.1rem", fontWeight: "700" }],
        "section-title": ["1.375rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "card-title": ["1.0625rem", { lineHeight: "1.375rem", fontWeight: "600" }],
        meta: ["0.8125rem", { lineHeight: "1.125rem" }],
      },
      borderRadius: {
        sm: "10px",
        md: "16px",
        lg: "22px",
        pill: "9999px",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
    },
  },
  plugins: [],
};

export default config;
