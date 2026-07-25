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
        <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4">
          {(() => {
            const total = storage.usedBytes + storage.freeBytes;
            const pct = total > 0 ? Math.min(100, Math.round((storage.usedBytes / total) * 100)) : 0;
            return (
              <div
                className="relative h-14 w-14 shrink-0 rounded-full"
                style={{ background: `conic-gradient(var(--color-accent) ${pct}%, var(--color-progress-track) 0)` }}
              >
                <div className="absolute inset-[5px] rounded-full bg-surface" />
              </div>
            );
          })()}
          <div>
            <p className="text-sm font-semibold text-text-primary">{formatBytes(storage.usedBytes)} belegt</p>
            <p className="mt-0.5 text-meta text-text-muted">{formatBytes(storage.freeBytes)} frei</p>
          </div>
          {storage.lowSpaceWarning && (
            <p className="text-error">
              <span className="font-medium">Zu wenig Speicherplatz.</span> Lösche
              vorbereitete Dateien oder vergrößere den verfügbaren Speicher.
            </p>
          )}
        </div>
      )}

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Offline-Speicher auf diesem Gerät
      </p>
      <div className="mb-6 rounded-2xl border border-border bg-surface p-3.5">
        <p className="text-sm text-text-primary">
          {offlineCount === 0
            ? "Keine Videos offline gespeichert."
            : `${offlineCount} Video${offlineCount === 1 ? "" : "s"} · ${formatBytes(offlineBytes)}`}
        </p>
        <p className="mt-1 text-meta text-text-muted">
          Für Offline-Wiedergabe gespeicherte Videos liegen direkt auf diesem
          Gerät und funktionieren auch ohne Internetverbindung.
        </p>
        {offlineCount > 0 && (
          <>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOfflineListOpen((v) => !v)}
                className="flex-1 rounded-xl border border-border py-2 text-[12.5px] font-medium text-text-secondary"
              >
                {offlineListOpen ? "Videos ausblenden" : "Videos anzeigen"}
              </button>
              <button
                type="button"
                disabled={clearingOffline}
                onClick={clearOffline}
                className="flex-1 rounded-xl bg-error/15 py-2 text-[12.5px] font-medium text-error disabled:opacity-50"
              >
                Alle löschen
              </button>
            </div>
            {offlineListOpen && (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border">
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

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Aufbewahrungsdauer
      </p>
      <div className="mb-6 flex gap-1.5 rounded-2xl bg-surface-elevated p-1">
        {RETENTION_OPTIONS.map((opt) => {
          const active = storage?.retentionHours === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={saving}
              onClick={() => changeRetention(opt.value)}
              className={`flex-1 rounded-xl px-2 py-2 text-[12.5px] font-medium disabled:opacity-50 ${
                active ? "bg-accent font-semibold text-white" : "text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* No backend endpoint covers these yet - persisted client-side only
          (best-effort, not enforced server-side). */}
      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Weitere Einstellungen (lokal)</p>

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
        className="mb-3 min-h-11 w-full rounded-xl border border-border bg-surface p-2 text-text-primary"
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
        className="min-h-11 w-full rounded-xl border border-border bg-surface p-2 text-text-primary"
      />
      <p className="mt-1 text-meta text-text-muted">
        Ab dieser belegten Speichermenge zeigt yt-pro eine Warnung an, damit
        du rechtzeitig Speicherplatz freigeben kannst, bevor er knapp wird.
      </p>
    </main>
  );
}
