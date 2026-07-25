"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { deriveMediaState } from "@/lib/mediaStateConfig";
import { MediaStatusBadge } from "./MediaStatusBadge";
import { SourceBadge } from "./SourceBadge";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { BottomSheet } from "./BottomSheet";
import { IOSSaveInstructions, SEEN_INSTRUCTIONS_KEY } from "./IOSSaveInstructions";
import { DeviceFileInstructions } from "./DeviceFileInstructions";
import { useToast } from "./ToastProvider";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { isOffline, removeOffline, saveOfflineInApp, triggerDeviceDownload } from "@/lib/offlineStore";
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
import { cancelQueuedDownload, enqueueDownload, useDownloadQueueStatus } from "@/lib/downloadQueueStore";
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const [removingOffline, setRemovingOffline] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const { pct: saveProgressPct } = useInAppDownloadProgress(item.id);
  const queueStatus = useDownloadQueueStatus(item.id);
  const { showToast } = useToast();
  const state = deriveMediaState(item);
  const hasProgress = Boolean(item.progress && !item.progress.completed && item.progress.positionSeconds > 0);
  const progressPct = item.progress?.percentage ?? 0;

  useEffect(() => {
    let cancelled = false;
    isOffline(item.id).then((value) => {
      if (!cancelled) setOffline(value);
    });
    setDeviceDownloaded(isDownloadedToDevice(item.id));
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const startOfflineInApp = async () => {
    startTracking(item.id);
    try {
      await saveOfflineInApp(item, (pct) => setDownloadProgress(item.id, pct));
      setOffline(true);
      showToast("Offline in der App gespeichert");
    } catch {
      showToast("Offline-Speicherung fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      stopTracking(item.id);
    }
  };

  const removeOfflineCopy = async () => {
    setRemovingOffline(true);
    try {
      await removeOffline(item.id);
      setOffline(false);
      setShowRemoveOfflineConfirm(false);
      showToast("Offline-Kopie entfernt");
    } finally {
      setRemovingOffline(false);
    }
  };

  const handleOfflineButtonClick = () => {
    if (offline) {
      setShowRemoveOfflineConfirm(true);
    } else if (queueStatus === "queued") {
      cancelQueuedDownload(item.id);
    } else if (queueStatus === "idle") {
      if (!shouldStartDownload()) {
        showToast("Download übersprungen (nicht im WLAN)");
        return;
      }
      enqueueDownload(item.id, startOfflineInApp);
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
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const savingInApp = queueStatus !== "idle";

  return (
    <div className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-surface">
      <Link href={`/library/${item.id}`} className="relative shrink-0">
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

      <Link href={`/library/${item.id}`} className="min-w-0 flex-1">
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

      <div className="flex shrink-0 flex-col items-center gap-2">
        <Link
          href={`/library/${item.id}?autoplay=1`}
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
            disabled={queueStatus === "downloading" || removingOffline}
            onClick={() => {
              setMenuOpen(false);
              handleOfflineButtonClick();
            }}
            className="flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-sm font-medium text-text-primary disabled:opacity-50"
          >
            <span>{offline ? "Offline-Kopie in der App entfernen" : "In der App speichern"}</span>
            {savingInApp && (
              <span className="text-xs text-text-muted">{saveProgressPct !== null ? `${saveProgressPct}%` : "…"}</span>
            )}
          </button>
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
    </div>
  );
});
