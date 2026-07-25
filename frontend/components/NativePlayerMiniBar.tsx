"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNativeIOS } from "@/lib/nativePlayer";
import { closeNativePlayer, registerNativePlayerRouter, useNativePlayerState } from "@/lib/nativePlayerStore";

/**
 * Persistent bar shown whenever the native player is running on a page the
 * user has since navigated away from. Without this there'd be no way to
 * get back to (or close) a minimized player once its own page - the only
 * place NativeVideoPlayer's own controls exist - has unmounted. Mounted
 * once in AppShell so it survives across every route; the player itself
 * keeps playing regardless (see nativePlayerStore.ts), this is purely a
 * "here's what's still running, tap to return or close it" affordance.
 */
export function NativePlayerMiniBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { meta, isPresented } = useNativePlayerState();

  // The store can't call the App Router's useRouter() hook itself (it's a
  // plain module) - registering the instance here is what lets a
  // pipRestoreRequested event navigate back to the video's page.
  useEffect(() => {
    registerNativePlayerRouter(router);
  }, [router]);

  if (!isNativeIOS() || !isPresented || !meta) return null;
  // NativeVideoPlayer's own controls (including its close button) already
  // cover this case when the video's own page is what's showing.
  if (pathname === `/library/${meta.itemId}`) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 flex items-center gap-3 border-t border-border bg-surface-elevated/95 px-4 py-2.5 backdrop-blur md:left-64"
      style={{ bottom: "var(--mobile-nav-height, 0px)" }}
    >
      <button
        type="button"
        onClick={() => router.push(`/library/${meta.itemId}`)}
        className="flex min-h-10 flex-1 items-center gap-2 text-left text-sm font-medium text-text-primary"
      >
        <span aria-hidden="true">▶</span>
        <span className="truncate notranslate" translate="no">
          {meta.title}
        </span>
      </button>
      <button
        type="button"
        onClick={closeNativePlayer}
        className="min-h-10 rounded-md border border-border px-3 text-sm font-medium text-text-secondary"
      >
        Schließen
      </button>
    </div>
  );
}
