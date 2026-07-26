"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { LibraryFolder, LibraryItem } from "@/lib/types";
import { deriveMediaState } from "@/lib/mediaStateConfig";
import { MediaStatusBadge } from "./MediaStatusBadge";
import { SourceBadge } from "./SourceBadge";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { BottomSheet } from "./BottomSheet";
import { IOSSaveInstructions, SEEN_INSTRUCTIONS_KEY } from "./IOSSaveInstructions";
import { DeviceFileInstructions } from "./DeviceFileInstructions";
import { MediaDownloadStatusButton, type DownloadButtonState } from "./MediaDownloadStatusButton";
import { useToast } from "./ToastProvider";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { removeOffline, saveOfflineInApp, StorageQuotaError, triggerDeviceDownload } from "@/lib/offlineStore";
import { setOfflineStatus, useIsOffline } from "@/lib/offlineStatusStore";
import {
  clearFailed,
  markFailed,
  removeFailedEntry,
  useDownloadFailed,
  useDownloadFailureMessage,
} from "@/lib/downloadFailureStore";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
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

interface Props {
  item: LibraryItem;
  onChanged?: () => void;
  /** Show the "downloaded by" badge - only relevant while browsing another
   * family member's or everyone's downloads via the user filter. */
  showOwner?: boolean;
}

