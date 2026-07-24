"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { SourceMode, SourcePlaylistPreview, SourceScheduleType } from "@/lib/types";
import { QualitySelector } from "@/components/QualitySelector";
import { SourceSchedulePicker } from "@/components/SourceSchedulePicker";
import { SourceModeSelector } from "@/components/SourceModeSelector";
import { getSourceDefaults } from "@/lib/localSettings";

const QUALITIES = [
  { name: "1080p", label: "1080p" },
  { name: "720p", label: "720p" },
  { name: "480p", label: "480p" },
];

export default function NewSourcePage() {
  const router = useRouter();
  const defaults = getSourceDefaults();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<SourcePlaylistPreview | null>(null);
  const [name, setName] = useState("");
  const [quality, setQuality] = useState(defaults.quality);
  const [schedule, setSchedule] = useState<SourceScheduleType>(
    defaults.scheduleType as SourceScheduleType
  );
  const [cronExpression, setCronExpression] = useState("");
  const [mode, setMode] = useState<SourceMode>(defaults.mode as SourceMode);
  const [maxNewItems, setMaxNewItems] = useState<number | "">("");
  const [maxBytes, setMaxBytes] = useState<number | "">("");
  const [maxDurationMinutes, setMaxDurationMinutes] = useState<number | "">("");
  const [onlyAfter, setOnlyAfter] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!url.trim()) {
      setError("Bitte einen Playlist-Link einfügen.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const result = await api.analyzeSource(url.trim());
      setPreview(result);
      setName(result.playlistTitle ?? "");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? "Playlist konnte nicht geprüft werden. Die Playlist ist möglicherweise privat oder nicht mehr verfügbar."
          : "Netzwerkfehler bei der Prüfung."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const source = await api.createSource({
        sourceUrl: url.trim(),
        name: name.trim() || preview?.playlistTitle || url.trim(),
        // downloadProfileId is a foreign key to download_profiles.id, but
        // there's no "list download profiles" endpoint to fetch real ids,
        // so we send the quality name and the backend resolves it by name.
        downloadProfileId: quality,
        scheduleType: schedule,
        cronExpression: schedule === "cron" ? cronExpression : undefined,
        mode,
        maximumNewItemsPerRun: maxNewItems === "" ? undefined : Number(maxNewItems),
        maximumBytesPerRun: maxBytes === "" ? undefined : Number(maxBytes) * 1024 * 1024,
        maximumDurationSeconds:
          maxDurationMinutes === "" ? undefined : Number(maxDurationMinutes) * 60,
        onlyPublishedAfter: onlyAfter || undefined,
      });
      router.push(`/settings/sources/${source.id}`);
    } catch (e) {
      const detail =
        e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
          ? String((e.body as { detail?: unknown }).detail)
          : null;
      setError(
        detail ? `Quelle konnte nicht gespeichert werden: ${detail}` : "Quelle konnte nicht gespeichert werden."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-page-title">Neue Quelle</h1>

      <label htmlFor="source-url" className="mb-1 block text-sm font-medium">
        Playlist-Link
      </label>
      <div className="mb-3 flex gap-2">
        <input
          id="source-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/playlist?list=..."
          className="min-h-11 flex-1 rounded-md border border-border bg-surface p-2 text-text-primary"
        />
        <button
          type="button"
          onClick={analyze}
          disabled={analyzing}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {analyzing ? "Prüfe..." : "Prüfen"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      {preview && (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-md border border-border p-3">
            {preview.thumbnail && (
              <Image
                src={preview.thumbnail}
                alt=""
                width={80}
                height={45}
                unoptimized
                className="h-[45px] w-20 shrink-0 rounded object-cover"
              />
            )}
            <div>
              <p className="text-sm font-medium">{preview.playlistTitle}</p>
              <p className="text-meta text-text-muted">{preview.itemCount} Videos</p>
            </div>
          </div>

          <label htmlFor="source-name" className="mb-1 block text-sm font-medium">
            Name der Quelle
          </label>
          <input
            id="source-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 min-h-11 w-full rounded-md border border-border bg-surface p-2 text-text-primary"
          />

          <h2 className="mb-2 text-sm font-semibold">Qualität</h2>
          <QualitySelector qualities={QUALITIES} selected={quality} onSelect={setQuality} />

          <h2 className="mb-2 mt-4 text-sm font-semibold">Prüfintervall</h2>
          <SourceSchedulePicker
            schedule={schedule}
            cronExpression={cronExpression}
            onScheduleChange={setSchedule}
            onCronChange={setCronExpression}
          />

          <h2 className="mb-2 mt-4 text-sm font-semibold">Modus</h2>
          <SourceModeSelector mode={mode} onChange={setMode} />

          <h2 className="mb-2 mt-4 text-sm font-semibold">Limits</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="max-items" className="mb-1 block text-meta text-text-muted">
                Max. neue Videos/Prüfung
              </label>
              <input
                id="max-items"
                type="number"
                min={0}
                value={maxNewItems}
                onChange={(e) => setMaxNewItems(e.target.value === "" ? "" : Number(e.target.value))}
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label htmlFor="max-size" className="mb-1 block text-meta text-text-muted">
                Max. Größe/Prüfung (MB)
              </label>
              <input
                id="max-size"
                type="number"
                min={0}
                value={maxBytes}
                onChange={(e) => setMaxBytes(e.target.value === "" ? "" : Number(e.target.value))}
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label htmlFor="max-duration" className="mb-1 block text-meta text-text-muted">
                Max. Dauer/Prüfung (Min.)
              </label>
              <input
                id="max-duration"
                type="number"
                min={0}
                value={maxDurationMinutes}
                onChange={(e) =>
                  setMaxDurationMinutes(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label htmlFor="only-after" className="mb-1 block text-meta text-text-muted">
                Nur veröffentlicht nach
              </label>
              <input
                id="only-after"
                type="date"
                value={onlyAfter}
                onChange={(e) => setOnlyAfter(e.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={submitting}
            className="mt-5 min-h-11 w-full rounded-md bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Wird gespeichert..." : "Quelle speichern"}
          </button>
        </>
      )}
    </main>
  );
}
