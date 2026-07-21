import type { SourceComputedStatus, SourceMode, SourceScheduleType } from "./types";

/** German display labels for a source's computed status, same
 * map+accessor pattern as `lib/statusLabels.ts`. */
export const SOURCE_STATUS_LABELS: Record<SourceComputedStatus, string> = {
  active: "Aktiv",
  checking: "Wird geprüft",
  newItems: "Neue Videos gefunden",
  noChanges: "Keine Änderungen",
  paused: "Pausiert",
  authRequired: "Anmeldung erforderlich",
  failed: "Fehlgeschlagen",
};

export function sourceStatusLabel(status: SourceComputedStatus): string {
  return SOURCE_STATUS_LABELS[status] ?? status;
}

export const SOURCE_STATUS_COLORS: Record<SourceComputedStatus, string> = {
  active: "bg-success/15 text-success",
  checking: "bg-info/15 text-info",
  newItems: "bg-accent/15 text-accent",
  noChanges: "bg-text-muted/15 text-text-secondary",
  paused: "bg-text-muted/15 text-text-secondary",
  authRequired: "bg-warning/15 text-warning",
  failed: "bg-error/15 text-error",
};

export const SOURCE_MODE_LABELS: Record<SourceMode, string> = {
  discover_only: "Nur erkennen",
  confirm_first: "Vorher bestätigen",
  auto_prepare: "Automatisch vorbereiten",
};

export const SOURCE_MODE_DESCRIPTIONS: Record<SourceMode, string> = {
  discover_only: "Neue Videos werden nur angezeigt, nicht vorbereitet.",
  confirm_first: "Neue Videos müssen einzeln bestätigt werden, bevor sie vorbereitet werden.",
  auto_prepare: "Neue Videos werden automatisch heruntergeladen und vorbereitet.",
};

export function sourceModeLabel(mode: SourceMode): string {
  return SOURCE_MODE_LABELS[mode] ?? mode;
}

export const SOURCE_SCHEDULE_LABELS: Record<SourceScheduleType, string> = {
  manual: "Manuell",
  every_6h: "Alle 6 Stunden",
  every_12h: "Alle 12 Stunden",
  daily: "Täglich",
  weekly: "Wöchentlich",
  cron: "Benutzerdefiniert (Cron)",
};

export function sourceScheduleLabel(schedule: SourceScheduleType): string {
  return SOURCE_SCHEDULE_LABELS[schedule] ?? schedule;
}
