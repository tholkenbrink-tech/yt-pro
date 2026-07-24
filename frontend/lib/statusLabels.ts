import type { Job, JobStatus } from "./types";

/** job.title is only set for playlist jobs (the playlist's own name) - a
 * single-video job's title lives on its one item instead, and the raw
 * source URL is the last-resort fallback if neither is available. */
export function jobDisplayName(job: Job): string {
  return job.title || job.items[0]?.title || job.sourceUrl;
}

/** German display labels for each backend job/item status. */
export const STATUS_LABELS: Record<JobStatus, string> = {
  analyzed: "Analysiert",
  queued: "In Warteschlange",
  preparing: "Wird vorbereitet",
  downloading_video: "Video wird geladen",
  downloading_audio: "Audio wird geladen",
  merging: "Audio und Video werden zusammengeführt",
  optimizing_for_iphone: "Wird für iPhone optimiert",
  finalizing: "Wird abgeschlossen",
  ready: "Bereit zum iPhone-Download",
  downloaded_to_device: "Auf iPhone geladen",
  expired: "Abgelaufen",
  cancelled: "Abgebrochen",
  failed: "Fehlgeschlagen",
};

export function statusLabel(status: JobStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Statuses that are still in progress (not a final resting state). */
export const ACTIVE_STATUSES: JobStatus[] = [
  "queued",
  "preparing",
  "downloading_video",
  "downloading_audio",
  "merging",
  "optimizing_for_iphone",
  "finalizing",
];

export function isActiveStatus(status: JobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export const CONVERSION_NOTE_LABELS: Record<string, string> = {
  no_conversion: "Keine Konvertierung nötig",
  merged_only: "Audio und Video wurden zusammengeführt",
  converted_for_iphone: "Für iPhone wird konvertiert",
};

export function conversionNoteLabel(note: string): string {
  return CONVERSION_NOTE_LABELS[note] ?? note;
}
