"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { isActiveStatus } from "@/lib/statusLabels";
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
      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
        Laufende Vorgänge
      </h2>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.jobId}>
            <Link
              href={`/activity/${job.jobId}`}
              className="block rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate pr-2">{job.title || job.sourceUrl}</span>
                <StatusPill status={job.status} />
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-brand transition-all dark:bg-brand-dark"
                  style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
