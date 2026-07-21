import type { SourceComputedStatus } from "@/lib/types";
import { sourceStatusLabel } from "@/lib/sourceStatusLabels";
import { StatusBadge, type BadgeTone } from "./StatusBadge";

const TONES: Record<SourceComputedStatus, BadgeTone> = {
  active: "success",
  checking: "info",
  newItems: "accent",
  noChanges: "neutral",
  paused: "neutral",
  authRequired: "warning",
  failed: "error",
};

export function SourceStatusBadge({ status }: { status: SourceComputedStatus }) {
  return <StatusBadge label={sourceStatusLabel(status)} tone={TONES[status]} />;
}
