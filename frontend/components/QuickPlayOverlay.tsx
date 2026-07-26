"use client";

import { closeQuickPlay, useQuickPlayItem } from "@/lib/quickPlayStore";
import { VideoPlayer } from "./VideoPlayer";

/** Renders whatever item quickPlayStore currently holds as a full-screen
 * overlay on top of the current page - see quickPlayStore's doc comment for
 * why this exists instead of always navigating to the video's own page. */
export function QuickPlayOverlay() {
  const item = useQuickPlayItem();
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background">
      <div className="flex items-center justify-between gap-3 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <p className="min-w-0 flex-1 truncate text-card-title notranslate" translate="no">
          {item.title}
        </p>
        <button
          type="button"
          onClick={closeQuickPlay}
          aria-label="Schließen"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 px-4 pb-4">
        <VideoPlayer
          itemId={item.itemId}
          title={item.title}
          channelName={item.channelName}
          thumbnail={item.thumbnailPath}
          autoPlay
        />
      </div>
    </div>
  );
}
