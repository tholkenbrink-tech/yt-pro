import type { LibraryItem } from "./types";

export type MediaState =
  | "new"
  | "started"
  | "watched"
  | "auto_prepared"
  | "expiring_soon"
  | "downloaded_to_device";

/** German display labels for each derived Mediathek state, same
 * map+accessor pattern as `lib/statusLabels.ts`. */
export const MEDIA_STATE_LABELS: Record<MediaState, string> = {
  new: "Neu",
  started: "Begonnen",
  watched: "Angesehen",
  auto_prepared: "Automatisch vorbereitet",
  expiring_soon: "Läuft bald ab",
  downloaded_to_device: "Auf iPhone geladen",
};

export function mediaStateLabel(state: MediaState): string {
  return MEDIA_STATE_LABELS[state] ?? state;
}

const EXPIRING_SOON_MS = 6 * 60 * 60 * 1000;

/**
 * The backend gives raw item fields (status/isAutomaticallyPrepared/
 * expiresAt/progress/keepOnServer), not a precomputed Mediathek label - this
 * derives a single display state client-side, in priority order that
 * matches what a user would want to notice first (soon-to-expire and
 * device-download states are the most actionable).
 */
export function deriveMediaState(item: LibraryItem): MediaState {
  if (item.status === "downloaded_to_device") return "downloaded_to_device";

  if (item.expiresAt && !item.keepOnServer) {
    const remaining = new Date(item.expiresAt).getTime() - Date.now();
    if (remaining > 0 && remaining <= EXPIRING_SOON_MS) return "expiring_soon";
  }

  if (item.progress?.completed) return "watched";
  if (item.progress && item.progress.positionSeconds > 0) return "started";
  if (item.isAutomaticallyPrepared) return "auto_prepared";
  return "new";
}
