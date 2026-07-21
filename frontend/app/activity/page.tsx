"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { isActiveStatus } from "@/lib/statusLabels";
import { StatusPill } from "@/components/StatusPill";
import { Skeleton } from "@/components/Skeleton";

export default function ActivityPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listJobs()
      .then((data) => {
        if (!cancelled) setJobs(data);
      })
      .catch(() => {
        if (!cancelled) setError("Vorgänge konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = jobs.filter((j) => isActiveStatus(j.status));
  const finished = jobs.filter((j) => !isActiveStatus(j.status));

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Aktivität</h1>

      {loading && (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-md border border-border p-3">
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
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Laufend</h2>
          <ul className="space-y-2">
            {active.map((job) => (
              <li key={job.jobId}>
                <Link
                  href={`/activity/${job.jobId}`}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <span className="truncate pr-2">{job.sourceUrl}</span>
                  <StatusPill status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            Abgeschlossen / Fehlgeschlagen
          </h2>
          <ul className="space-y-2">
            {finished.map((job) => (
              <li key={job.jobId}>
                <Link
                  href={`/activity/${job.jobId}`}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <span className="truncate pr-2">{job.sourceUrl}</span>
                  <StatusPill status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
