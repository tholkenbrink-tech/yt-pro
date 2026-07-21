"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { StorageInfo } from "@/lib/types";

export function StorageStrip({ compact = false }: { compact?: boolean }) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .storage()
      .then((data) => {
        if (!cancelled) setStorage(data);
      })
      .catch(() => {
        /* silently ignore - non-critical widget */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          Wenig freier Speicher - ältere Downloads werden ggf. früher gelöscht.
        </p>
      )}
    </div>
  );
}
