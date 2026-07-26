/**
 * Reactive cache of "is this item saved offline in-app" (offlineStore.ts's
 * IndexedDB is the source of truth, this is just a live view over it) so
 * every mounted surface for the same item - the Mediathek list row and a
 * video's own detail page - reflects a download/removal the instant it
 * happens elsewhere, instead of only refreshing on next mount like the
 * plain useEffect+useState reads this replaces.
 */

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { isOffline } from "./offlineStore";

const statusByItem = new Map<string, boolean>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function setOfflineStatus(itemId: string, value: boolean): void {
  statusByItem.set(itemId, value);
  notify();
}

function getOfflineStatus(itemId: string): boolean | undefined {
  return statusByItem.get(itemId);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read of an item's offline-in-app status. Unknown items are
 * treated as `false` until the IndexedDB lookup resolves, matching the
 * previous default of the local `useState(false)` this replaces. */
export function useIsOffline(itemId: string): boolean {
  const status = useSyncExternalStore(subscribe, () => getOfflineStatus(itemId));

  useEffect(() => {
    if (statusByItem.has(itemId)) return;
    let cancelled = false;
    isOffline(itemId).then((value) => {
      if (!cancelled) setOfflineStatus(itemId, value);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return status ?? false;
}
