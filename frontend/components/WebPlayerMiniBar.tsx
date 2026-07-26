"use client";

import { useRouter } from "next/navigation";
import { isNativeIOS } from "@/lib/nativePlayer";
import { closeWebPlayer, useWebPlayerState } from "@/lib/webPlayerStore";

/**
 * Persistent bar shown whenever the web player is running (audio, and PiP
 * where the browser keeps it floating) but the user has since navigated away
 * from its page. Without this there'd be no way to get back to (or close) a
 * minimized player once its own page - the only place VideoPlayer's own
 * controls exist - has unmounted. Mounted once in AppShell so it survives
 * across every route; the player itself keeps playing regardless (see
 * PersistentVideoPlayer.tsx / webPlayerStore.ts), this is purely a "here's
 * what's still running, tap to return or close it" affordance. Mirrors
 * NativePlayerMiniBar for the iOS native shell.
 */
export function WebPlayerMiniBar() {
  const router = useRouter();
  const { meta, mode } = useWebPlayerState();

  if (isNativeIOS() || !meta || mode !== "mini") return null;

  return (
    <div
      className="fixed inset-x-0 z-40 flex items-center gap-3 border-t border-border bg-surface-elevated/95 px-4 py-2.5 backdrop-blur md:left-64"
      style={{ bottom: "var(--mobile-nav-height, 0px)" }}
    >
      <button
        type="button"
        onClick={() => router.push(`/library/${meta.itemId}`)}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-text-primary"
      >
        <span aria-hidden="true">▶</span>
        <span className="truncate notranslate" translate="no">
          {meta.title}
        </span>
      </button>
      <button
        type="button"
        onClick={closeWebPlayer}
        className="min-h-10 shrink-0 rounded-md border border-border px-3 text-sm font-medium text-text-secondary"
      >
        Schließen
      </button>
    </div>
  );
}
