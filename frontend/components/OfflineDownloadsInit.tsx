"use client";

import { useEffect } from "react";
import { reconcileInterruptedSaves } from "@/lib/offlineStore";

/** Runs once per app load: any in-app offline save still marked "saving" in
 * IndexedDB was mid-flight when the tab/app was last torn down (reload,
 * force-close, crash) - the fetch behind it no longer exists, so flip it to
 * "interrupted" instead of leaving a stale "saving" that nothing will ever
 * finish. Its chunks stay in place so retrying resumes rather than
 * restarting. Renders nothing - this is bookkeeping only. */
export function OfflineDownloadsInit() {
  useEffect(() => {
    reconcileInterruptedSaves().catch(() => {
      /* best-effort - a missed reconciliation just means one entry looks
         like it's still "saving" until the next reload */
    });
  }, []);

  return null;
}
