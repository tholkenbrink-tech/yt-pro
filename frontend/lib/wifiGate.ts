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
 * Whether the on-device download (saving to Files/other apps) should go
 * ahead right now. Only relevant when "Nur im WLAN" is enabled in Settings
 * -> Download - never gates the in-app offline copy, which never leaves
 * the app's own storage regardless of connection.
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

  const connection = getConnection();
  if (connection?.type) {
    return connection.type === "wifi";
  }

  return window.confirm(
    '"Nur im WLAN" ist aktiviert. Dieser Browser kann die Verbindungsart nicht erkennen - bist du gerade im WLAN?'
  );
}
