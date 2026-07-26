import type { LibraryItem } from "./types";
import { getCachedUserId } from "./currentUser";

/**
 * Persists the last successful *unfiltered* /api/library response so the
 * Mediathek has something real to show on a cold start with no network -
 * not just the items saved for in-app offline playback (offlineStore.ts),
 * but every item the user has ever seen, so a non-downloaded item can still
 * be listed (and correctly greyed out) instead of disappearing the moment
 * the network is unavailable. Deliberately localStorage (small, synchronous)
 * rather than IndexedDB - this is just a cache of what the server last said,
 * never the source of truth for offline playability (that's still
 * offlineStore.ts's IndexedDB "meta" store, read independently per-item by
 * MediaCard via useIsOffline()).
 */
const STORAGE_KEY_PREFIX = "yt-pro:library-snapshot:";

function storageKey(): string {
  const userId = getCachedUserId() ?? "anonymous";
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function saveLibrarySnapshot(items: LibraryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items));
  } catch {
    /* storage full or unavailable (private browsing) - snapshot is just a
       best-effort cache, never required for correctness */
  }
}

export function getLibrarySnapshot(): LibraryItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
