"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StorageInfo } from "@/lib/types";
import { formatBytes } from "@/lib/format";

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: "1 Stunde" },
  { value: 6, label: "6 Stunden" },
  { value: 24, label: "24 Stunden" },
  { value: 72, label: "3 Tage" },
  { value: null, label: "Manuell löschen" },
];

export default function SettingsPage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .storage()
      .then(setStorage)
      .catch(() => setError("Speicherinformationen konnten nicht geladen werden."));
  };

  useEffect(load, []);

  const changeRetention = async (hours: number | null) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.setRetention(hours);
      setStorage(updated);
    } catch {
      setError("Aufbewahrungsdauer konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-xl font-bold">Speicher</h1>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {storage && (
        <div className="mb-4 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
          <p>Belegt: {formatBytes(storage.usedBytes)}</p>
          <p>Frei: {formatBytes(storage.freeBytes)}</p>
          {storage.lowSpaceWarning && (
            <p className="mt-2 text-red-600 dark:text-red-400">
              Wenig freier Speicher.
            </p>
          )}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold">Aufbewahrungsdauer</h2>
      <div className="flex flex-wrap gap-2">
        {RETENTION_OPTIONS.map((opt) => {
          const active = storage?.retentionHours === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={saving}
              onClick={() => changeRetention(opt.value)}
              className={`rounded-full border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                active
                  ? "border-brand bg-brand text-white dark:border-brand-dark dark:bg-brand-dark dark:text-gray-950"
                  : "border-gray-300 dark:border-gray-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </main>
  );
}
