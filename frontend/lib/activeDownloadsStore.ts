/**
 * Tracks in-app save progress (saveOfflineInApp) per item id, independent
 * of any single component instance. The fetch behind saveOfflineInApp
 * isn't tied to a component's lifecycle - it keeps running fine across an
 * in-app route change - but the previous per-component useState for
 * progress reset to blank on every remount, making a still-running
 * download look stalled/lost whenever you navigated away and back. This
 * module-level store survives navigation (it's just a JS singleton for the
 * lifetime of the page), so every surface showing the same item reads the
 * same live percentage.
 */

import { useSyncExternalStore } from "react";

type Listener = () => void;

const progressByItem = new Map<string, number>();
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function startTracking(itemId: string): void {
  progressByItem.set(itemId, 0);
  notify();
}

export function setDownloadProgress(itemId: string, pct: number): void {
  if (!progressByItem.has(itemId)) return;
  progressByItem.set(itemId, pct);
  notify();
}

export function stopTracking(itemId: string): void {
  progressByItem.delete(itemId);
  notify();
}

export function isTracking(itemId: string): boolean {
  return progressByItem.has(itemId);
}

export function getDownloadProgress(itemId: string): number | null {
  return progressByItem.get(itemId) ?? null;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read of an item's in-app save progress - re-renders on any
 * change from any component instance, not just the one that started it. */
export function useInAppDownloadProgress(itemId: string): { saving: boolean; pct: number | null } {
  const saving = useSyncExternalStore(subscribe, () => isTracking(itemId));
  const pct = useSyncExternalStore(subscribe, () => getDownloadProgress(itemId));
  return { saving, pct };
}