export const MediaCard = memo(function MediaCard({ item, onChanged, showOwner }: Props) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveOfflineConfirm, setShowRemoveOfflineConfirm] = useState(false);
  const [showCancelDownloadConfirm, setShowCancelDownloadConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const [removingOffline, setRemovingOffline] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const offline = useIsOffline(item.id);
  const { pct: saveProgressPct } = useInAppDownloadProgress(item.id);
  const queueStatus = useDownloadQueueStatus(item.id);
  const downloadFailed = useDownloadFailed(item.id);
  const downloadFailureMessage = useDownloadFailureMessage(item.id);
  const online = useOnlineStatus();
  const { showToast } = useToast();
  const state = deriveMediaState(item);
  const hasProgress = Boolean(item.progress && !item.progress.completed && item.progress.positionSeconds > 0);
  const progressPct = item.progress?.percentage ?? 0;
  // Whether this item can actually be opened right now: available whenever
  // it has an in-app offline copy (playable regardless of connectivity), or
  // whenever there is a connection to stream it from. Never based on
  // whether the last metadata refresh succeeded - a stale-but-present item
  // stays interactive.
  const unavailableOffline = !online && !offline;

  const blockIfUnavailable = (e: React.MouseEvent) => {
    if (!unavailableOffline) return;
    e.preventDefault();
    showToast("Dieses Video ist offline nicht verfügbar. Verbinde dich mit dem Internet, um es zu öffnen.");
  };

  useEffect(() => {
    setDeviceDownloaded(isDownloadedToDevice(item.id));
  }, [item.id]);

  const startOfflineInApp = async (signal: AbortSignal) => {
    startTracking(item.id);
    try {
      await saveOfflineInApp(item, (pct) => setDownloadProgress(item.id, pct), signal);
      setOfflineStatus(item.id, true);
      clearFailed(item.id);
      showToast("Offline in der App gespeichert");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        showToast("Download abgebrochen");
      } else if (err instanceof StorageQuotaError) {
        const message = `Nicht genug Speicherplatz. Benötigt: ~${formatBytes(err.requiredBytes)}, verfügbar: ~${formatBytes(err.availableBytes)}.`;
        markFailed(item.id, message);
        showToast(message);
      } else {
        const message = "Offline-Speicherung fehlgeschlagen. Dein Fortschritt wurde gespeichert - erneut versuchen setzt fort.";
        markFailed(item.id, message);
        showToast(message);
      }
    } finally {
      stopTracking(item.id);
    }
  };

  const removeFailedDownload = () => {
    removeFailedEntry(item.id);
    showToast("Fehlgeschlagener Download entfernt");
  };

  const removeOfflineCopy = async () => {
    setRemovingOffline(true);
    try {
      await removeOffline(item.id);
      setOfflineStatus(item.id, false);
      setShowRemoveOfflineConfirm(false);
      showToast("Download entfernt");
    } finally {
      setRemovingOffline(false);
    }
  };

  const startDownload = async () => {
    if (!(await shouldStartDownload())) {
      showToast("Download übersprungen (nicht im WLAN)");
      return;
    }
    clearFailed(item.id);
    enqueueDownload(item.id, startOfflineInApp, { title: item.title, thumbnail: item.thumbnailPath });
  };

  const handleOfflineButtonClick = async () => {
    if (offline) {
      setShowRemoveOfflineConfirm(true);
    } else if (queueStatus === "downloading") {
      setShowCancelDownloadConfirm(true);
    } else if (queueStatus === "queued") {
      cancelQueuedDownload(item.id);
    } else if (queueStatus === "idle") {
      await startDownload();
    }
  };

  const downloadButtonState: DownloadButtonState = offline
    ? "downloaded"
    : queueStatus === "downloading"
      ? "downloading"
      : queueStatus === "queued"
        ? "queued"
        : downloadFailed
          ? "failed"
          : !online
            ? "unavailable"
            : "idle";

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
      if (offline) {
        await removeOffline(item.id);
        setOfflineStatus(item.id, false);
      }
      setShowDeleteConfirm(false);
      showToast("Datei von NAS gelöscht");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const openMoveSheet = () => {
    setShowMoveSheet(true);
    if (!folders) {
      api
        .listFolders()
        .then(setFolders)
        .catch(() => showToast("Ordner konnten nicht geladen werden"));
    }
  };

  const moveToFolder = async (folder: LibraryFolder) => {
    setMovingFolderId(folder.id);
    try {
      await api.moveItemToFolder(item.id, folder.id);
      setShowMoveSheet(false);
      showToast(`In "${folder.name}" verschoben`);
      onChanged?.();
    } catch {
      showToast("Verschieben fehlgeschlagen");
    } finally {
      setMovingFolderId(null);
    }
  };

  const savingInApp = queueStatus !== "idle";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-surface ${
        unavailableOffline ? "opacity-50" : ""
      }`}
    >
      <Link
        href={`/library/${item.id}`}
        onClick={blockIfUnavailable}
        aria-disabled={unavailableOffline}
        className="relative shrink-0"
      >
        {item.thumbnailPath && !thumbnailFailed ? (
          <Image
            src={item.thumbnailPath}
            alt=""
            width={74}
            height={74}
            unoptimized
            onError={() => setThumbnailFailed(true)}
            className="h-[74px] w-[74px] rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-[74px] w-[74px] items-center justify-center rounded-xl border border-border bg-surface-elevated text-lg text-text-muted">
            🎬
          </div>
        )}
        {offline && (
          <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-background bg-success text-[11px] leading-none text-white">
            ✓
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/library/${item.id}`} onClick={blockIfUnavailable} aria-disabled={unavailableOffline} className="block">
          <p className="truncate text-card-title notranslate" translate="no">
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-meta text-text-muted notranslate" translate="no">
            {item.channelName ? `${item.channelName} · ` : ""}
            {[formatDuration(item.duration), item.selectedQuality, formatBytes(item.fileSize)]
              .filter((part) => part && part !== "-")
              .join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {state !== "started" && <MediaStatusBadge state={state} />}
            {item.isAutomaticallyPrepared && <SourceBadge isAutomatic sourceName={item.sourceName} />}
            {offline && (
              <span className="rounded-pill bg-success/15 px-2 py-0.5 text-meta text-success">✓ In der App</span>
            )}
            {deviceDownloaded && (
              <span className="rounded-pill bg-success/15 px-2 py-0.5 text-meta text-success">✓ Auf Gerät</span>
            )}
            {unavailableOffline && (
              <span className="rounded-pill border border-border px-2 py-0.5 text-meta text-text-muted">
                ☁️ Nur online
              </span>
            )}
            {showOwner && item.ownerName && (
              <span className="rounded-pill border border-border px-2 py-0.5 text-meta text-text-muted">
                👤 {item.ownerName}
              </span>
            )}
          </div>
          {hasProgress && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-progress-track">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          )}
        </Link>
        <div className="mt-1.5 flex justify-end">
          <MediaDownloadStatusButton
            state={downloadButtonState}
            progressPct={saveProgressPct}
            unavailableReason={!online ? "Keine Internetverbindung" : undefined}
            onDownload={handleOfflineButtonClick}
            onCancelQueued={handleOfflineButtonClick}
            onCancelDownloading={handleOfflineButtonClick}
            onRetry={handleOfflineButtonClick}
            onRequestRemove={handleOfflineButtonClick}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        <Link
          href={`/library/${item.id}?autoplay=1`}
          onClick={blockIfUnavailable}
          aria-disabled={unavailableOffline}
          aria-label={hasProgress ? "Fortsetzen" : "Abspielen"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm text-white"
        >
          ▶
        </Link>
        <button
          type="button"
          aria-label="Weitere Aktionen"
          onClick={() => setMenuOpen(true)}
          className="flex h-6 w-6 items-center justify-center text-base text-text-muted"
        >
          ⋯
        </button>
      </div>

      <BottomSheet open={menuOpen} title={item.title} onClose={() => setMenuOpen(false)}>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={removingOffline}
            onClick={() => {
              setMenuOpen(false);
              handleOfflineButtonClick();
            }}
            className="flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-sm font-medium text-text-primary disabled:opacity-50"
          >
            <span>
              {queueStatus === "downloading"
                ? "Download abbrechen"
                : queueStatus === "queued"
                  ? "In Warteschlange - abbrechen"
                  : offline
                    ? "Download entfernen"
                    : downloadFailed
                      ? "Download fehlgeschlagen - erneut versuchen"
                      : "In der App speichern"}
            </span>
            {savingInApp && (
              <span className="text-xs text-text-muted">{saveProgressPct !== null ? `${saveProgressPct}%` : "…"}</span>
            )}
          </button>
          {downloadFailed && (
            <>
              {downloadFailureMessage && (
                <p className="px-3 pb-1 text-meta text-error">{downloadFailureMessage}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  removeFailedDownload();
                }}
                className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-error"
              >
                Fehlgeschlagenen Download entfernen
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              handleDeviceButtonClick();
            }}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary"
          >
            {deviceDownloaded ? "Auf Gerät gespeichert - verwalten" : "Auf Gerät speichern"}
          </button>
          {!item.folderId && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openMoveSheet();
              }}
              className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary"
            >
              In Ordner verschieben
            </button>
          )}
          {item.originalUrl && (
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary"
            >
              Original öffnen
            </a>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              setShowDeleteConfirm(true);
            }}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-error disabled:opacity-50"
          >
            Von NAS löschen
          </button>
          <p className="mt-1 px-3 text-meta text-text-muted">
            Download auf NAS: {formatDate(item.createdAt)}
            {item.expiresAt ? ` - Läuft ab: ${formatDate(item.expiresAt)}` : ""}
          </p>
        </div>
      </BottomSheet>

      <BottomSheet open={showMoveSheet} title="In Ordner verschieben" onClose={() => setShowMoveSheet(false)}>
        <div className="flex flex-col gap-1">
          {folders === null && <p className="px-3 py-2 text-sm text-text-muted">Ordner werden geladen...</p>}
          {folders !== null && folders.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-muted">
              Noch keine Ordner vorhanden - lade eine Playlist herunter, um einen Ordner anzulegen.
            </p>
          )}
          {folders?.map((folder) => (
            <button
              key={folder.id}
              type="button"
              disabled={movingFolderId !== null}
              onClick={() => moveToFolder(folder)}
              className="flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-sm font-medium text-text-primary disabled:opacity-50"
            >
              <span className="truncate notranslate" translate="no">
                📁 {folder.name}
              </span>
              <span className="shrink-0 text-xs text-text-muted">
                {movingFolderId === folder.id ? "…" : `${folder.itemCount} Videos`}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

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
        title="Download entfernen?"
        description="Die heruntergeladene Datei wird von diesem Gerät entfernt. Das Video bleibt in deiner Mediathek verfügbar. Falls du sie zusätzlich auf dein Gerät heruntergeladen hast (z. B. in Dateien), bleibt diese davon unberührt und muss dort separat gelöscht werden."
        confirmLabel="Download entfernen"
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
    </div>
  );
});
