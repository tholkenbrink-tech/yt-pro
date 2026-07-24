"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { JobItem } from "@/lib/types";
import { api } from "@/lib/api";
import { formatBytes, formatCountdown, formatDuration } from "@/lib/format";
import { conversionNoteLabel } from "@/lib/statusLabels";
import { IOSSaveInstructions } from "./IOSSaveInstructions";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { useToast } from "./ToastProvider";
import { isOffline, removeOffline, saveOffline } from "@/lib/offlineStore";
import { shouldDownloadToDevice } from "@/lib/wifiGate";

const SEEN_INSTRUCTIONS_KEY = "yt-pro:ios-instructions-seen";

interface Props {
  item: JobItem;
  onChanged?: () => void;
}

export function DownloadCard({ item, onChanged }: Props) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [saveProgressPct, setSaveProgressPct] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    isOffline(item.id).then((value) => {
      if (!cancelled) setOffline(value);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const handleFirstTap = () => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_INSTRUCTIONS_KEY) !== "1") {
      setShowInstructions(true);
      localStorage.setItem(SEEN_INSTRUCTIONS_KEY, "1");
    }
  };

  const toggleOffline = async () => {
    if (offline) {
      setSavingOffline(true);
      try {
        await removeOffline(item.id);
        setOffline(false);
        showToast("Heruntergeladene Kopie entfernt");
      } finally {
        setSavingOffline(false);
      }
      return;
    }
    const toDevice = shouldDownloadToDevice();
    if (toDevice) handleFirstTap();
    setSavingOffline(true);
    setSaveProgressPct(0);
    try {
      await saveOffline(
        {
          id: item.id,
          title: item.title,
          channelName: item.channelName,
          duration: item.duration,
          selectedQuality: item.selectedQuality,
          fileSize: item.finalFileSize,
          thumbnailPath: item.thumbnail,
        },
        setSaveProgressPct,
        toDevice
      );
      setOffline(true);
      showToast(
        toDevice
          ? "Heruntergeladen - offline in der App und auf dem Gerät verfügbar"
          : "Offline in der App gespeichert - Geräte-Download übersprungen (nicht im WLAN)"
      );
    } catch {
      showToast("Herunterladen fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      setSavingOffline(false);
      setSaveProgressPct(null);
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

      <button
        type="button"
        disabled={savingOffline}
        onClick={toggleOffline}
        className={`mt-3 block w-full rounded-lg px-4 py-3 text-center font-medium active:opacity-80 disabled:opacity-50 ${
          offline
            ? "border border-success bg-success/15 text-success"
            : "bg-brand text-white dark:bg-brand-dark dark:text-gray-950"
        }`}
      >
        {savingOffline
          ? saveProgressPct !== null
            ? `Wird heruntergeladen... ${saveProgressPct}%`
            : "Wird entfernt..."
          : offline
            ? "Heruntergeladen - Kopie entfernen"
            : "Herunterladen"}
      </button>
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
    </div>
  );
}
