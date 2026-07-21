"use client";

import { useEffect } from "react";
import { applyTheme, getTheme } from "@/lib/theme";

/** Re-applies the stored theme after hydration (the blocking inline script
 * in layout.tsx <head> already avoids the flash on first paint; this keeps
 * client-side navigations/back-forward cache in sync). */
export function ThemeInit() {
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return null;
}
