/**
 * Serializes in-app downloads (saveOfflineInApp) so only one runs at a time.
 * Without this, clicking "In der App speichern" on several items fired
 * concurrent fetches that fought over bandwidth and IndexedDB writes. A
 * module-level singleton (same pattern as activeDownloadsStore.ts) so the
 * queue survives navigation between Mediathek, Aktivität, and a video's
 * detail page - all three surfaces can enqueue the same underlying item.
 */

import { useSyncExternalStore } from "react";

type QueueEntry = { itemId: string; run: () => Promise<void> };

const queue: QueueEntry[] = [];
let runningId: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function processQueue(): void {
  if (runningId !== null) return;
  const next = queue.shift();
  if (!next) return;
  runningId = next.itemId;
  notify();
  next.run().finally(() => {
    runningId = null;
    notify();
    processQueue();
  });
}

/** No-op if the item is already queued or currently downloading. */
export function enqueueDownload(itemId: string, run: () => Promise<void>): void {
  if (runningId === itemId || queue.some((entry) => entry.itemId === itemId)) return;
  queue.push({ itemId, run });
  notify();
  processQueue();
}

/** Removes a not-yet-started item from the queue. Returns false if it was
 * already running (or wasn't queued) - an in-flight download can't be
 * cancelled this way. */
export function cancelQueuedDownload(itemId: string): boolean {
  const index = queue.findIndex((entry) => entry.itemId === itemId);
  if (index === -1) return false;
  queue.splice(index, 1);
  notify();
  return true;
}

function getStatus(itemId: string): "idle" | "queued" | "downloading" {
  if (runningId === itemId) return "downloading";
  if (queue.some((entry) => entry.itemId === itemId)) return "queued";
  return "idle";
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDownloadQueueStatus(itemId: string): "idle" | "queued" | "downloading" {
  return useSyncExternalStore(subscribe, () => getStatus(itemId));
}
