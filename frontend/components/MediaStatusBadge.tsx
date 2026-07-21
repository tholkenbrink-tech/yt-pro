import type { MediaState } from "@/lib/mediaStateConfig";
import { mediaStateLabel } from "@/lib/mediaStateConfig";
import { StatusBadge, type BadgeTone } from "./StatusBadge";

const TONES: Record<MediaState, BadgeTone> = {
  new: "accent",
  started: "info",
  watched: "neutral",
  auto_prepared: "info",
  expiring_soon: "warning",
  downloaded_to_device: "success",
};

export function MediaStatusBadge({ state }: { state: MediaState }) {
  return <StatusBadge label={mediaStateLabel(state)} tone={TONES[state]} />;
}
