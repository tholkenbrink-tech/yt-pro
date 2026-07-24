"use client";

interface Props {
  positionLabel: string;
  onRestart: () => void;
}

/** Small icon-only affordance shown after auto-seeking to a saved position -
 * see VideoPlayer.tsx for why this is an immediate seek, not a blocking
 * prompt. Sits inline with the other playback-mode buttons (same row/height
 * as PIP) rather than overlaying the video, so it doesn't get mistaken for
 * a fullscreen/native player control. */
export function ResumePlaybackPrompt({ positionLabel, onRestart }: Props) {
  return (
    <button
      type="button"
      onClick={onRestart}
      title={`Fortgesetzt bei ${positionLabel} - von vorne starten`}
      aria-label={`Fortgesetzt bei ${positionLabel} - von vorne starten`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-surface text-lg text-text-primary"
    >
      ↺
    </button>
  );
}
