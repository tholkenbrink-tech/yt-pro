/**
 * Client-only settings that have no backing backend endpoint in the Phase 2
 * API contract (download defaults, source defaults, notifications).
 * Best-effort localStorage persistence, called out as a
 * deviation in the Phase 2 report - if/when the backend grows matching
 * endpoints these should move to `lib/api.ts` instead.
 *
 * Keys are namespaced per logged-in family account (see currentUser.ts) so
 * thorben/indie/tamara sharing one device/browser don't clobber each other's
 * defaults.
 */

import { getCachedUserId } from "./currentUser";

export interface DownloadSettings {
  defaultQuality: string;
  rememberLastSelection: boolean;
  playlistSelectAllByDefault: boolean;
  parallelDownloads: number;
  /** Only gates the on-device download half of "Herunterladen" (saving to
   * Files/other apps) - never blocks the in-app offline copy, which never
   * leaves the app's own storage. See lib/wifiGate.ts. */
  wifiOnlyDeviceDownload: boolean;
  /** Gates starting the in-app offline save (the actual network fetch of the
   * video into IndexedDB) - independent of wifiOnlyDeviceDownload above,
   * which only covers handing an already-fetched file to the OS download
   * manager. See lib/wifiGate.ts. */
  wifiOnlyDownload: boolean;
  /** Gates starting network playback in the player - never blocks playing an
   * already-downloaded offline copy. See lib/wifiGate.ts. */
  wifiOnlyStreaming: boolean;
  /** User-configured cap (bytes) on total in-app offline storage - `null`
   * means no app-level cap. Independent of and in addition to the device's
   * own IndexedDB storage quota (see checkStorageQuota in offlineStore.ts):
   * that one reflects what the device will actually allow; this one lets a
   * user deliberately keep in-app downloads well below that, e.g. to leave
   * room for photos/other apps. */
  maxOfflineStorageBytes: number | null;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  defaultQuality: "720p",
  rememberLastSelection: true,
  playlistSelectAllByDefault: true,
  parallelDownloads: 1,
  wifiOnlyDeviceDownload: false,
  wifiOnlyDownload: false,
  wifiOnlyStreaming: false,
  maxOfflineStorageBytes: null,
};

export interface SourceDefaults {
  scheduleType: string;
  mode: string;
  quality: string;
  notificationsEnabled: boolean;
}

export const DEFAULT_SOURCE_DEFAULTS: SourceDefaults = {
  scheduleType: "daily",
  mode: "confirm_first",
  quality: "720p",
  notificationsEnabled: true,
};

function namespacedKey(baseKey: string): string {
  const userId = getCachedUserId();
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function read<T>(baseKey: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(namespacedKey(baseKey));
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function write<T>(baseKey: string, fallback: T, value: Partial<T>) {
  if (typeof localStorage === "undefined") return;
  const merged = { ...read(baseKey, fallback), ...value };
  localStorage.setItem(namespacedKey(baseKey), JSON.stringify(merged));
}

const DOWNLOAD_KEY = "yt-pro:download-settings";
export const getDownloadSettings = () => read(DOWNLOAD_KEY, DEFAULT_DOWNLOAD_SETTINGS);
export const setDownloadSettings = (v: Partial<DownloadSettings>) =>
  write(DOWNLOAD_KEY, DEFAULT_DOWNLOAD_SETTINGS, v);

const SOURCE_DEFAULTS_KEY = "yt-pro:source-defaults";
export const getSourceDefaults = () => read(SOURCE_DEFAULTS_KEY, DEFAULT_SOURCE_DEFAULTS);
export const setSourceDefaults = (v: Partial<SourceDefaults>) =>
  write(SOURCE_DEFAULTS_KEY, DEFAULT_SOURCE_DEFAULTS, v);
