"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  getDownloadSettings,
  setDownloadSettings,
  type DownloadSettings,
} from "@/lib/localSettings";
import { useToast } from "@/components/ToastProvider";

const QUALITIES = ["original", "1080p", "720p", "480p"];
const QUALITY_LABELS: Record<string, string> = { original: "Original" };

export default function DownloadSettingsPage() {
  const [settings, setSettings] = useState<DownloadSettings>(DEFAULT_DOWNLOAD_SETTINGS);
  const { showToast } = useToast();

  useEffect(() => {
    setSettings(getDownloadSettings());
  }, []);

  const update = (patch: Partial<DownloadSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setDownloadSettings(patch);
    showToast("Einstellung gespeichert");
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Download</h1>

      <label htmlFor="default-quality" className="mb-1 block text-sm font-medium">
        Standardqualität
      </label>
      <select
        id="default-quality"
        value={settings.defaultQuality}
        onChange={(e) => update({ defaultQuality: e.target.value })}
        className="mb-4 min-h-11 w-full rounded-md border border-border bg-surface p-2 text-text-primary"
      >
        {QUALITIES.map((q) => (
          <option key={q} value={q}>
            {QUALITY_LABELS[q] ?? q}
          </option>
        ))}
      </select>

      <label className="mb-4 flex min-h-11 items-center justify-between">
        <span className="text-sm font-medium">Letzte Auswahl merken</span>
        <input
          type="checkbox"
          checked={settings.rememberLastSelection}
          onChange={(e) => update({ rememberLastSelection: e.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>

      <label className="mb-4 flex min-h-11 items-center justify-between">
        <span className="text-sm font-medium">Playlist: standardmäßig alle auswählen</span>
        <input
          type="checkbox"
          checked={settings.playlistSelectAllByDefault}
          onChange={(e) => update({ playlistSelectAllByDefault: e.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>

      <label className="mb-1 flex min-h-11 items-center justify-between">
        <span className="text-sm font-medium">Nur im WLAN auf Gerät laden</span>
        <input
          type="checkbox"
          checked={settings.wifiOnlyDeviceDownload}
          onChange={(e) => update({ wifiOnlyDeviceDownload: e.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>
      <p className="mb-4 text-meta text-text-muted">
        Gilt nur für den Geräte-Download bei &quot;Herunterladen&quot; (Speichern in
        Dateien/andere Apps) - die Offline-Kopie in der App selbst ist davon
        nie betroffen. Safari kann WLAN nicht zuverlässig von Mobilfunk
        unterscheiden, daher fragt die App in dem Fall einmal nach.
      </p>

      <label htmlFor="parallel-downloads" className="mb-1 block text-sm font-medium">
        Parallele Downloads
      </label>
      <input
        id="parallel-downloads"
        type="number"
        min={1}
        max={5}
        value={settings.parallelDownloads}
        onChange={(e) => update({ parallelDownloads: Number(e.target.value) })}
        className="mb-4 min-h-11 w-full rounded-md border border-border bg-surface p-2 text-text-primary"
      />

      <p className="text-meta text-text-muted">
        Hinweis: iOS Safari bietet keine zuverlässige API zur Erkennung von
        WLAN vs. Mobilfunk - lade große Playlists am besten im WLAN herunter.
      </p>
    </main>
  );
}
