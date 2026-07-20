"use client";

import { useState } from "react";
import Image from "next/image";
import type { JobItem } from "@/lib/types";
import { StatusPill } from "./StatusPill";
import { DownloadCard } from "./DownloadCard";
import { api } from "@/lib/api";
import {
  formatBytes,
  formatDate,
  formatEta,
  formatSpeed,
} from "@/lib/format";

interface Props {
  item: JobItem;
  onChanged?: () => void;
}

export function JobItemCard({ item, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
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
          <div className="mt-1">
            <StatusPill status={item.status} />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-brand transition-all dark:bg-brand-dark"
            style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
          />
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{item.currentStep ?? ""}</span>
          <span>
            {formatBytes(item.downloadedBytes)} / {formatBytes(item.estimatedTotalBytes)}
          </span>
          <span>{formatSpeed(item.speed)}</span>
          <span>ETA: {formatEta(item.estimatedRemainingSeconds)}</span>
        </div>
      </div>

      {item.errorMessage && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {item.errorMessage}
        </p>
      )}

      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Erstellt: {formatDate(item.createdAt)}
        {item.expiresAt ? ` - Läuft ab: ${formatDate(item.expiresAt)}` : ""}
      </p>

      {(canCancel || canRetry) && (
        <div className="mt-3 flex gap-2">
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={doCancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-gray-700"
            >
              Abbrechen
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              disabled={busy}
              onClick={doRetry}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-brand-dark dark:text-gray-950"
            >
              Erneut versuchen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
