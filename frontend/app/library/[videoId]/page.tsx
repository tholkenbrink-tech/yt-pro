"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SourceBadge } from "@/components/SourceBadge";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";

export default function VideoPlayerPage({
  params,
}: {
  params: { videoId: string };
}) {
  const router = useRouter();
  const [item, setItem] = useState<LibraryItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // No single-item detail endpoint exists in the Phase 2 API contract, so
    // metadata comes from the same /api/library listing the Mediathek uses.
    api
      .library()
      .then((items) => {
        if (cancelled) return;
        setItem(items.find((i) => i.id === params.videoId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("load");
      });
    return () => {
      cancelled = true;
    };
  }, [params.videoId]);

  if (item === undefined && !error) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-4 pt-6">
        <p className="text-sm text-text-muted">Wird geladen...</p>
      </main>
    );
  }

  if (!item || error) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-4 pt-6">
        <h1 className="mb-2 text-section-title">Datei nicht mehr verfügbar</h1>
        <p className="text-sm text-text-secondary">
          Das Video wurde vom Server gelöscht oder ist abgelaufen.
        </p>
      </main>
    );
  }

  const resetProgress = async () => {
    setBusy(true);
    try {
      await api.resetProgress(item.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const markWatched = async () => {
    setBusy(true);
    try {
      await api.markWatched(item.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-safe-left px-4 pb-4 pt-6 pr-safe-right">
      <div className="mx-auto max-w-2xl">
        <VideoPlayer itemId={item.id} />
      </div>

      <h1 className="mt-4 text-card-title">{item.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-text-muted">
        {item.channelName && <span>{item.channelName}</span>}
        <SourceBadge isAutomatic={item.isAutomaticallyPrepared} sourceName={item.sourceName} />
      </div>
      <p className="mt-1 text-meta text-text-muted">
        {formatDuration(item.duration)} - {item.selectedQuality} - {formatBytes(item.fileSize)}
      </p>
      {item.createdAt && (
        <p className="mt-1 text-meta text-text-muted">
          Vorbereitet: {formatDate(item.createdAt)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={api.downloadUrl(item.id)}
          download
          className="min-h-11 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white"
        >
          Auf iPhone laden
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={resetProgress}
          className="min-h-11 rounded-md border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Von vorne starten
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={markWatched}
          className="min-h-11 rounded-md border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Als angesehen markieren
        </button>
        {item.originalUrl && (
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-11 rounded-md border border-border px-4 py-2.5 text-sm font-medium"
          >
            Original öffnen
          </a>
        )}
      </div>
    </main>
  );
}
