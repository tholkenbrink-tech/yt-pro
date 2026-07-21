"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StorageInfo } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import {
  DEFAULT_STORAGE_SETTINGS,
  getStorageSettings,
  setStorageSettings,
  type StorageSettings,
} from "@/lib/localSettings";
import { useToast } from "@/components/ToastProvider";

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: "1 Stunde" },
  { value: 6, label: "6 Stunden" },
  { value: 24, label: "24 Stunden" },
  { value: 72, label: "3 Tage" },
  { value: null, label: "Manuell löschen" },
];

export default function StorageSettingsPage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<StorageSettings>(DEFAULT_STORAGE_SETTINGS);
  const { showToast } = useToast();

  const load = () => {
    api
      .storage()
      .then(setStorage)
      .catch(() => setError("Speicherinformationen konnten nicht geladen werden."));
  };

  useEffect(() => {
    load();
    setLocal(getStorageSettings());
  }, []);

  const changeRetention = async (hours: number | null) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.setRetention(hours);
      setStorage(updated);
      showToast("Einstellung gespeichert");
    } catch {
      setError("Aufbewahrungsdauer konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (patch: Partial<StorageSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    setStorageSettings(patch);
    showToast("Einstellung gespeichert");
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Speicher</h1>

      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      {storage && (
        <div className="mb-4 rounded-md border border-border p-3 text-sm">
          <p>Belegt: {formatBytes(storage.usedBytes)}</p>
          <p>Frei: {formatBytes(storage.freeBytes)}</p>
          {storage.lowSpaceWarning && (
            <p className="mt-2 text-error">
              <span className="font-medium">Zu wenig Speicherplatz.</span> Lösche
              vorbereitete Dateien oder vergrößere den verfügbaren Speicher.
            </p>
          )}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold">Aufbewahrungsdauer</h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {RETENTION_OPTIONS.map((opt) => {
          const active = storage?.retentionHours === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={saving}
              onClick={() => changeRetention(opt.value)}
              className={`min-h-11 rounded-pill border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                active ? "border-accent bg-accent text-white" : "border-border"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* No backend endpoint covers these yet - persisted client-side only
          (best-effort, not enforced server-side). */}
      <h2 className="mb-2 text-sm font-semibold">Weitere Einstellungen (lokal)</h2>
      <label className="mb-3 flex min-h-11 items-center justify-between">
        <span className="text-sm font-medium">Automatisch löschen</span>
        <input
          type="checkbox"
          checked={local.autoDeleteEnabled}
          onChange={(e) => updateLocal({ autoDeleteEnabled: e.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>
      <p className="mb-3 text-meta text-text-muted">
        Videos, die du unter &quot;Behalten&quot; markierst, werden von der
        automatischen Löschung ausgenommen.
      </p>

      <label htmlFor="max-storage" className="mb-1 block text-sm font-medium">
        Maximaler Speicherplatz (GB)
      </label>
      <input
        id="max-storage"
        type="number"
        min={0}
        value={local.maxStorageBytes ? local.maxStorageBytes / 1024 ** 3 : ""}
        onChange={(e) =>
          updateLocal({
            maxStorageBytes: e.target.value ? Number(e.target.value) * 1024 ** 3 : null,
          })
        }
        className="mb-3 min-h-11 w-full rounded-md border border-border bg-surface p-2 text-text-primary"
      />

      <label htmlFor="warning-threshold" className="mb-1 block text-sm font-medium">
        Warnschwelle (GB)
      </label>
      <input
        id="warning-threshold"
        type="number"
        min={0}
        value={local.warningThresholdBytes ? local.warningThresholdBytes / 1024 ** 3 : ""}
        onChange={(e) =>
          updateLocal({
            warningThresholdBytes: e.target.value ? Number(e.target.value) * 1024 ** 3 : null,
          })
        }
        className="min-h-11 w-full rounded-md border border-border bg-surface p-2 text-text-primary"
      />
    </main>
  );
}
