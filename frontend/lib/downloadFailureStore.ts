/**
 * Tracks which items' most recent in-app download attempt failed or was
 * interrupted (as opposed to being cancelled), so the download control can
 * show a dedicated "failed - retry" state instead of only a one-off toast.
 *
 * Backed by offlineStore.ts's IndexedDB `progress` records (the source of
 * truth - see SaveProgressRecord), hydrated into this in-memory map on
 * first read so components can keep using the synchronous
 * useSyncExternalStore hook below. Unlike the previous "deliberately not
 * persisted" version of this store, a failure now *does* survive a reload:
 * a save that was still writing when the tab closed is reconciled by
 * offlineStore's reconcileInterruptedSaves() (run once at startup, see
 * components/OfflineDownloadsInit.tsx) into an "interrupted" progress
 * record, which this store picks up the same way as a genuine failure. The
 * ticket requirement this satisfies: a failed/interrupted download must
 * stay visible with Retry/Remove until the user acts, not just for the
 * current session.
 */

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { listFailedOrInterrupted, removeOffline } from "./offlineStore";

const failedItems = new Map<string, string | undefined>(); // itemId -> errorMessage
const listeners = new Set<() => void>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function hydrate(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = listFailedOrInterrupted()
    .then((records) => {
      for (const r of records) failedItems.set(r.id, r.errorMessage);
      hydrated = true;
      notify();
    })
    .catch(() => {
      hydrated = true;
    });
  return hydratePromise;
}

export function markFailed(itemId: string, errorMessage?: string): void {
  failedItems.set(itemId, errorMessage);
  notify();
}

/** Clears only the in-memory/UI failed flag - called after a successful
 * save, where offlineStore's own success path has already cleaned up the
 * progress record. Does NOT touch IndexedDB, so it's safe to call
 * regardless of why the flag is being cleared. */
export function clearFailed(itemId: string): void {
  if (!failedItems.delete(itemId)) return;
  notify();
}

/** User explicitly dismisses a failed/interrupted entry without retrying -
 * removes its partial chunks/progress record too (there's nothing else to
 * keep once the user says "forget it"). */
export function removeFailedEntry(itemId: string): Promise<void> {
  failedItems.delete(itemId);
  notify();
  return removeOffline(itemId);
}

function getFailed(itemId: string): boolean {
  return failedItems.has(itemId);
}

function getFailureMessage(itemId: string): string | undefined {
  return failedItems.get(itemId);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDownloadFailed(itemId: string): boolean {
  useEffect(() => {
    if (!hydrated) hydrate();
  }, []);
  return useSyncExternalStore(subscribe, () => getFailed(itemId));
}

export function useDownloadFailureMessage(itemId: string): string | undefined {
  return useSyncExternalStore(subscribe, () => getFailureMessage(itemId));
}
