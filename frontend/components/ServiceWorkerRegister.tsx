"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // next dev's JS chunk filenames aren't content-hashed the way a
      // production build's are, so the SW's cache-first strategy for
      // /_next/static/* can pin a stale bundle indefinitely across restarts
      // and hard-reloads - actively tear down anything left over from an
      // earlier session instead of registering fresh here.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // A worker already being installed/waiting the moment we attach
        // (skipWaiting() can move it through that phase before this runs) -
        // still worth listening for its statechange.
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            // "activated" while a DIFFERENT worker already controls this
            // page means this is a genuine update, not the first-ever
            // install (which has no prior controller) - the already-loaded
            // JS in this tab is now stale until reloaded.
            if (worker.state === "activated" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        };
        watch(registration.installing);
        registration.addEventListener("updatefound", () => watch(registration.installing));
      })
      .catch(() => {
        /* offline shell simply won't be available - app still works online */
      });
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 md:inset-x-auto md:right-6 md:justify-end"
      style={{ bottom: "calc(var(--mobile-nav-height, 0px) + 1rem)" }}
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-pill border border-accent/30 bg-surface-elevated px-4 py-2.5 text-sm font-medium text-text-primary shadow-xl">
        <span>Neue Version verfügbar</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-9 shrink-0 rounded-pill bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          Neu laden
        </button>
      </div>
    </div>
  );
}
