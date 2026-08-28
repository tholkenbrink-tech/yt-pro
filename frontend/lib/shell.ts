import { Capacitor } from "@capacitor/core";

/**
 * Which kind of shell the page is running in, as far as the *bottom edge of
 * the screen* is concerned:
 *
 * - "app"     - an installed PWA or the Capacitor iOS shell. The page owns
 *               the bottom of the screen, so fixed bottom chrome has to keep
 *               clear of the home indicator itself.
 * - "browser" - an ordinary browser tab. The browser's own toolbar sits
 *               below the page and already clears the home indicator.
 *
 * Why this isn't just a `(display-mode: standalone)` media query in CSS: the
 * Capacitor shell is a plain WKWebView, which reports display-mode "browser"
 * even though it is very much the app - it would lose its safe-area padding.
 */
export type Shell = "app" | "browser";

export function detectShell(): Shell {
  if (typeof window === "undefined") return "browser";

  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return "app";
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "app";
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return "app";
  if (Capacitor.isNativePlatform()) return "app";

  return "browser";
}

export function applyShell(shell: Shell = detectShell()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.shell = shell;
}

/**
 * Runs before first paint (see layout.tsx <head>) so the bottom nav is laid
 * out correctly straight away instead of shifting after hydration. Reads the
 * Capacitor bridge off the global rather than the import, since this string
 * is inlined into <head> ahead of any bundle. ShellInit re-runs the real
 * detection after hydration as a safety net.
 */
export const SHELL_INIT_SCRIPT =
  `(function(){try{var n=window.navigator,m=window.matchMedia,c=window.Capacitor;` +
  `var app=n.standalone===true` +
  `||!!(m&&m("(display-mode: standalone)").matches)` +
  `||!!(m&&m("(display-mode: fullscreen)").matches)` +
  `||!!(c&&c.isNativePlatform&&c.isNativePlatform());` +
  `document.documentElement.dataset.shell=app?"app":"browser";}catch(e){}})();`;
