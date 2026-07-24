/**
 * Client-only settings that have no backing backend endpoint in the Phase 2
 * API contract (download defaults, source defaults, storage thresholds,
 * notifications). Best-effort localStorage persistence, called out as a
 * deviation in the Phase 2 report - if/when the backend grows matching
 * endpoints these should move to `lib/api.ts` instead.
 */

export interface DownloadSettings {
  defaultQuality: string;
  rememberLastSelection: boolean;
  playlistSelectAllByDefault: boolean;
  parallelDownloads: number;
  /** Only gates the on-device download half of "Herunterladen" (saving to
   * Files/other apps) - never blocks the in-app offline copy, which never
   * leaves the app's own storage. See lib/wifiGate.ts. */
  wifiOnlyDeviceDownload: boolean;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  defaultQuality: "720p",
  rememberLastSelection: true,
  playlistSelectAllByDefault: true,
  parallelDownloads: 1,
  wifiOnlyDeviceDownload: false,
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

export interface StorageSettings {
  maxStorageBytes: number | null;
  warningThresholdBytes: number | null;
}

export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  maxStorageBytes: null,
  warningThresholdBytes: null,
};

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function write<T>(key: string, fallback: T, value: Partial<T>) {
  if (typeof localStorage === "undefined") return;
  const merged = { ...read(key, fallback), ...value };
  localStorage.setItem(key, JSON.stringify(merged));
}

const DOWNLOAD_KEY = "yt-pro:download-settings";
export const getDownloadSettings = () => read(DOWNLOAD_KEY, DEFAULT_DOWNLOAD_SETTINGS);
export const setDownloadSettings = (v: Partial<DownloadSettings>) =>
  write(DOWNLOAD_KEY, DEFAULT_DOWNLOAD_SETTINGS, v);

const SOURCE_DEFAULTS_KEY = "yt-pro:source-defaults";
export const getSourceDefaults = () => read(SOURCE_DEFAULTS_KEY, DEFAULT_SOURCE_DEFAULTS);
export const setSourceDefaults = (v: Partial<SourceDefaults>) =>
  write(SOURCE_DEFAULTS_KEY, DEFAULT_SOURCE_DEFAULTS, v);

const STORAGE_SETTINGS_KEY = "yt-pro:storage-settings";
export const getStorageSettings = () => read(STORAGE_SETTINGS_KEY, DEFAULT_STORAGE_SETTINGS);
export const setStorageSettings = (v: Partial<StorageSettings>) =>
  write(STORAGE_SETTINGS_KEY, DEFAULT_STORAGE_SETTINGS, v);
