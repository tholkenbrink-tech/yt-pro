"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { useToast } from "./ToastProvider";
import { formatBytes, formatDate } from "@/lib/format";
import { type OfflineMeta, listOfflineMeta, removeOffline } from "@/lib/offlineStore";
import { useInAppDownloadProgress } from "@/lib/activeDownloadsStore";
import {
  cancelQueuedDownload,
  cancelRunningDownload,
  getRunningDownload,
  listQueuedDownloads,
  useQueueVersion,
} from "@/lib/downloadQueueStore";

function Thumb({ src }: { src?: string }) {
  return src ? (
    <Image src={src} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
      🎬
    </div>
  );
}

function RunningRow({ itemId, title, thumbnail, onCancel }: { itemId: string; title: string; thumbnail?: string; onCancel: () => void }) {
  const { pct } = useInAppDownloadProgress(itemId);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <Thumb src={thumbnail} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-progress-track">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
        </div>
        <p className="mt-1 text-meta text-text-muted">{pct !== null ? `${pct}% - lädt` : "lädt..."}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-error"
      >
        Abbrechen
      </button>
    </div>
  );
}

function QueuedRow({ itemId, title, thumbnail, onCancel }: { itemId: string; title: string; thumbnail?: string; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <Thumb src={thumbnail} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-meta text-text-muted">in Warteschlange</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-error"
      >
        Abbrechen
      </button>
    </div>
  );
}

function SavedRow({ meta, onDelete }: { meta: OfflineMeta; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <Thumb />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{meta.title}</p>
        <p className="mt-0.5 truncate text-meta text-text-muted">
          {[formatBytes(meta.fileSize), `gespeichert am ${formatDate(meta.savedAt)}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-error"
      >
        Löschen
      </button>
    </div>
  );
}

/** "In-App-Downloads" tab of Aktivität: the running + queued
 * saveOfflineInApp() requests (from downloadQueueStore), plus everything
 * already saved to IndexedDB (from offlineStore), each cancellable/deletable
 * from one place. offlineStore has no change-notification of its own, so
 * this reloads its listing after every local mutation and whenever the
 * queue's running item flips back to idle (a save just finished). */
export function InAppDownloadsPanel() {
  const [saved, setSaved] = useState<OfflineMeta[] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ itemId: string; running: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OfflineMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const version = useQueueVersion();
  const running = getRunningDownload();
  const queued = listQueuedDownloads();

  const reloadSaved = () => {
    listOfflineMeta().then(setSaved);
  };

  useEffect(() => {
    reloadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevRunningId = useRef<string | null>(running?.itemId ?? null);
  useEffect(() => {
    if (prevRunningId.current && !running) reloadSaved();
    prevRunningId.current = running?.itemId ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const confirmCancel = () => {
    if (!cancelTarget) return;
    if (cancelTarget.running) {
      cancelRunningDownload(cancelTarget.itemId);
    } else {
      cancelQueuedDownload(cancelTarget.itemId);
    }
    setCancelTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await removeOffline(deleteTarget.id);
      setDeleteTarget(null);
      showToast("In-App-Download gelöscht");
      reloadSaved();
    } finally {
      setBusy(false);
    }
  };

  const hasActivity = Boolean(running) || queued.length > 0;
  const hasSaved = (saved?.length ?? 0) > 0;

  return (
    <div>
      {!hasActivity && !hasSaved && saved !== null && (
        <div>
          <p className="text-sm font-medium text-text-primary">Keine In-App-Downloads</p>
          <p className="mt-1 text-sm text-text-muted">
            Für die App gespeicherte Videos und laufende Downloads erscheinen hier.
          </p>
        </div>
      )}

      {hasActivity && (
        <section className="mb-5">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            Läuft / Warteschlange
          </h2>
          <ul className="space-y-2">
            {running && (
              <li>
                <RunningRow
                  itemId={running.itemId}
                  title={running.title}
                  thumbnail={running.thumbnail}
                  onCancel={() => setCancelTarget({ itemId: running.itemId, running: true })}
                />
              </li>
            )}
            {queued.map((entry) => (
              <li key={entry.itemId}>
                <QueuedRow
                  itemId={entry.itemId}
                  title={entry.title}
                  thumbnail={entry.thumbnail}
                  onCancel={() => setCancelTarget({ itemId: entry.itemId, running: false })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasSaved && (
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            In der App gespeichert
          </h2>
          <ul className="space-y-2">
            {saved!.map((meta) => (
              <li key={meta.id}>
                <SavedRow meta={meta} onDelete={() => setDeleteTarget(meta)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmationDialog
        open={cancelTarget !== null}
        title="Download abbrechen?"
        description={
          cancelTarget?.running
            ? "Der laufende Download in die App wird abgebrochen. Bereits geladene Daten werden verworfen."
            : "Der Download wird aus der Warteschlange entfernt."
        }
        confirmLabel="Abbrechen"
        destructive
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmationDialog
        open={deleteTarget !== null}
        title="In-App-Download löschen?"
        description="Die in der App gespeicherte Offline-Kopie wird entfernt. Die Datei auf der NAS ist davon nicht betroffen."
        confirmLabel="Löschen"
        destructive
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
