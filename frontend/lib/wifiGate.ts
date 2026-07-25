import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
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
 * Whether the current connection is known to be WiFi. `undefined` means
 * nobody can say and callers should fall back to asking the user directly.
 *
 * In the native iOS app this uses Capacitor's Network plugin, which reads
 * the real connection type from the OS - no prompt needed there. In a plain
 * browser it falls back to the Network Information API, which Safari has
 * never implemented (only Chromium-based browsers expose `navigator.connection`).
 */
async function isOnWifi(): Promise<boolean | undefined> {
  if (Capacitor.isNativePlatform()) {
    const status = await Network.getStatus();
    if (status.connectionType === "none") return undefined;
    return status.connectionType === "wifi";
  }

  const connection = getConnection();
  return connection?.type ? connection.type === "wifi" : undefined;
}

async function gate(enabled: boolean, promptMessage: string): Promise<boolean> {
  if (!enabled) return true;

  const onWifi = await isOnWifi();
  if (onWifi !== undefined) return onWifi;

  return window.confirm(promptMessage);
}

/**
 * Whether the on-device download (saving to Files/other apps) should go
 * ahead right now. Only relevant when "Nur im WLAN auf Gerät laden" is
 * enabled in Settings -> Download - never gates the in-app offline copy,
 * which never leaves the app's own storage regardless of connection.
 */
export function shouldDownloadToDevice(): Promise<boolean> {
  return gate(
    getDownloadSettings().wifiOnlyDeviceDownload,
    '"Nur im WLAN" ist aktiviert. Die Verbindungsart konnte nicht erkannt werden - bist du gerade im WLAN?'
  );
}

/**
 * Whether starting the in-app offline save (the actual network fetch into
 * IndexedDB) should go ahead right now. Gated separately from
 * shouldDownloadToDevice() by "Nur im WLAN herunterladen" in Settings ->
 * Download - see the wifiOnlyDownload doc comment in localSettings.ts.
 */
export function shouldStartDownload(): Promise<boolean> {
  return gate(
    getDownloadSettings().wifiOnlyDownload,
    '"Nur im WLAN herunterladen" ist aktiviert. Die Verbindungsart konnte nicht erkannt werden - bist du gerade im WLAN?'
  );
}

/**
 * Whether network playback should be allowed to start right now. Gated by
 * "Nur im WLAN streamen" in Settings -> Download - never blocks playing an
 * already-downloaded offline copy, which the player checks for separately.
 */
export function shouldStream(): Promise<boolean> {
  return gate(
    getDownloadSettings().wifiOnlyStreaming,
    '"Nur im WLAN streamen" ist aktiviert. Die Verbindungsart konnte nicht erkannt werden - bist du gerade im WLAN?'
  );
}
