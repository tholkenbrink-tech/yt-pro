"use client";

import { useEffect, useState } from "react";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  return Boolean(mql?.matches) || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

const DISMISS_KEY = "yt-pro:a2hs-dismissed";

export function AddToHomeScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    setShow(!isStandalone() && !dismissed);
  }, []);

  if (!show) return null;

  return (
    <div className="mx-4 mb-4 rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm dark:border-brand-dark/40 dark:bg-brand-dark/10">
      <p className="font-medium">Zum Home-Bildschirm hinzufügen</p>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        Tippe in Safari auf das Teilen-Symbol und wähle
        &quot;Zum Home-Bildschirm&quot;, um yt-pro wie eine App zu nutzen.
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        className="mt-2 text-xs font-medium text-brand underline dark:text-brand-dark"
      >
        Nicht mehr anzeigen
      </button>
    </div>
  );
}
