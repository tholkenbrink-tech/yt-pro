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
import {
  clearAllOffline,
  getOfflineUsageBytes,
  listOfflineMeta,
  removeOffline,
  type OfflineMeta,
} from "@/lib/offlineStore";
import { useToast } from "@/components/ToastProvider";

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: 24, label: "24 Stunden" },
  { value: 72, label: "3 Tage" },
  { value: 168, label: "7 Tage" },
  { value: null, label: "Manuell löschen" },
];

export default function StorageSettingsPage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<StorageSettings>(DEFAULT_STORAGE_SETTINGS);
  const [offlineCount, setOfflineCount] = useState(0);
  const [offlineBytes, setOfflineBytes] = useState(0);
  const [offlineItems, setOfflineItems] = useState<OfflineMeta[]>([]);
  const [offlineListOpen, setOfflineListOpen] = useState(false);
  const [clearingOffline, setClearingOffline] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = () => {
    api
      .storage()
      .then(setStorage)
      .catch(() => setError("Speicherinformationen konnten nicht geladen werden."));
  };

  const loadOfflineUsage = () => {
    listOfflineMeta().then((items) => {
      setOfflineCount(items.length);
      setOfflineItems(items);
    });
    getOfflineUsageBytes().then(setOfflineBytes);
  };

  const removeOne = async (id: string) => {
    setRemovingId(id);
    try {
      await removeOffline(id);
      loadOfflineUsage();
    } finally {
      setRemovingId(null);
    }
  };

  useEffect(() => {
    load();
    loadOfflineUsage();
    setLocal(getStorageSettings());
  }, []);

  const clearOffline = async () => {
    setClearingOffline(true);
    try {
      await clearAllOffline();
      loadOfflineUsage();
      showToast("Offline-Kopien gelöscht");
    } finally {
      setClearingOffline(false);
    }
  };

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

      <h2 className="mb-2 text-sm font-semibold">Offline-Speicher auf diesem Gerät</h2>
      <div className="mb-6 rounded-md border border-border p-3 text-sm">
        <p>
          {offlineCount === 0
            ? "Keine Videos offline gespeichert."
            : `${offlineCount} Video${offlineCount === 1 ? "" : "s"} offline gespeichert - ${formatBytes(offlineBytes)}`}
        </p>
        <p className="mt-1 text-meta text-text-muted">
          Für Offline-Wiedergabe gespeicherte Videos liegen direkt auf diesem
          Gerät und funktionieren auch ohne Internetverbindung.
        </p>
        {offlineCount > 0 && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOfflineListOpen((v) => !v)}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium"
              >
                {offlineListOpen ? "Videos ausblenden" : "Videos anzeigen"}
              </button>
              <button
                type="button"
                disabled={clearingOffline}
                onClick={clearOffline}
                className="min-h-11 rounded-md border border-error/40 px-3 py-2 text-sm font-medium text-error disabled:opacity-50"
              >
                Alle Offline-Kopien löschen
              </button>
            </div>
            {offlineListOpen && (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border">
                {offlineItems.map((video) => (
                  <li
                    key={video.id}
                    className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0 truncate">{video.title}</span>
                    <button
                      type="button"
                      disabled={removingId === video.id}
                      onClick={() => removeOne(video.id)}
                      aria-label={`${video.title} entfernen`}
                      className="shrink-0 text-xs font-medium text-error disabled:opacity-50"
                    >
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold">Aufbewahrungsdauer</h2>
      <div className="mb-6 flex flex-nowrap gap-1.5 overflow-x-auto">
        {RETENTION_OPTIONS.map((opt) => {
          const active = storage?.retentionHours === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={saving}
              onClick={() => changeRetention(opt.value)}
              className={`min-h-11 shrink-0 rounded-pill border px-2.5 py-2 text-xs font-medium disabled:opacity-50 sm:text-sm ${
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
      <p className="mt-1 text-meta text-text-muted">
        Ab dieser belegten Speichermenge zeigt yt-pro eine Warnung an, damit
        du rechtzeitig Speicherplatz freigeben kannst, bevor er knapp wird.
      </p>
    </main>
  );
}
