"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SourceBadge } from "@/components/SourceBadge";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Skeleton } from "@/components/Skeleton";
import { IOSSaveInstructions, SEEN_INSTRUCTIONS_KEY } from "@/components/IOSSaveInstructions";
import { DeviceFileInstructions } from "@/components/DeviceFileInstructions";
import { getOfflineMeta, isOffline, removeOffline, saveOfflineInApp, triggerDeviceDownload } from "@/lib/offlineStore";
import {
  forgetDownloadedToDevice,
  isDownloadedToDevice,
  markDownloadedToDevice,
} from "@/lib/deviceDownloadStore";
import {
  setDownloadProgress,
  startTracking,
  stopTracking,
  useInAppDownloadProgress,
} from "@/lib/activeDownloadsStore";
import {
  cancelQueuedDownload,
  cancelRunningDownload,
  enqueueDownload,
  useDownloadQueueStatus,
} from "@/lib/downloadQueueStore";
import { shouldDownloadToDevice, shouldStartDownload } from "@/lib/wifiGate";
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
  const searchParams = useSearchParams();
  const autoPlay = searchParams.get("autoplay") === "1";
  const [item, setItem] = useState<LibraryItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [renderedFromOfflineCache, setRenderedFromOfflineCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasOfflineCopy, setHasOfflineCopy] = useState(false);
  const [removingOffline, setRemovingOffline] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveOfflineConfirm, setShowRemoveOfflineConfirm] = useState(false);
  const [showCancelDownloadConfirm, setShowCancelDownloadConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const { showToast } = useToast();
  const { pct: saveProgressPct } = useInAppDownloadProgress(videoId);
  const queueStatus = useDownloadQueueStatus(videoId);

  useEffect(() => {
    let cancelled = false;
    // No single-item detail endpoint exists in the Phase 2 API contract, so
    // metadata comes from the same /api/library listing the Mediathek uses.
    // userId=all: this page can be reached for any family member's item (the
    // shared Mediathek links here), not just the current user's own - the
    // default library scope would otherwise 404 someone else's video.
    api
      .library({ userId: "all" })
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
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/login");
          return;
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    isOffline(videoId).then((value) => {
      if (!cancelled) setHasOfflineCopy(value);
    });
    setDeviceDownloaded(isDownloadedToDevice(videoId));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (item === undefined) {
    return (
      <main className="mx-auto max-w-2xl pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pb-4 pt-6 md:max-w-4xl">
        <div className="mx-auto max-w-2xl md:max-w-none">
          <Skeleton className="aspect-video w-full" />
        </div>
        <Skeleton className="mt-4 h-6 w-3/4" />
        <div className="mt-2 flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16 rounded-pill" />
        </div>
        <Skeleton className="mt-2 h-4 w-1/2" />
        <div className="mt-4 flex items-center gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-4 pt-6">
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

  const removeOfflineCopy = async () => {
    setRemovingOffline(true);
    try {
      await removeOffline(item.id);
      setHasOfflineCopy(false);
      setShowRemoveOfflineConfirm(false);
      showToast("Offline-Kopie entfernt");
    } finally {
      setRemovingOffline(false);
    }
  };

  const startOfflineInApp = async (signal: AbortSignal) => {
    startTracking(item.id);
    try {
      await saveOfflineInApp(item, (pct) => setDownloadProgress(item.id, pct), signal);
      setHasOfflineCopy(true);
      showToast("Offline in der App gespeichert");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        showToast("Download abgebrochen");
      } else {
        showToast("Offline-Speicherung fehlgeschlagen - evtl. zu wenig Speicherplatz");
      }
    } finally {
      stopTracking(item.id);
    }
  };

  const handleOfflineButtonClick = async () => {
    if (hasOfflineCopy) {
      setShowRemoveOfflineConfirm(true);
    } else if (queueStatus === "downloading") {
      setShowCancelDownloadConfirm(true);
    } else if (queueStatus === "queued") {
      cancelQueuedDownload(item.id);
    } else if (queueStatus === "idle") {
      if (!(await shouldStartDownload())) {
        showToast("Download übersprungen (nicht im WLAN)");
        return;
      }
      enqueueDownload(item.id, startOfflineInApp, { title: item.title, thumbnail: item.thumbnailPath });
    }
  };

  const confirmCancelDownload = () => {
    cancelRunningDownload(item.id);
    setShowCancelDownloadConfirm(false);
  };

  const saveToDevice = async () => {
    if (!(await shouldDownloadToDevice())) {
      showToast("Geräte-Download übersprungen (nicht im WLAN)");
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(SEEN_INSTRUCTIONS_KEY) !== "1") {
      setShowInstructions(true);
      localStorage.setItem(SEEN_INSTRUCTIONS_KEY, "1");
    }
    triggerDeviceDownload(item.id);
    markDownloadedToDevice(item.id);
    setDeviceDownloaded(true);
    showToast("Download gestartet - läuft weiter, auch wenn du die App verlässt");
  };

  const forgetDevice = () => {
    forgetDownloadedToDevice(item.id);
    setDeviceDownloaded(false);
    setShowDeviceInstructions(false);
    showToast("Aus der Geräte-Liste entfernt");
  };

  const handleDeviceButtonClick = () => {
    if (deviceDownloaded) {
      setShowDeviceInstructions(true);
    } else {
      saveToDevice();
    }
  };

  const deleteFromServer = async () => {
    setBusy(true);
    try {
      await api.deleteHistoryItem(item.id);
      if (hasOfflineCopy) {
        await removeOffline(item.id);
        setHasOfflineCopy(false);
      }
      setShowDeleteConfirm(false);
      showToast("Datei von NAS gelöscht");
      router.push("/library");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pb-4 pt-6 md:max-w-4xl">
      {/* Capped at max-w-2xl (matches the text column below) below md, but
          allowed to use the wider `main` once the desktop sidebar is
          showing (see AppShell/DesktopSidebar's own md: breakpoint) - e.g.
          landscape on a large-enough phone or iPad - instead of staying
          centered at a fixed 42rem regardless of how much room is actually
          next to the sidebar. On narrower landscape phones (still below
          md, no sidebar) this has no effect: the video simply fills the
          page's own width, same as portrait. */}
      <div className="mx-auto max-w-2xl md:max-w-none">
        <VideoPlayer
          itemId={item.id}
          title={item.title}
          channelName={item.channelName}
          thumbnail={item.thumbnailPath}
          autoPlay={autoPlay}
        />
      </div>

      <div className="mx-auto max-w-2xl">
        <h1 className="mt-4 text-card-title notranslate" translate="no">
          {item.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-text-muted">
          {item.channelName && (
            <span className="notranslate" translate="no">
              {item.channelName}
            </span>
          )}
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

        <div className="mt-4 flex gap-2 rounded-2xl bg-surface-elevated p-1">
          <button
            type="button"
            aria-label={
              queueStatus === "downloading"
                ? "Download abbrechen"
                : hasOfflineCopy
                  ? "Offline-Kopie in der App entfernen"
                  : "In der App speichern"
            }
            disabled={removingOffline}
            onClick={handleOfflineButtonClick}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold disabled:opacity-50 ${
              hasOfflineCopy ? "bg-success/15 text-success" : "text-text-secondary"
            }`}
          >
            {queueStatus !== "idle"
              ? saveProgressPct !== null
                ? `${saveProgressPct}%`
                : "…"
              : hasOfflineCopy
                ? "✓ App"
                : "In der App"}
          </button>
          <button
            type="button"
            aria-label={deviceDownloaded ? "Auf Gerät gespeichert - verwalten" : "Auf Gerät speichern"}
            onClick={handleDeviceButtonClick}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold ${
              deviceDownloaded ? "bg-success/15 text-success" : "text-text-secondary"
            }`}
          >
            {deviceDownloaded ? "✓ Gerät" : "Gerät"}
          </button>
          {item.originalUrl && (
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] text-text-secondary"
            >
              🔗 Original
            </a>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs font-medium text-error disabled:opacity-50"
          >
            Von NAS löschen
          </button>
        </div>
      </div>

      <ConfirmationDialog
        open={showDeleteConfirm}
        title="Datei von NAS löschen?"
        description="Die Datei wird endgültig von der NAS entfernt und steht nicht mehr zum Download bereit. Eine in der App gespeicherte Offline-Kopie wird ebenfalls entfernt. Falls du sie zusätzlich auf dein Gerät heruntergeladen hast, bleibt diese davon unberührt."
        confirmLabel="Löschen"
        destructive
        busy={busy}
        onConfirm={deleteFromServer}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmationDialog
        open={showRemoveOfflineConfirm}
        title="Offline-Kopie entfernen?"
        description="Die Datei wird aus der App entfernt. Falls du sie zusätzlich auf dein Gerät heruntergeladen hast (z. B. in Dateien), bleibt diese davon unberührt und muss dort separat gelöscht werden."
        confirmLabel="Entfernen"
        destructive
        busy={removingOffline}
        onConfirm={removeOfflineCopy}
        onCancel={() => setShowRemoveOfflineConfirm(false)}
      />

      <ConfirmationDialog
        open={showCancelDownloadConfirm}
        title="Download abbrechen?"
        description="Der laufende Download in die App wird abgebrochen. Bereits geladene Daten werden verworfen."
        confirmLabel="Abbrechen"
        destructive
        onConfirm={confirmCancelDownload}
        onCancel={() => setShowCancelDownloadConfirm(false)}
      />

      {showInstructions && (
        <IOSSaveInstructions onClose={() => setShowInstructions(false)} />
      )}

      {showDeviceInstructions && (
        <DeviceFileInstructions onForget={forgetDevice} onClose={() => setShowDeviceInstructions(false)} />
      )}
    </main>
  );
}
