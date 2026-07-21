"use client";

import { useJobPolling } from "@/lib/useJobPolling";
import { JobItemCard } from "@/components/JobItemCard";
import { formatDate } from "@/lib/format";

export default function JobProgressPage({
  params,
}: {
  params: { jobId: string };
}) {
  const { job, error, loading, refetch } = useJobPolling(params.jobId);

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-section-title">Vorbereitung</h1>

      {loading && !job && (
        <p className="text-sm text-text-muted">Wird geladen...</p>
      )}

      {error && !job && (
        <p className="text-sm text-error">
          Job konnte nicht geladen werden: {error}
        </p>
      )}

      {job && (
        <>
          <p className="mb-3 text-meta text-text-muted">
            Gestartet: {formatDate(job.createdAt)}
          </p>
          <div className="space-y-3">
            {job.items.map((item) => (
              <JobItemCard key={item.id} item={item} onChanged={refetch} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
