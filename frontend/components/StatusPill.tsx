import type { JobStatus } from "@/lib/types";
import { statusLabel } from "@/lib/statusLabels";

const COLORS: Partial<Record<JobStatus, string>> = {
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  downloaded_to_device:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  expired: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const DEFAULT_COLOR =
  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";

export function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
        COLORS[status] ?? DEFAULT_COLOR
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}
