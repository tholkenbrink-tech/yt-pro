"use client";

interface Props {
  /** Whether "pip" is the current leave-the-app preference - drives the
   * highlighted/active look. Mutually exclusive with the audio button. */
  active: boolean;
  onActivate: () => void;
}

/**
 * Icon-only counterpart to BackgroundAudioButton: picking this means the
 * video follows into a floating Picture-in-Picture window when the app is
 * left, instead of just keeping the audio track playing. Pure preference
 * selector - it doesn't invoke PiP itself (see PictureInPictureButton.tsx
 * for the web version that does, and NativePlayerPlugin.swift's
 * `canStartPictureInPictureAutomaticallyFromInline` for how the native
 * player actually acts on this choice once the app is backgrounded).
 */
export function BackgroundPipButton({ active, onActivate }: Props) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={active}
      aria-label="Beim Verlassen der App: Bild-in-Bild"
      className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-medium ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-text-secondary"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" />
      </svg>
      Bild-in-Bild
    </button>
  );
}
