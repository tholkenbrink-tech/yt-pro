"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  getDownloadSettings,
  setDownloadSettings,
  type DownloadSettings,
} from "@/lib/localSettings";
import { useToast } from "@/components/ToastProvider";
import { Switch } from "@/components/Switch";

const QUALITIES = ["original", "1080p", "720p", "480p", "audio"];
const QUALITY_LABELS: Record<string, string> = { original: "Original", audio: "Audio (nur Ton)" };

function SettingRow({
  label,
  description,
  checked,
  onChange,
  last,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={`px-3.5 py-2.5 ${last ? "" : "border-b border-border"}`}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <Switch checked={checked} onChange={onChange} label={label} />
      </div>
      {description && <p className="mt-1 text-meta text-text-muted">{description}</p>}
    </div>
  );
}

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
      <h1 className="mb-4 text-page-title">Download Einstellung</h1>

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Standardqualität
      </p>
      <div className="mb-5 flex gap-1.5 rounded-2xl bg-surface-elevated p-1">
        {QUALITIES.map((q) => {
          const active = settings.defaultQuality === q;
          return (
            <button
              key={q}
              type="button"
              onClick={() => update({ defaultQuality: q })}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium ${
                active ? "bg-accent font-semibold text-white" : "text-text-secondary"
              }`}
            >
              {QUALITY_LABELS[q] ?? q}
            </button>
          );
        })}
      </div>

      <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-surface">
        <SettingRow
          label="Letzte Auswahl merken"
          checked={settings.rememberLastSelection}
          onChange={(v) => update({ rememberLastSelection: v })}
        />
        <SettingRow
          label="Playlist: standardmäßig alle auswählen"
          checked={settings.playlistSelectAllByDefault}
          onChange={(v) => update({ playlistSelectAllByDefault: v })}
        />
        <SettingRow
          label="Nur im WLAN auf Gerät laden"
          description={
            'Gilt nur für den Geräte-Download bei "Herunterladen" (Speichern in Dateien/andere Apps) - die Offline-Kopie in der App selbst ist davon nie betroffen. Safari kann WLAN nicht zuverlässig von Mobilfunk unterscheiden, daher fragt die App in dem Fall einmal nach.'
          }
          checked={settings.wifiOnlyDeviceDownload}
          onChange={(v) => update({ wifiOnlyDeviceDownload: v })}
        />
        <SettingRow
          label="Nur im WLAN herunterladen"
          description={
            'Gilt für das Speichern "In der App" - dabei wird das Video tatsächlich über das Netzwerk geladen. Ohne WLAN wird der Download nicht gestartet.'
          }
          checked={settings.wifiOnlyDownload}
          onChange={(v) => update({ wifiOnlyDownload: v })}
        />
        <SettingRow
          label="Nur im WLAN streamen"
          description="Verhindert das Abspielen über Mobilfunk. Bereits offline gespeicherte Videos sind davon nicht betroffen und lassen sich weiterhin ohne WLAN ansehen."
          checked={settings.wifiOnlyStreaming}
          onChange={(v) => update({ wifiOnlyStreaming: v })}
          last
        />
      </div>

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Parallele Downloads
      </p>
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-surface px-3.5 py-1.5">
        <button
          type="button"
          aria-label="Weniger parallele Downloads"
          disabled={settings.parallelDownloads <= 1}
          onClick={() => update({ parallelDownloads: Math.max(1, settings.parallelDownloads - 1) })}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-elevated text-base text-text-primary disabled:opacity-40"
        >
          −
        </button>
        <span className="text-[15px] font-semibold text-text-primary">{settings.parallelDownloads}</span>
        <button
          type="button"
          aria-label="Mehr parallele Downloads"
          disabled={settings.parallelDownloads >= 5}
          onClick={() => update({ parallelDownloads: Math.min(5, settings.parallelDownloads + 1) })}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-elevated text-base text-text-primary disabled:opacity-40"
        >
          +
        </button>
      </div>

      <p className="text-meta text-text-muted">
        Hinweis: iOS Safari bietet keine zuverlässige API zur Erkennung von
        WLAN vs. Mobilfunk - lade große Playlists am besten im WLAN herunter.
      </p>
    </main>
  );
}
