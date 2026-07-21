"use client";

import { useState } from "react";
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

interface Props {
  item: LibraryItem;
  onChanged?: () => void;
}

export function MediaCard({ item, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { showToast } = useToast();
  const state = deriveMediaState(item);
  const hasProgress = Boolean(item.progress && !item.progress.completed && item.progress.positionSeconds > 0);
  const progressPct = item.progress?.percentage ?? 0;

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
      showToast("Datei vom Server gelöscht");
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
            {formatDuration(item.duration)} - {item.selectedQuality} - {formatBytes(item.fileSize)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <MediaStatusBadge state={state} />
            <SourceBadge isAutomatic={item.isAutomaticallyPrepared} sourceName={item.sourceName} />
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

      <p className="mt-2 text-meta text-text-muted">
        Vorbereitet: {formatDate(item.createdAt)}
        {item.expiresAt ? ` - Läuft ab: ${formatDate(item.expiresAt)}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/library/${item.id}`}
          className="min-h-11 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          {hasProgress ? "Fortsetzen" : "Abspielen"}
        </Link>
        <a
          href={api.downloadUrl(item.id)}
          download
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          Auf iPhone laden
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => api.resetProgress(item.id))}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Von vorne starten
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => api.markWatched(item.id))}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Als angesehen markieren
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
          className="min-h-11 rounded-md border border-error/40 px-3 py-2 text-sm font-medium text-error disabled:opacity-50"
        >
          Vom Server löschen
        </button>
        {item.originalUrl && (
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            Original öffnen
          </a>
        )}
      </div>

      <ConfirmationDialog
        open={showDeleteConfirm}
        title="Datei vom Server löschen?"
        description="Die Datei wird endgültig vom Server entfernt und steht nicht mehr zum Download bereit."
        confirmLabel="Löschen"
        destructive
        busy={busy}
        onConfirm={deleteFromServer}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
