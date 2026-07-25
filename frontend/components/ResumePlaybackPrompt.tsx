"use client";

interface Props {
  positionLabel: string | null;
  onRestart: () => void;
}

/** Small icon-only affordance shown after auto-seeking to a saved position -
 * see VideoPlayer.tsx for why this is an immediate seek, not a blocking
 * prompt. Sits inline with the other playback-mode buttons (same row/height
 * as PIP) rather than overlaying the video, so it doesn't get mistaken for
 * a fullscreen/native player control. */
export function ResumePlaybackPrompt({ positionLabel, onRestart }: Props) {
  const label = positionLabel ? `Fortgesetzt bei ${positionLabel} - von vorne starten` : "Von vorne starten";
  return (
    <button
      type="button"
      onClick={onRestart}
      title={label}
      aria-label={label}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-surface text-lg text-text-primary"
    >
      ↺
    </button>
  );
}
