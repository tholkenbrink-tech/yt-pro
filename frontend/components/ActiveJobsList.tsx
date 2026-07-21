"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { isActiveStatus } from "@/lib/statusLabels";
import { StatusPill } from "./StatusPill";

export function ActiveJobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .listJobs()
      .then((data) => {
        if (!cancelled) setJobs(data.filter((j) => isActiveStatus(j.status)));
      })
      .catch(() => {
        /* home page stays usable without this list */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
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
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
            >
              <span className="truncate pr-2">{job.sourceUrl}</span>
              <StatusPill status={job.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
