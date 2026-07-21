"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { StorageInfo } from "@/lib/types";
import { Skeleton } from "./Skeleton";

export function StorageStrip({ compact = false }: { compact?: boolean }) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .storage()
      .then((data) => {
        if (!cancelled) setStorage(data);
      })
      .catch(() => {
        /* silently ignore - non-critical widget */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return compact ? (
      <div className="text-xs" aria-hidden="true">
        <div className="mb-1 flex items-center justify-between">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    ) : (
      <div
        className="mx-4 mb-4 rounded-lg border border-border p-3 text-sm"
        aria-hidden="true"
      >
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    );
  }

  if (!storage) return null;

  const total = storage.usedBytes + storage.freeBytes;
  const usedPct = total > 0 ? Math.min(100, (storage.usedBytes / total) * 100) : 0;

  if (compact) {
    return (
      <div className="text-xs">
        <div className="flex items-center justify-between text-text-secondary">
          <span>Speicher</span>
          <span>{formatBytes(storage.usedBytes)} / {formatBytes(total)}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-progress-track">
          <div
            className={`h-full rounded-full ${storage.lowSpaceWarning ? "bg-error" : "bg-accent"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-4 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
      <div className="flex items-center justify-between">
        <span className="font-medium">Speicher</span>
        <span className="text-gray-500 dark:text-gray-400">
          {formatBytes(storage.usedBytes)} von {formatBytes(total)} belegt
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className={`h-full rounded-full ${
            storage.lowSpaceWarning ? "bg-red-500" : "bg-brand dark:bg-brand-dark"
          }`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      {storage.lowSpaceWarning && (
        <p className="mt-2 text-red-600 dark:text-red-400">
          <span className="font-medium">Zu wenig Speicherplatz.</span> Lösche
          vorbereitete Dateien oder vergrößere den verfügbaren Speicher.
        </p>
      )}
    </div>
  );
}
