"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SourceBadge } from "@/components/SourceBadge";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { getOfflineMeta, isOffline, removeOffline, saveOffline } from "@/lib/offlineStore";
import { useToast } from "@/components/ToastProvider";

function fromOfflineMeta(meta: Awaited<ReturnType<typeof getOfflineMeta>>): LibraryItem | null {
  if (!meta) return null;
  return {
    id: meta.id,
    title: meta.title,
    channelName: meta.channelName,
    duration: meta.duration,
    selectedQuality: meta.selectedQuality,
    fileSize: meta.fileSize,
    mimeType: meta.mimeType,
    status: "ready",
    isAutomaticallyPrepared: false,
    createdAt: meta.savedAt,
    keepOnServer: true,
    progress: null,
    originalUrl: meta.originalUrl,
  };
}

export default function VideoPlayerPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<LibraryItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [renderedFromOfflineCache, setRenderedFromOfflineCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasOfflineCopy, setHasOfflineCopy] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [saveProgressPct, setSaveProgressPct] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    // No single-item detail endpoint exists in the Phase 2 API contract, so
    // metadata comes from the same /api/library listing the Mediathek uses.
    api
      .library()
      .then((items) => {
        if (cancelled) return;
        const found = items.find((i) => i.id === videoId) ?? null;
        if (found) {
          setItem(found);
        } else {
          setItem(null);
          setError("not_found");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Network unreachable (offline, or API host down) - fall back to
        // whatever we saved on-device for offline playback rather than
        // showing a "deleted from server" message that isn't true here.
        getOfflineMeta(videoId).then((meta) => {
          if (cancelled) return;
          const fallback = fromOfflineMeta(meta);
          if (fallback) {
            setItem(fallback);
            setRenderedFromOfflineCache(true);
          } else {
            setItem(null);
            setError("offline");
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    isOffline(videoId).then((value) => {
      if (!cancelled) setHasOfflineCopy(value);
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (item === undefined) {
    return (
      <main className="mx-auto max-w-2xl px-5 pb-4 pt-6">
        <p className="text-sm text-text-muted">Wird geladen...</p>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="mx-auto max-w-2xl px-5 pb-4 pt-6">
        <h1 className="mb-2 text-section-title">
          {error === "offline" ? "Keine Verbindung" : "Datei nicht mehr verfügbar"}
        </h1>
        <p className="text-sm text-text-secondary">
          {error === "offline"
            ? "Dieses Video wurde nicht für die Offline-Wiedergabe gespeichert. Verbinde dich mit dem Internet, um es anzusehen."
            : "Das Video wurde von der NAS gelöscht oder ist abgelaufen."}
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

  const toggleOffline = async () => {
    if (hasOfflineCopy) {
      setSavingOffline(true);
      try {
        await removeOffline(item.id);
        setHasOfflineCopy(false);
        showToast("Offline-Kopie entfernt");
      } finally {
        setSavingOffline(false);
      }
      return;
    }
    setSavingOffline(true);
    setSaveProgressPct(0);
    try {
      await saveOffline(item, setSaveProgressPct);
      setHasOfflineCopy(true);
      showToast("Heruntergeladen - offline in der App und auf dem Gerät verfügbar");
    } catch {
      showToast("Offline-Speicherung fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      setSavingOffline(false);
      setSaveProgressPct(null);
    }
  };

  const deleteFromServer = async () => {
    setBusy(true);
    try {
      await api.deleteHistoryItem(item.id);
      setShowDeleteConfirm(false);
      showToast("Datei von NAS gelöscht");
      router.push("/library");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-safe-left px-5 pb-4 pt-6 pr-safe-right">
      <div className="mx-auto max-w-2xl">
        <VideoPlayer itemId={item.id} />
      </div>

      <h1 className="mt-4 text-card-title">{item.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-text-muted">
        {item.channelName && <span>{item.channelName}</span>}
        {renderedFromOfflineCache ? (
          <span className="rounded-pill bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            Offline
          </span>
        ) : (
          <SourceBadge isAutomatic={item.isAutomaticallyPrepared} sourceName={item.sourceName} />
        )}
      </div>
      <p className="mt-1 text-meta text-text-muted">
        {[formatDuration(item.duration), item.selectedQuality, formatBytes(item.fileSize)]
          .filter((part) => part && part !== "-")
          .join(" - ")}
      </p>
      {item.createdAt && (
        <p className="mt-1 text-meta text-text-muted">Download auf NAS: {formatDate(item.createdAt)}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Von vorne starten"
          disabled={busy}
          onClick={resetProgress}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border text-base disabled:opacity-50"
        >
          ↺
        </button>
        <button
          type="button"
          aria-label={hasOfflineCopy ? "Heruntergeladene Kopie entfernen" : "Herunterladen (Gerät + offline in der App)"}
          disabled={savingOffline}
          onClick={toggleOffline}
          className={`flex min-h-10 min-w-10 items-center justify-center rounded-md border text-base disabled:opacity-50 ${
            hasOfflineCopy ? "border-success bg-success/15 text-success" : "border-border"
          }`}
        >
          {savingOffline ? (
            <span className="text-xs font-medium">{saveProgressPct !== null ? `${saveProgressPct}%` : "…"}</span>
          ) : (
            "⬇"
          )}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.originalUrl && (
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium"
          >
            Original öffnen
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-md border border-error/40 px-2.5 py-1.5 text-xs font-medium text-error disabled:opacity-50"
        >
          Von NAS löschen
        </button>
      </div>

      <ConfirmationDialog
        open={showDeleteConfirm}
        title="Datei von NAS löschen?"
        description="Die Datei wird endgültig von der NAS entfernt und steht nicht mehr zum Download bereit."
        confirmLabel="Löschen"
        destructive
        busy={busy}
        onConfirm={deleteFromServer}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </main>
  );
}
