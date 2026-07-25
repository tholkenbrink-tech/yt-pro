"use client";

import { useState } from "react";
import type { JobItem } from "@/lib/types";
import { DownloadCard } from "./DownloadCard";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { api } from "@/lib/api";
import {
  formatBytes,
  formatDate,
  formatEta,
  formatSpeed,
} from "@/lib/format";

const GENERIC_FAILURE_EXPLANATION =
  "Das Video ist möglicherweise nicht verfügbar oder die Verbindung wurde unterbrochen.";

interface Props {
  item: JobItem;
  onChanged?: () => void;
}

export function JobItemCard({ item, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (item.status === "ready" || item.status === "downloaded_to_device") {
    return <DownloadCard item={item} onChanged={onChanged} />;
  }

  const canCancel = ![
    "ready",
    "downloaded_to_device",
    "expired",
    "cancelled",
    "failed",
  ].includes(item.status);
  const canRetry = item.status === "failed";

  const doCancel = async () => {
    setBusy(true);
    try {
      await api.cancelJob(item.id);
      setShowCancelConfirm(false);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const doRetry = async () => {
    setBusy(true);
    try {
      await api.retryJob(item.id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const pct = Math.min(100, Math.max(0, Math.round(item.progress)));

  return (
    <div className="rounded-[18px] border border-border bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <div
          className="relative h-11 w-11 shrink-0 rounded-full"
          style={{ background: `conic-gradient(var(--color-accent) ${pct}%, var(--color-progress-track) 0)` }}
        >
          <div className="absolute inset-1 flex items-center justify-center rounded-full bg-surface text-[11px] font-bold text-text-primary">
            {pct}%
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{item.title}</p>
          <p className="mt-0.5 truncate text-meta text-text-muted">
            {formatBytes(item.downloadedBytes)} / {formatBytes(item.estimatedTotalBytes)}
            {" · "}
            {formatSpeed(item.speed)}
            {" · "}ETA {formatEta(item.estimatedRemainingSeconds)}
          </p>
        </div>
      </div>

      {item.status === "failed" && (
        <p className="mt-2 text-sm text-error">{item.errorMessage || GENERIC_FAILURE_EXPLANATION}</p>
      )}

      <p className="mt-2 text-meta text-text-muted">
        Erstellt: {formatDate(item.createdAt)}
        {item.expiresAt ? ` - Läuft ab: ${formatDate(item.expiresAt)}` : ""}
      </p>

      {(canCancel || canRetry) && (
        <div className="mt-3 flex gap-2">
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowCancelConfirm(true)}
              className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Abbrechen
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              disabled={busy}
              onClick={doRetry}
              className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Erneut versuchen
            </button>
          )}
        </div>
      )}

      <ConfirmationDialog
        open={showCancelConfirm}
        title="Download abbrechen?"
        description="Der Vorgang wird gestoppt und bereits geladene Daten für dieses Video gehen verloren."
        confirmLabel="Ja, abbrechen"
        cancelLabel="Weiterlaufen lassen"
        destructive
        busy={busy}
        onConfirm={doCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}
