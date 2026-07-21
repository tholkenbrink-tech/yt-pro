"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { MonitoredSource, SourceCheckRun, SourceDiscoveredItem } from "@/lib/types";
import { SourceStatusBadge } from "@/components/SourceStatusBadge";
import { sourceModeLabel, sourceScheduleLabel } from "@/lib/sourceStatusLabels";
import { formatDate, formatDuration } from "@/lib/format";

export default function SourceDetailPage({
  params,
}: {
  params: { sourceId: string };
}) {
  const router = useRouter();
  const [source, setSource] = useState<MonitoredSource | null>(null);
  const [items, setItems] = useState<SourceDiscoveredItem[]>([]);
  const [runs, setRuns] = useState<SourceCheckRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = () => {
    api.getSource(params.sourceId).then(setSource).catch(() => setError("load"));
    api.sourceItems(params.sourceId).then(setItems).catch(() => undefined);
    api.sourceRuns(params.sourceId).then(setRuns).catch(() => undefined);
  };

  useEffect(load, [params.sourceId]);

  const checkNow = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const updated = await api.checkSourceNow(params.sourceId);
      setSource(updated);
      setStatusMessage("Prüfung gestartet.");
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const updated = source.enabled
        ? await api.pauseSource(source.id)
        : await api.resumeSource(source.id);
      setSource(updated);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!source) return;
    setBusy(true);
    try {
      await api.deleteSource(source.id);
      router.push("/settings/sources");
    } finally {
      setBusy(false);
    }
  };

  const prepareItem = async (itemId: string) => {
    await api.prepareSourceItem(params.sourceId, itemId);
    load();
  };

  const ignoreItem = async (itemId: string) => {
    await api.ignoreSourceItem(params.sourceId, itemId);
    load();
  };

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
        <h1 className="mb-2 text-section-title">Quelle nicht gefunden</h1>
      </main>
    );
  }

  if (!source) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
        <p className="text-sm text-text-muted">Wird geladen...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-2 text-page-title">{source.name}</h1>
      <div className="mb-4 flex items-center gap-2">
        <SourceStatusBadge status={source.computedStatus} />
        {statusMessage && (
          <span role="status" aria-live="polite" className="text-meta text-text-muted">
            {statusMessage}
          </span>
        )}
      </div>

      {source.lastError && (
        <div className="mb-4 rounded-md bg-error/10 p-3 text-sm text-error">
          <p className="font-medium">YouTube-Anmeldung erforderlich</p>
          <p>Erneuere die gespeicherte Sitzung, um diese Playlist weiter zu prüfen.</p>
        </div>
      )}

      <div className="mb-4 space-y-1 text-sm text-text-secondary">
        <p>Prüfintervall: {sourceScheduleLabel(source.scheduleType)}</p>
        <p>Modus: {sourceModeLabel(source.mode)}</p>
        {source.downloadProfileId && <p>Qualität: {source.downloadProfileId}</p>}
        {source.lastCheckedAt && <p>Zuletzt geprüft: {formatDate(source.lastCheckedAt)}</p>}
        {source.nextCheckAt && <p>Nächste Prüfung: {formatDate(source.nextCheckAt)}</p>}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={checkNow}
          className="min-h-11 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Jetzt prüfen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={togglePause}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {source.enabled ? "Pausieren" : "Fortsetzen"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="min-h-11 rounded-md border border-error/40 px-3 py-2 text-sm font-medium text-error disabled:opacity-50"
        >
          Löschen
        </button>
      </div>

      {items.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold">Gefundene Videos</h2>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border border-border p-3">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-meta text-text-muted">
                  {formatDuration(item.durationSeconds)}
                  {item.publishedAt ? ` - ${formatDate(item.publishedAt)}` : ""} - {item.status}
                </p>
                {item.status === "discovered" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => prepareItem(item.id)}
                      className="min-h-11 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Vorbereiten
                    </button>
                    <button
                      type="button"
                      onClick={() => ignoreItem(item.id)}
                      className="min-h-11 rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      Ignorieren
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {runs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Prüf-Verlauf</h2>
          <ul className="space-y-1 text-meta text-text-muted">
            {runs.map((run) => (
              <li key={run.id}>
                {formatDate(run.startedAt)} - {run.newItemsFound} neue Videos - {run.status}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
