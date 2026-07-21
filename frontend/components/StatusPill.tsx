import type { JobStatus } from "@/lib/types";
import { statusLabel } from "@/lib/statusLabels";
import { StatusBadge, type BadgeTone } from "./StatusBadge";

const TONES: Partial<Record<JobStatus, BadgeTone>> = {
  ready: "success",
  downloaded_to_device: "success",
  failed: "error",
  cancelled: "neutral",
  expired: "neutral",
};

export function StatusPill({ status }: { status: JobStatus }) {
  return <StatusBadge label={statusLabel(status)} tone={TONES[status] ?? "info"} />;
}
