/**
 * Serializes in-app downloads (saveOfflineInApp) so only one runs at a time.
 * Without this, clicking "In der App speichern" on several items fired
 * concurrent fetches that fought over bandwidth and IndexedDB writes. A
 * module-level singleton (same pattern as activeDownloadsStore.ts) so the
 * queue survives navigation between Mediathek, Aktivität, and a video's
 * detail page - all three surfaces can enqueue the same underlying item.
 */

import { useSyncExternalStore } from "react";

export interface QueuedDownloadInfo {
  itemId: string;
  title: string;
  thumbnail?: string;
}

type QueueEntry = QueuedDownloadInfo & { run: (signal: AbortSignal) => Promise<void> };

const queue: QueueEntry[] = [];
let runningId: string | null = null;
let runningInfo: QueuedDownloadInfo | null = null;
let runningController: AbortController | null = null;
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

function processQueue(): void {
  if (runningId !== null) return;
  const next = queue.shift();
  if (!next) return;
  const { run, ...info } = next;
  runningId = info.itemId;
  runningInfo = info;
  runningController = new AbortController();
  notify();
  run(runningController.signal).finally(() => {
    runningId = null;
    runningInfo = null;
    runningController = null;
    notify();
    processQueue();
  });
}

/** No-op if the item is already queued or currently downloading. */
export function enqueueDownload(
  itemId: string,
  run: (signal: AbortSignal) => Promise<void>,
  info?: { title: string; thumbnail?: string }
): void {
  if (runningId === itemId || queue.some((entry) => entry.itemId === itemId)) return;
  queue.push({ itemId, title: info?.title ?? itemId, thumbnail: info?.thumbnail, run });
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

/** Aborts the currently running in-app download, if it's the given item.
 * The abort surfaces as an AbortError rejection out of the download's own
 * fetch, which the caller's saveOfflineInApp catch block turns into a
 * "cancelled" toast instead of a "failed" one. */
export function cancelRunningDownload(itemId: string): boolean {
  if (runningId !== itemId || !runningController) return false;
  runningController.abort();
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

/** Snapshot of the running download and everything waiting behind it, for
 * the Aktivität "In-App-Downloads" tab. `version` is a plain counter (not
 * the list itself) so useSyncExternalStore gets a stable primitive
 * reference between notify() calls instead of a fresh array every render. */
export function useQueueVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function getRunningDownload(): QueuedDownloadInfo | null {
  return runningInfo;
}

export function listQueuedDownloads(): QueuedDownloadInfo[] {
  return queue.map(({ itemId, title, thumbnail }) => ({ itemId, title, thumbnail }));
}
