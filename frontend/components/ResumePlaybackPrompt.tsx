"use client";

interface Props {
  positionLabel: string;
  onRestart: () => void;
  onDismiss: () => void;
}

/** Dismissible toast shown after auto-seeking to a saved position - see
 * VideoPlayer.tsx for why this is a toast+immediate-seek, not a blocking
 * prompt. */
export function ResumePlaybackPrompt({ positionLabel, onRestart, onDismiss }: Props) {
  return (
    <div
      role="status"
      className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3 rounded-md bg-overlay px-3 py-2 text-sm text-white backdrop-blur"
    >
      <span>Fortgesetzt bei {positionLabel}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="min-h-11 rounded-md bg-white/20 px-3 py-1.5 font-medium"
        >
          Von vorne
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hinweis schließen"
          className="flex min-h-11 min-w-11 items-center justify-center text-lg"
        >
          ×
        </button>
      </div>
    </div>
  );
}
