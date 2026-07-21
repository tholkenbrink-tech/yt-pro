"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { isActiveStatus } from "@/lib/statusLabels";
import { StatusPill } from "@/components/StatusPill";

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

      {loading && <p className="text-sm text-text-muted">Wird geladen...</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      {!loading && jobs.length === 0 && !error && (
        <p className="text-sm text-text-muted">
          Keine Vorgänge vorhanden. Starte einen Download unter &quot;Download&quot;.
        </p>
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
