"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { isActiveStatus, jobDisplayName, statusLabel, statusTone, type StatusTone } from "@/lib/statusLabels";
import { Skeleton } from "@/components/Skeleton";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";

const TONE_BORDER: Record<StatusTone, string> = {
  success: "border-success",
  error: "border-error",
  neutral: "border-border",
  info: "border-info",
};
const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success",
  error: "text-error",
  neutral: "text-text-muted",
  info: "text-info",
};
const TONE_DOT: Record<StatusTone, string> = {
  success: "bg-success",
  error: "bg-error",
  neutral: "bg-text-muted",
  info: "bg-info",
};

function TimelineRow({ job, trailing }: { job: Job; trailing?: React.ReactNode }) {
  const tone = statusTone(job.status);
  return (
    <div className={`flex items-center gap-3 rounded-r-2xl border-l-[3px] bg-surface py-2.5 pl-3.5 pr-3 ${TONE_BORDER[tone]}`}>
      <Link href={`/activity/${job.jobId}`} className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{jobDisplayName(job)}</span>
          <span className={`flex shrink-0 items-center gap-1.5 text-[11px] ${TONE_TEXT[tone]}`}>
            <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
            {statusLabel(job.status).toLowerCase()}
          </span>
        </div>
        {isActiveStatus(job.status) && (
          <div className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-progress-track">
            <div
              className={`h-full rounded-full ${tone === "info" ? "bg-info" : "bg-accent"}`}
              style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
            />
          </div>
        )}
      </Link>
      {trailing}
    </div>
  );
}

export default function ActivityPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listJobs()
      .then((data) => setJobs(data))
      .catch(() => setError("Vorgänge konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteJob(deleteTarget.jobId);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const active = jobs.filter((j) => isActiveStatus(j.status));
  const finished = jobs.filter((j) => !isActiveStatus(j.status));

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Aktivität</h1>

      {loading && (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-r-2xl border-l-[3px] border-border bg-surface p-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-error">{error}</p>}

      {!loading && jobs.length === 0 && !error && (
        <div>
          <p className="text-sm font-medium text-text-primary">Keine aktiven Downloads</p>
          <p className="mt-1 text-sm text-text-muted">
            Neue Downloads erscheinen hier und laufen auf dem Server weiter.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-5" aria-live="polite">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Laufend</h2>
          <ul className="space-y-2">
            {active.map((job) => (
              <li key={job.jobId}>
                <TimelineRow job={job} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            Abgeschlossen / Fehlgeschlagen
          </h2>
          <ul className="space-y-2">
            {finished.map((job) => (
              <li key={job.jobId}>
                <TimelineRow
                  job={job}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(job)}
                      aria-label="Eintrag löschen"
                      className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
                    >
                      ⋯
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        title="Eintrag löschen?"
        description="Der Verlaufseintrag und alle zugehörigen Dateien werden endgültig vom Server entfernt."
        confirmLabel="Löschen"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
