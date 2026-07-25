"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { JobItem } from "@/lib/types";
import { api } from "@/lib/api";
import { formatBytes, formatCountdown, formatDuration } from "@/lib/format";
import { conversionNoteLabel } from "@/lib/statusLabels";
import { IOSSaveInstructions, SEEN_INSTRUCTIONS_KEY } from "./IOSSaveInstructions";
import { DeviceFileInstructions } from "./DeviceFileInstructions";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { BottomSheet } from "./BottomSheet";
import { useToast } from "./ToastProvider";
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
import {
  cancelQueuedDownload,
  cancelRunningDownload,
  enqueueDownload,
  useDownloadQueueStatus,
} from "@/lib/downloadQueueStore";
import { shouldDownloadToDevice, shouldStartDownload } from "@/lib/wifiGate";

interface Props {
  item: JobItem;
  onChanged?: () => void;
}

export function DownloadCard({ item, onChanged }: Props) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveOfflineConfirm, setShowRemoveOfflineConfirm] = useState(false);
  const [showCancelDownloadConfirm, setShowCancelDownloadConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const [removingOffline, setRemovingOffline] = useState(false);
  const { showToast } = useToast();
  const { pct: saveProgressPct } = useInAppDownloadProgress(item.id);
  const queueStatus = useDownloadQueueStatus(item.id);

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

  const removeOfflineCopy = async () => {
    setRemovingOffline(true);
    try {
      await removeOffline(item.id);
      setOffline(false);
      setShowRemoveOfflineConfirm(false);
      showToast("Heruntergeladene Kopie entfernt");
    } finally {
      setRemovingOffline(false);
    }
  };

  const startOfflineInApp = async (signal: AbortSignal) => {
    startTracking(item.id);
    try {
      await saveOfflineInApp(
        {
          id: item.id,
          title: item.title,
          channelName: item.channelName,
          duration: item.duration,
          selectedQuality: item.selectedQuality,
          fileSize: item.finalFileSize,
          thumbnailPath: item.thumbnail,
        },
        (pct) => setDownloadProgress(item.id, pct),
        signal
      );
      setOffline(true);
      showToast("Offline in der App gespeichert");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        showToast("Download abgebrochen");
      } else {
        showToast("Speichern fehlgeschlagen - evtl. zu wenig Speicherplatz");
      }
    } finally {
      stopTracking(item.id);
    }
  };

  const handleOfflineButtonClick = async () => {
    if (offline) {
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
      enqueueDownload(item.id, startOfflineInApp, { title: item.title, thumbnail: item.thumbnail });
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

  const recreate = async () => {
    setBusy(true);
    try {
      await api.reprepareHistoryItem(item.id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const deleteFromServer = async () => {
    setBusy(true);
    try {
      await api.deleteHistoryItem(item.id);
      if (offline) {
        await removeOffline(item.id);
        setOffline(false);
      }
      setShowDeleteConfirm(false);
      showToast("Datei von NAS gelöscht");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const savingInApp = queueStatus !== "idle";

  return (
    <div className="rounded-[18px] border border-border bg-surface p-3.5">
      <div className="flex items-center gap-3">
        {item.thumbnail ? (
          <Image
            src={item.thumbnail}
            alt=""
            width={44}
            height={44}
            unoptimized
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text-muted">
            🎬
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{item.title}</p>
          <p className="truncate text-meta text-text-muted">
            {conversionNoteLabel(item.conversionNote)} · bereit
          </p>
        </div>
        <Link
          href={`/library/${item.id}`}
          aria-label="Abspielen"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-white"
        >
          ▶
        </Link>
        <button
          type="button"
          aria-label="Weitere Aktionen"
          onClick={() => setMenuOpen(true)}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-base text-text-muted"
        >
          ⋯
        </button>
      </div>

      {item.expiresAt && (
        <p className="mt-2 text-meta text-warning">{formatCountdown(item.expiresAt)}</p>
      )}

      <BottomSheet open={menuOpen} title={item.title} onClose={() => setMenuOpen(false)}>
        <div className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-meta text-text-muted">
            {item.channelName ? `${item.channelName} · ` : ""}
            {[formatDuration(item.duration), item.selectedQuality, formatBytes(item.finalFileSize)]
              .filter(Boolean)
              .join(" · ")}
            {item.finalFormat ? ` · ${item.finalFormat.toUpperCase()}` : ""}
          </p>
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
                    ? "In der App - entfernen"
                    : "In der App speichern"}
            </span>
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
            {deviceDownloaded ? "Auf Gerät - verwalten" : "Auf Gerät speichern"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setShowInstructions(true);
            }}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary"
          >
            Wie finde ich die Datei danach?
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              recreate();
            }}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary disabled:opacity-50"
          >
            Erneut erstellen
          </button>
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
        </div>
      </BottomSheet>

      {showInstructions && (
        <IOSSaveInstructions onClose={() => setShowInstructions(false)} />
      )}

      {showDeviceInstructions && (
        <DeviceFileInstructions onForget={forgetDevice} onClose={() => setShowDeviceInstructions(false)} />
      )}

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
    </div>
  );
}
