"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Job } from "./types";
import { isActiveStatus } from "./statusLabels";

/**
 * Polling-based live updates for a job.
 *
 * We deliberately use `GET /api/jobs/{id}` on an interval instead of the
 * `/events` SSE endpoint: the frontend and API live on different origins
 * (Cloudflare Pages vs. the API host), and the native `EventSource` API
 * cannot attach `credentials: "include"` reliably for cross-site cookie
 * auth in all browsers (notably older Safari/WebKit, which this app must
 * support since it targets iPhone Safari). Polling every ~2s always goes
 * through normal `fetch` with `credentials: "include"`, so cookie auth
 * works everywhere, and it naturally "resyncs" after the app is backgrounded
 * or the network drops - each tick just re-fetches full current state.
 */
export function useJobPolling(jobId: string | undefined, intervalMs = 2000) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const jobRef = useRef<Job | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await api.getJob(jobId);
      if (stoppedRef.current) return;
      jobRef.current = data;
      setJob(data);
      setError(null);
    } catch (e) {
      if (stoppedRef.current) return;
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    stoppedRef.current = false;
    setLoading(true);
    jobRef.current = null;

    const tick = async () => {
      await fetchOnce();
      if (stoppedRef.current) return;
      const current = jobRef.current;
      const active = !current || current.items.some((i) => isActiveStatus(i.status));
      timerRef.current = setTimeout(tick, active ? intervalMs : intervalMs * 4);
    };

    tick();

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { job, error, loading, refetch: fetchOnce };
}
