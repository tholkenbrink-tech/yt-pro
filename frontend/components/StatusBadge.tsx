export type BadgeTone = "success" | "warning" | "error" | "info" | "accent" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  error: "bg-error/15 text-error",
  info: "bg-info/15 text-info",
  accent: "bg-accent/15 text-accent",
  neutral: "bg-text-muted/15 text-text-secondary",
};

const TONE_ICON: Record<BadgeTone, string> = {
  success: "✓",
  warning: "⚠",
  error: "✕",
  info: "ℹ",
  accent: "●",
  neutral: "○",
};

interface Props {
  label: string;
  tone: BadgeTone;
  className?: string;
}

/**
 * Generic status badge: icon + text (never color alone), used by
 * StatusPill (job statuses) and the new media/source state badges so all
 * three share one visual language.
 */
export function StatusBadge({ label, tone, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className ?? ""}`}
    >
      <span aria-hidden="true">{TONE_ICON[tone]}</span>
      {label}
    </span>
  );
}
