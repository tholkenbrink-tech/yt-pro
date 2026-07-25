import type { JobStatus } from "@/lib/types";
import { statusLabel, statusTone } from "@/lib/statusLabels";
import { StatusBadge } from "./StatusBadge";

export function StatusPill({ status }: { status: JobStatus }) {
  return <StatusBadge label={statusLabel(status)} tone={statusTone(status)} />;
}
