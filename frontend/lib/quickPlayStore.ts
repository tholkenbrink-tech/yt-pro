/**
 * Lets any item trigger playback in-place, without a route change, via
 * QuickPlayOverlay (mounted once in AppShell). This exists specifically for
 * offline playback: navigating to a video's own /library/[videoId] page is a
 * real Next.js route change, and when the RSC data fetch for a not-yet-
 * visited route fails offline, Next.js falls back to a full page navigation
 * - which, inside the native iOS shell, can fail at the WKWebView level and
 * trigger Capacitor's bundled `offline-fallback.html` (server.errorPath in
 * capacitor.config.ts). That page is a separate, origin-isolated static file
 * with no access to the real app's IndexedDB, so it can never show a
 * downloaded video - a genuine, unrecoverable dead end no amount of service-
 * worker or React-level offline handling can fix, because it happens before
 * any of that code runs. Opening playback as an overlay on the current page
 * instead needs no navigation at all, so this failure mode can't occur.
 */

import { useSyncExternalStore } from "react";

export interface QuickPlayItem {
  itemId: string;
  title: string;
  channelName?: string;
  thumbnailPath?: string;
}

let current: QuickPlayItem | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function openQuickPlay(item: QuickPlayItem): void {
  current = item;
  notify();
}

export function closeQuickPlay(): void {
  current = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQuickPlayItem(): QuickPlayItem | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
