"use client";

interface Props {
  /** Whether "audio" is the current leave-the-app preference - drives the
   * highlighted/active look. Mutually exclusive with the PiP button. */
  active: boolean;
  onActivate: () => void;
}

/**
 * Icon-only counterpart to the PiP button: picking this means the audio
 * track keeps playing when the app is left, instead of following into a
 * floating Picture-in-Picture window. This is the default. Only the active
 * choice is highlighted - never both at once.
 */
export function BackgroundAudioButton({ active, onActivate }: Props) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={active}
      aria-label="Beim Verlassen der App: Ton im Hintergrund weiterspielen"
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-md border ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-text-primary"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 6v12l-5-4H2V10h2l5-4z" fill="currentColor" />
        <path
          d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
