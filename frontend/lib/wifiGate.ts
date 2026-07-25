import { getDownloadSettings } from "./localSettings";

interface NetworkInformation {
  type?: string;
  effectiveType?: string;
}

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as unknown as { connection?: NetworkInformation }).connection;
}

/**
 * Whether the current connection is known to be WiFi. `undefined` means the
 * browser can't say (Safari never implemented the Network Information API,
 * so this only ever resolves on Chromium-based browsers) - callers fall back
 * to asking the user directly in that case.
 */
function isOnWifi(): boolean | undefined {
  const connection = getConnection();
  return connection?.type ? connection.type === "wifi" : undefined;
}

/**
 * Whether the on-device download (saving to Files/other apps) should go
 * ahead right now. Only relevant when "Nur im WLAN auf Gerät laden" is
 * enabled in Settings -> Download - never gates the in-app offline copy,
 * which never leaves the app's own storage regardless of connection.
 *
 * Safari (iPhone's only real browser) has never implemented the Network
 * Information API, so `navigator.connection` is only ever present on
 * Chromium-based browsers - there is no reliable way to detect WiFi vs.
 * cellular on the actual target platform. Where the API IS available and
 * unambiguous, this decides silently; everywhere else it asks once via a
 * plain confirm(), which is the only thing that works everywhere.
 */
export function shouldDownloadToDevice(): boolean {
  if (!getDownloadSettings().wifiOnlyDeviceDownload) return true;

  const onWifi = isOnWifi();
  if (onWifi !== undefined) return onWifi;

  return window.confirm(
    '"Nur im WLAN" ist aktiviert. Dieser Browser kann die Verbindungsart nicht erkennen - bist du gerade im WLAN?'
  );
}

/**
 * Whether starting the in-app offline save (the actual network fetch into
 * IndexedDB) should go ahead right now. Gated separately from
 * shouldDownloadToDevice() by "Nur im WLAN herunterladen" in Settings ->
 * Download - see the wifiOnlyDownload doc comment in localSettings.ts.
 */
export function shouldStartDownload(): boolean {
  if (!getDownloadSettings().wifiOnlyDownload) return true;

  const onWifi = isOnWifi();
  if (onWifi !== undefined) return onWifi;

  return window.confirm(
    '"Nur im WLAN herunterladen" ist aktiviert. Dieser Browser kann die Verbindungsart nicht erkennen - bist du gerade im WLAN?'
  );
}

/**
 * Whether network playback should be allowed to start right now. Gated by
 * "Nur im WLAN streamen" in Settings -> Download - never blocks playing an
 * already-downloaded offline copy, which the player checks for separately.
 */
export function shouldStream(): boolean {
  if (!getDownloadSettings().wifiOnlyStreaming) return true;

  const onWifi = isOnWifi();
  if (onWifi !== undefined) return onWifi;

  return window.confirm(
    '"Nur im WLAN streamen" ist aktiviert. Dieser Browser kann die Verbindungsart nicht erkennen - bist du gerade im WLAN?'
  );
}
