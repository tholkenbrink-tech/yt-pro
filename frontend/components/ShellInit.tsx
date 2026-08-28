"use client";

import { useEffect } from "react";
import { applyShell } from "@/lib/shell";

/** Re-applies the shell flag after hydration (the blocking inline script in
 * layout.tsx <head> already gets it right for first paint; this covers the
 * case where the Capacitor bridge wasn't on `window` yet) and keeps it in
 * sync if the display mode changes while the app is open. */
export function ShellInit() {
  useEffect(() => {
    applyShell();

    const mql = window.matchMedia?.("(display-mode: standalone)");
    if (!mql) return;
    const onChange = () => applyShell();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return null;
}
