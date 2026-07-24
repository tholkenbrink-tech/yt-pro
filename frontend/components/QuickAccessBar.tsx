"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import type { MonitoredSource } from "@/lib/types";
import { getDownloadSettings } from "@/lib/localSettings";
import { getLastSubmittedLink } from "@/lib/analysisStore";
import { useToast } from "@/components/ToastProvider";

interface Props {
  /** Fills the download page's URL textarea - the user still has to press
   * "Analysieren" themselves, this never triggers analysis or a download. */
  onPick: (url: string) => void;
}

export function QuickAccessBar({ onPick }: Props) {
  const [sources, setSources] = useState<MonitoredSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = () => {
    api
      .listSources()
      .then((all) => setSources(all.filter((s) => s.isQuickAccess)))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  };

  useEffect(() => {
    load();
    setLastLink(getLastSubmittedLink());
  }, []);

  const cancelAdd = () => {
    setAdding(false);
    setUrl("");
    setError(null);
  };

  // A single paste-and-save action, like adding a clipboard/bookmark entry -
  // no separate "preview then confirm" step. The playlist title/thumbnail
  // are still fetched server-side (POST /api/sources always does this) and
  // used to auto-name the chip once known.
  const save = async () => {
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const source = await api.createSource({
        sourceUrl: url.trim(),
        name: url.trim(),
        downloadProfileId: getDownloadSettings().defaultQuality,
        mode: "discover_only",
        scheduleType: "manual",
        isQuickAccess: true,
      });
      if (source.playlistTitle) {
        await api.updateSource(source.id, { name: source.playlistTitle });
      }
      showToast("Schnellzugriff hinzugefügt");
      cancelAdd();
      load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? "Playlist konnte nicht gespeichert werden. Sie ist möglicherweise privat oder nicht mehr verfügbar."
          : "Netzwerkfehler."
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" aus dem Schnellzugriff entfernen?`)) return;
    setSources((prev) => prev.filter((s) => s.id !== id));
    await api.deleteSource(id);
  };

  // Stay invisible until the household actually opts in - no empty bar,
  // no default entries.
  if (!loaded) return null;

  const addButton = !adding && (
    <button
      type="button"
      onClick={() => setAdding(true)}
      aria-label="Playlist als Schnellzugriff merken"
      className="flex shrink-0 items-center justify-center self-stretch rounded-md border border-dashed border-border px-3 text-lg font-medium leading-none text-text-secondary"
    >
      +
    </button>
  );

  const restoreButton = lastLink && (
    <button
      type="button"
      onClick={() => onPick(lastLink)}
      aria-label="Letzten Link erneut einfügen"
      title={lastLink}
      className="flex shrink-0 items-center justify-center self-stretch rounded-md border border-border bg-surface px-3 text-base text-text-secondary"
    >
      ↺
    </button>
  );

  return (
    <div className="mx-4 mb-3">
      {sources.length > 0 || lastLink ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {restoreButton}
          {sources.map((source) => (
            <div
              key={source.id}
              className="relative flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface py-1.5 pl-1.5 pr-2"
            >
              <button
                type="button"
                onClick={() => onPick(source.sourceUrl)}
                className="flex min-h-9 items-center gap-2"
              >
                {source.thumbnailUrl && (
                  <Image
                    src={source.thumbnailUrl}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="h-9 w-9 shrink-0 rounded object-cover"
                  />
                )}
                <span className="max-w-[9rem] truncate text-sm font-medium">{source.name}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(source.id, source.name)}
                aria-label={`${source.name} entfernen`}
                className="min-h-6 min-w-6 shrink-0 rounded text-text-muted hover:text-text-primary"
              >
                ×
              </button>
            </div>
          ))}
          {addButton}
        </div>
      ) : (
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-9 rounded-md border border-dashed border-border px-3 py-1.5 text-sm font-medium text-text-secondary"
          >
            + Playlist als Schnellzugriff merken
          </button>
        )
      )}

      {adding && (
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancelAdd();
            }}
            placeholder="https://youtube.com/playlist?list=..."
            className="min-h-11 flex-1 rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !url.trim()}
            className="min-h-11 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "..." : "Hinzufügen"}
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            Abbrechen
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
