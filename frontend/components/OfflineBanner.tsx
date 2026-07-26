"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

/**
 * Small, non-blocking connectivity indicator - deliberately NOT a full-width
 * banner. Being offline isn't an app-wide error: downloaded content still
 * works fine, so this only ever informs, never blocks layout or takes over
 * the screen. Shares the same `useOnlineStatus()` source of truth as every
 * other connectivity-aware surface (Mediathek availability, the player,
 * download gating) instead of tracking its own online/offline state.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <span className="pointer-events-none flex items-center gap-1.5 rounded-pill border border-border bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary shadow-md">
        <span aria-hidden="true">📶</span>
        Offline
      </span>
    </div>
  );
}
