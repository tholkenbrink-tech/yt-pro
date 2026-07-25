"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { isActiveStatus, jobDisplayName } from "@/lib/statusLabels";
import { StatusPill } from "./StatusPill";

const POLL_INTERVAL_MS = 3000;

/** Shown on the Download page so an in-progress download stays visible
 * (with live progress) no matter how often the user switches between
 * Download/Aktivität/Mediathek and back - previously fetched once on
 * mount only, so it looked "reset" unless the page happened to remount. */
export function ActiveJobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const tick = async () => {
      try {
        const data = await api.listJobs();
        if (stoppedRef.current) return;
        setJobs(data.filter((j) => isActiveStatus(j.status)));
      } catch {
        /* home page stays usable without this list */
      } finally {
        if (!stoppedRef.current) setLoading(false);
      }
      if (!stoppedRef.current) {
        timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (loading || jobs.length === 0) return null;

  return (
    <div className="mx-4 mb-4">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Läuft
      </h2>
      <ul className="space-y-2">
        {jobs.map((job) => {
          const pct = Math.min(100, Math.max(0, Math.round(job.progress)));
          return (
            <li key={job.jobId}>
              <Link
                href={`/activity/${job.jobId}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <div
                  className="relative h-11 w-11 shrink-0 rounded-full"
                  style={{ background: `conic-gradient(var(--color-accent) ${pct}%, var(--color-progress-track) 0)` }}
                >
                  <div className="absolute inset-1 flex items-center justify-center rounded-full bg-surface text-[11px] font-bold text-text-primary">
                    {pct}%
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{jobDisplayName(job)}</p>
                  <p className="mt-0.5 truncate text-meta text-text-muted">
                    <StatusPill status={job.status} />
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
