"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { deriveMediaState } from "@/lib/mediaStateConfig";
import { MediaStatusBadge } from "./MediaStatusBadge";
import { SourceBadge } from "./SourceBadge";
import { ConfirmationDialog } from "./ConfirmationDialog";
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
import { shouldDownloadToDevice } from "@/lib/wifiGate";

interface Props {
  item: LibraryItem;
  onChanged?: () => void;
  /** Show the "downloaded by" badge - only relevant while browsing another
   * family member's or everyone's downloads via the user filter. */
  showOwner?: boolean;
}

export function MediaCard({ item, onChanged, showOwner }: Props) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveOfflineConfirm, setShowRemoveOfflineConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [offline, setOffline] = useState(false);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [saveProgressPct, setSaveProgressPct] = useState<number | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
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
    setSavingOffline(true);
    setSaveProgressPct(0);
    try {
      await saveOfflineInApp(item, setSaveProgressPct);
      setOffline(true);
      showToast("Offline in der App gespeichert");
    } catch {
      showToast("Offline-Speicherung fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      setSavingOffline(false);
      setSaveProgressPct(null);
    }
  };

  const removeOfflineCopy = async () => {
    setSavingOffline(true);
    try {
      await removeOffline(item.id);
      setOffline(false);
      setShowRemoveOfflineConfirm(false);
      showToast("Offline-Kopie entfernt");
    } finally {
      setSavingOffline(false);
    }
  };

  const handleOfflineButtonClick = () => {
    if (offline) {
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
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <Link href={`/library/${item.id}`} className="flex items-start gap-3">
        {item.thumbnailPath && !thumbnailFailed ? (
          <Image
            src={item.thumbnailPath}
            alt=""
            width={112}
            height={63}
            unoptimized
            onError={() => setThumbnailFailed(true)}
            className="h-[63px] w-28 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-[63px] w-28 shrink-0 items-center justify-center rounded bg-surface-elevated text-lg text-text-muted">
            🎬
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-title">{item.title}</p>
          {item.channelName && (
            <p className="truncate text-meta text-text-muted">{item.channelName}</p>
          )}
          <p className="mt-1 text-meta text-text-muted">
            {[formatDuration(item.duration), item.selectedQuality, formatBytes(item.fileSize)]
              .filter((part) => part && part !== "-")
              .join(" - ")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {state !== "started" && <MediaStatusBadge state={state} />}
            {item.isAutomaticallyPrepared && (
              <SourceBadge isAutomatic sourceName={item.sourceName} />
            )}
            {showOwner && item.ownerName && (
              <span className="rounded-pill border border-border px-2 py-0.5 text-meta text-text-muted">
                👤 {item.ownerName}
              </span>
            )}
          </div>
        </div>
      </Link>

      {hasProgress && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-progress-track">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/library/${item.id}?autoplay=1`}
          aria-label={hasProgress ? "Fortsetzen" : "Abspielen"}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md bg-accent text-base text-white"
        >
          ▶
        </Link>
        <button
          type="button"
          aria-label={offline ? "Offline-Kopie in der App entfernen" : "In der App speichern"}
          disabled={savingOffline}
          onClick={handleOfflineButtonClick}
          className={`flex min-h-10 min-w-10 items-center justify-center rounded-md border text-base disabled:opacity-50 ${
            offline ? "border-success bg-success/15 text-success" : "border-border"
          }`}
        >
          {savingOffline ? (
            <span className="text-xs font-medium">{saveProgressPct !== null ? `${saveProgressPct}%` : "…"}</span>
          ) : (
            "⬇"
          )}
        </button>
        <button
          type="button"
          aria-label={deviceDownloaded ? "Auf Gerät gespeichert - verwalten" : "Auf Gerät speichern"}
          onClick={handleDeviceButtonClick}
          className={`flex min-h-10 min-w-10 items-center justify-center rounded-md border text-base ${
            deviceDownloaded ? "border-success bg-success/15 text-success" : "border-border"
          }`}
        >
          📲
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-meta text-text-muted">
          Download auf NAS: {formatDate(item.createdAt)}
          {item.expiresAt ? ` - Läuft ab: ${formatDate(item.expiresAt)}` : ""}
        </p>
        <div className="flex flex-wrap gap-1.5">
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
        busy={savingOffline}
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
}
