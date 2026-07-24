"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { JobItem } from "@/lib/types";
import { api } from "@/lib/api";
import { formatBytes, formatCountdown, formatDuration } from "@/lib/format";
import { conversionNoteLabel } from "@/lib/statusLabels";
import { IOSSaveInstructions, SEEN_INSTRUCTIONS_KEY } from "./IOSSaveInstructions";
import { DeviceFileInstructions } from "./DeviceFileInstructions";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { useToast } from "./ToastProvider";
import { isOffline, removeOffline, saveOfflineInApp, triggerDeviceDownload } from "@/lib/offlineStore";
import {
  forgetDownloadedToDevice,
  isDownloadedToDevice,
  markDownloadedToDevice,
} from "@/lib/deviceDownloadStore";
import { shouldDownloadToDevice } from "@/lib/wifiGate";

interface Props {
  item: JobItem;
  onChanged?: () => void;
}

export function DownloadCard({ item, onChanged }: Props) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeviceInstructions, setShowDeviceInstructions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveOfflineConfirm, setShowRemoveOfflineConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [saveProgressPct, setSaveProgressPct] = useState<number | null>(null);
  const { showToast } = useToast();

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
    setSavingOffline(true);
    try {
      await removeOffline(item.id);
      setOffline(false);
      setShowRemoveOfflineConfirm(false);
      showToast("Heruntergeladene Kopie entfernt");
    } finally {
      setSavingOffline(false);
    }
  };

  const startOfflineInApp = async () => {
    setSavingOffline(true);
    setSaveProgressPct(0);
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
        setSaveProgressPct
      );
      setOffline(true);
      showToast("Offline in der App gespeichert");
    } catch {
      showToast("Speichern fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      setSavingOffline(false);
      setSaveProgressPct(null);
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
      setShowDeleteConfirm(false);
      showToast("Datei von NAS gelöscht");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex items-start gap-3">
        {item.thumbnail && (
          <Image
            src={item.thumbnail}
            alt=""
            width={80}
            height={45}
            unoptimized
            className="h-[45px] w-20 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          {item.channelName && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {item.channelName}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatDuration(item.duration)} - {item.selectedQuality} -{" "}
            {formatBytes(item.finalFileSize)}
            {item.finalFormat ? ` - ${item.finalFormat.toUpperCase()}` : ""}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {conversionNoteLabel(item.conversionNote)}
      </p>
      {item.expiresAt && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {formatCountdown(item.expiresAt)}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={savingOffline}
          onClick={handleOfflineButtonClick}
          className={`flex-1 rounded-lg px-4 py-3 text-center text-sm font-medium active:opacity-80 disabled:opacity-50 ${
            offline
              ? "border border-success bg-success/15 text-success"
              : "bg-brand text-white dark:bg-brand-dark dark:text-gray-950"
          }`}
        >
          {savingOffline
            ? saveProgressPct !== null
              ? `${saveProgressPct}%`
              : "Wird entfernt..."
            : offline
              ? "In der App - entfernen"
              : "In der App speichern"}
        </button>
        <button
          type="button"
          onClick={handleDeviceButtonClick}
          className={`flex-1 rounded-lg px-4 py-3 text-center text-sm font-medium active:opacity-80 ${
            deviceDownloaded
              ? "border border-success bg-success/15 text-success"
              : "border border-gray-300 dark:border-gray-700"
          }`}
        >
          {deviceDownloaded ? "Auf Gerät - verwalten" : "Auf Gerät speichern"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setShowInstructions(true)}
        className="mt-1.5 block w-full text-center text-xs font-medium text-brand underline dark:text-brand-dark"
      >
        Wie finde ich die Datei danach?
      </button>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={recreate}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-gray-700"
        >
          Erneut erstellen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
          className="flex-1 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
        >
          Von NAS löschen
        </button>
      </div>

      {showInstructions && (
        <IOSSaveInstructions onClose={() => setShowInstructions(false)} />
      )}

      {showDeviceInstructions && (
        <DeviceFileInstructions onForget={forgetDevice} onClose={() => setShowDeviceInstructions(false)} />
      )}

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
    </div>
  );
}
