"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
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

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell simply won't be available - app still works online */
    });
  }, []);

  return null;
}
