"use client";

import { useJobPolling } from "@/lib/useJobPolling";
import { JobItemCard } from "@/components/JobItemCard";
import { formatDate } from "@/lib/format";

export default function JobProgressPage({
  params,
}: {
  params: { id: string };
}) {
  const { job, error, loading, refetch } = useJobPolling(params.id);

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-xl font-bold">Vorbereitung</h1>

      {loading && !job && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Wird geladen...</p>
      )}

      {error && !job && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Job konnte nicht geladen werden: {error}
        </p>
      )}

      {job && (
        <>
          <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
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
