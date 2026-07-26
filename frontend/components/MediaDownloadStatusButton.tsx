export type DownloadButtonState = "idle" | "queued" | "downloading" | "downloaded" | "failed" | "unavailable";

interface Props {
  state: DownloadButtonState;
  /** In-progress percentage while `state === "downloading"`, or `null` before the first chunk reports. */
  progressPct?: number | null;
  /** Reason shown to assistive tech (and as a hover title) when `state === "unavailable"`. */
  unavailableReason?: string;
  onDownload: () => void;
  onCancelQueued: () => void;
  onCancelDownloading: () => void;
  onRetry: () => void;
  onRequestRemove: () => void;
}

const ARIA_LABELS: Record<DownloadButtonState, string> = {
  idle: "Video herunterladen",
  queued: "Download in Warteschlange - antippen zum Abbrechen",
  downloading: "Video wird heruntergeladen - antippen zum Abbrechen",
  downloaded: "Video heruntergeladen - antippen zum Entfernen",
  failed: "Download fehlgeschlagen - antippen zum erneuten Versuch",
  unavailable: "Download nicht verfügbar",
};

const TEXT_LABELS: Record<DownloadButtonState, string> = {
  idle: "⬇ In App speichern",
  queued: "○ In Warteschlange",
  downloading: "⬇ Wird geladen…",
  downloaded: "✓ In der App",
  failed: "⚠ Fehlgeschlagen - erneut versuchen",
  unavailable: "⬇ Nicht verfügbar",
};

const TONE_CLASSES: Record<DownloadButtonState, string> = {
  idle: "border border-border text-text-muted",
  queued: "border border-border text-text-muted",
  downloading: "border border-accent text-accent",
  downloaded: "border border-success bg-success/15 text-success",
  failed: "border border-error text-error",
  unavailable: "border border-border text-text-muted/40",
};

/**
 * Text-labelled per-item download control, rendered as its own pill in the
 * Mediathek item's info area (below the title/metadata/state badge) rather
 * than an icon squeezed into the play/menu row. Purely presentational: the
 * caller supplies the derived state (from the queue/offline/failure stores)
 * and the actions to run, so download bookkeeping lives in one place
 * instead of being re-implemented per state-to-label mapping.
 */
export function MediaDownloadStatusButton({
  state,
  progressPct,
  unavailableReason,
  onDownload,
  onCancelQueued,
  onCancelDownloading,
  onRetry,
  onRequestRemove,
}: Props) {
  const disabled = state === "unavailable";
  const ariaLabel = unavailableReason && disabled ? `${ARIA_LABELS[state]} - ${unavailableReason}` : ARIA_LABELS[state];
  const text =
    state === "downloading"
      ? `⬇ ${progressPct !== null && progressPct !== undefined ? `${progressPct}%` : "Wird geladen…"}`
      : TEXT_LABELS[state];

  const handleClick = () => {
    switch (state) {
      case "idle":
        onDownload();
        break;
      case "queued":
        onCancelQueued();
        break;
      case "downloading":
        onCancelDownloading();
        break;
      case "downloaded":
        onRequestRemove();
        break;
      case "failed":
        onRetry();
        break;
      case "unavailable":
        break;
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      aria-disabled={disabled}
      onClick={handleClick}
      className={`flex min-h-7 w-fit items-center justify-center rounded-pill px-2.5 py-1 text-meta font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${TONE_CLASSES[state]}`}
    >
      {text}
    </button>
  );
}
