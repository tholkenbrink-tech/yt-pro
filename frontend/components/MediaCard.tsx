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
import { useToast } from "./ToastProvider";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { isOffline, removeOffline, saveOffline } from "@/lib/offlineStore";
import { shouldDownloadToDevice } from "@/lib/wifiGate";

interface Props {
  item: LibraryItem;
  onChanged?: () => void;
}

export function MediaCard({ item, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [offline, setOffline] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [saveProgressPct, setSaveProgressPct] = useState<number | null>(null);
  const { showToast } = useToast();
  const state = deriveMediaState(item);
  const hasProgress = Boolean(item.progress && !item.progress.completed && item.progress.positionSeconds > 0);
  const progressPct = item.progress?.percentage ?? 0;

  useEffect(() => {
    let cancelled = false;
    isOffline(item.id).then((value) => {
      if (!cancelled) setOffline(value);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const toggleOffline = async () => {
    if (offline) {
      setSavingOffline(true);
      try {
        await removeOffline(item.id);
        setOffline(false);
        showToast("Offline-Kopie entfernt");
      } finally {
        setSavingOffline(false);
      }
      return;
    }
    const toDevice = shouldDownloadToDevice();
    setSavingOffline(true);
    setSaveProgressPct(0);
    try {
      await saveOffline(item, setSaveProgressPct, toDevice);
      setOffline(true);
      showToast(
        toDevice
          ? "Heruntergeladen - offline in der App und auf dem Gerät verfügbar"
          : "Offline in der App gespeichert - Geräte-Download übersprungen (nicht im WLAN)"
      );
    } catch {
      showToast("Offline-Speicherung fehlgeschlagen - evtl. zu wenig Speicherplatz");
    } finally {
      setSavingOffline(false);
      setSaveProgressPct(null);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
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
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        {item.thumbnailPath && (
          <Image
            src={item.thumbnailPath}
            alt=""
            width={112}
            height={63}
            unoptimized
            className="h-[63px] w-28 shrink-0 rounded object-cover"
          />
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
          </div>
        </div>
      </div>

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
          href={`/library/${item.id}`}
          aria-label={hasProgress ? "Fortsetzen" : "Abspielen"}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md bg-accent text-base text-white"
        >
          ▶
        </Link>
        <button
          type="button"
          aria-label="Von vorne starten"
          disabled={busy}
          onClick={() => run(() => api.resetProgress(item.id))}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border text-base disabled:opacity-50"
        >
          ↺
        </button>
        <button
          type="button"
          aria-label={offline ? "Heruntergeladene Kopie entfernen" : "Herunterladen (Gerät + offline in der App)"}
          disabled={savingOffline}
          onClick={toggleOffline}
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
    </div>
  );
}
