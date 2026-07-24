"use client";

interface Props {
  positionLabel: string;
  onRestart: () => void;
}

/** Small icon-only affordance shown after auto-seeking to a saved position -
 * see VideoPlayer.tsx for why this is an immediate seek, not a blocking
 * prompt. Deliberately icon-only (no text banner) so it doesn't dominate the
 * video - the saved position is named via `title`/`aria-label` for anyone
 * who needs it, not shown as an overlay. */
export function ResumePlaybackPrompt({ positionLabel, onRestart }: Props) {
  return (
    <button
      type="button"
      onClick={onRestart}
      title={`Fortgesetzt bei ${positionLabel} - von vorne starten`}
      aria-label={`Fortgesetzt bei ${positionLabel} - von vorne starten`}
      className="absolute right-3 top-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-overlay text-lg text-white backdrop-blur"
    >
      ↺
    </button>
  );
}
