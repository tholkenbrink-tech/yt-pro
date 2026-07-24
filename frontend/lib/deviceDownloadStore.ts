/**
 * Best-effort, per-device bookkeeping of which items were sent to the
 * browser's native download manager (see offlineStore.ts's
 * triggerDeviceDownload). This is NOT a record of what's actually still on
 * the device - there is no web API that reports whether a native download
 * succeeded, and once a file lands in Files/Downloads the app has no way to
 * detect if the user later deletes it there. It only remembers "we sent
 * this to the OS download manager on this browser", to power the Mediathek
 * filter and the "Auf Gerät gespeichert" management sheet.
 *
 * Namespaced per logged-in family account like localSettings.ts, so
 * thorben/indie/tamara sharing one device don't see each other's list.
 */

import { getCachedUserId } from "./currentUser";

const BASE_KEY = "yt-pro:device-downloaded-ids";

function namespacedKey(): string {
  const userId = getCachedUserId();
  return userId ? `${BASE_KEY}:${userId}` : BASE_KEY;
}

function readIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(namespacedKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(namespacedKey(), JSON.stringify(ids));
}

export function markDownloadedToDevice(id: string): void {
  const ids = readIds();
  if (!ids.includes(id)) writeIds([...ids, id]);
}

export function isDownloadedToDevice(id: string): boolean {
  return readIds().includes(id);
}

/** Removes the bookkeeping entry only - never touches the actual file on
 * the device, which yt-pro has no way to reach. */
export function forgetDownloadedToDevice(id: string): void {
  writeIds(readIds().filter((existing) => existing !== id));
}

export function listDownloadedToDeviceIds(): string[] {
  return readIds();
}

/** Fire-and-forget attempt to jump into the iOS Files app via the
 * undocumented `shareddocuments://` URL scheme that many apps rely on for
 * "open in Files" style handoffs. Not an official/guaranteed API - it can
 * stop working in a future iOS release without notice, and even when it
 * works it opens Files generally rather than the exact "On My iPhone /
 * Downloads" folder. There is no way to detect success or failure from
 * JavaScript, so callers should always show the manual instructions
 * alongside this, not instead of it. */
export function attemptOpenFilesApp(): void {
  if (typeof window === "undefined") return;
  window.location.href = "shareddocuments://";
}
