"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SourceBadge } from "@/components/SourceBadge";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
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
import { shouldDownloadToDevice } from "@/lib/wifiGate";
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const { showToast } = useToast();
  const { saving: savingOffline, pct: saveProgressPct } = useInAppDownloadProgress(videoId);

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
    setDeviceDownloaded(isDownloadedToDevice(videoId));
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

  const startOfflineInApp = async () => {
    startTracking(item.id);
    try {
      await saveOfflineInApp(item, (pct) => setDownloadProgress(item.id, pct));
      setHasOfflineCopy(true);
      showToast("Offline in der App gespeichert");
    } catch {
      showToast("Offline-Speicherung fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      stopTracking(item.id);
    }
  };

  const handleOfflineButtonClick = () => {
    if (hasOfflineCopy) {
      setShowRemoveOfflineConfirm(true);
    } else {
      startOfflineInApp();
    }
  };

  const saveToDevice = () => {
    if (!shouldDownloadToDevice()) {
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
        <VideoPlayer
          itemId={item.id}
          title={item.title}
          channelName={item.channelName}
          thumbnail={item.thumbnailPath}
          autoPlay={autoPlay}
        />
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
          aria-label={hasOfflineCopy ? "Offline-Kopie in der App entfernen" : "In der App speichern"}
          disabled={savingOffline || removingOffline}
          onClick={handleOfflineButtonClick}
          className={`relative flex min-h-10 min-w-10 items-center justify-center rounded-md border text-base disabled:opacity-50 ${
            hasOfflineCopy ? "border-success bg-success/15 text-success" : "border-border"
          }`}
        >
          {savingOffline ? (
            <span className="text-xs font-medium">{saveProgressPct !== null ? `${saveProgressPct}%` : "…"}</span>
          ) : (
            "⬇"
          )}
          {hasOfflineCopy && !savingOffline && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-[10px] leading-none text-white">
              ✓
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label={deviceDownloaded ? "Auf Gerät gespeichert - verwalten" : "Auf Gerät speichern"}
          onClick={handleDeviceButtonClick}
          className={`relative flex min-h-10 min-w-10 items-center justify-center rounded-md border text-base ${
            deviceDownloaded ? "border-success bg-success/15 text-success" : "border-border"
          }`}
        >
          📲
          {deviceDownloaded && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-[10px] leading-none text-white">
              ✓
            </span>
          )}
        </button>
      </div>

      {item.originalUrl && (
        <div className="mt-2">
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium"
          >
            Original öffnen
          </a>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-md border border-error/40 px-4 py-2 text-xs font-medium text-error disabled:opacity-50"
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

      {showInstructions && (
        <IOSSaveInstructions onClose={() => setShowInstructions(false)} />
      )}

      {showDeviceInstructions && (
        <DeviceFileInstructions onForget={forgetDevice} onClose={() => setShowDeviceInstructions(false)} />
      )}
    </main>
  );
}
