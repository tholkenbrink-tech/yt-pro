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

const LABELS: Record<DownloadButtonState, string> = {
  idle: "Video herunterladen",
  queued: "Download in Warteschlange - antippen zum Abbrechen",
  downloading: "Video wird heruntergeladen - antippen zum Abbrechen",
  downloaded: "Video heruntergeladen - antippen zum Entfernen",
  failed: "Download fehlgeschlagen - antippen zum erneuten Versuch",
  unavailable: "Download nicht verfügbar",
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
 * Compact per-item download control shared by the Mediathek item layout -
 * same `h-7 w-7 rounded-full` footprint as the offline checkmark badge on
 * the thumbnail, so it reads as "one language" of compact status buttons
 * rather than a bespoke control. Purely presentational: the caller supplies
 * the derived state (from the queue/offline/failure stores) and the actions
 * to run, so download bookkeeping lives in one place instead of being
 * re-implemented per state-to-icon mapping.
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
  const label = unavailableReason && disabled ? `${LABELS[state]} - ${unavailableReason}` : LABELS[state];

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
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      onClick={handleClick}
      className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${TONE_CLASSES[state]}`}
    >
      {state === "downloading" ? (
        <span className="text-[10px] font-medium">{progressPct !== null && progressPct !== undefined ? `${progressPct}%` : "…"}</span>
      ) : (
        <span aria-hidden="true">
          {state === "idle" && "⬇"}
          {state === "queued" && "⏳"}
          {state === "downloaded" && "✓"}
          {state === "failed" && "⚠"}
          {state === "unavailable" && "⬇"}
        </span>
      )}
    </button>
  );
}
