export type Theme = "system" | "light" | "dark";

const KEY = "yt-pro:theme";

export function getTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * Applies the theme to <html data-theme="..."> so the CSS override rules in
 * globals.css win over prefers-color-scheme. "system" clears the attribute
 * so the @media query takes over again.
 */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function setTheme(theme: Theme) {
  if (typeof localStorage === "undefined") return;
  if (theme === "system") {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, theme);
  }
  applyTheme(theme);
}

/** Inline source used as a blocking <script> in the root layout <head> to
 * avoid a flash of the wrong theme before React hydrates. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
