"use client";

import { type BackgroundPlaybackMode, setPlayerSettings } from "@/lib/playerSettings";

interface Props {
  mode: BackgroundPlaybackMode;
  onChange: (mode: BackgroundPlaybackMode) => void;
}

/**
 * Only changes what happens when the user leaves the app while this video is
 * playing - "audio" keeps the audio track running in the background (the
 * default), "pip" pops the video into a floating window instead. Playback
 * inside the open player is identical either way; this never pauses or
 * otherwise changes in-app behavior.
 */
export function BackgroundPlaybackToggle({ mode, onChange }: Props) {
  const toggle = () => {
    const next: BackgroundPlaybackMode = mode === "audio" ? "pip" : "audio";
    setPlayerSettings({ backgroundPlaybackMode: next });
    onChange(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        mode === "audio"
          ? "Beim Verlassen der App: Ton läuft weiter im Hintergrund. Zum Umschalten auf Bild-in-Bild antippen."
          : "Beim Verlassen der App: Bild-in-Bild. Zum Umschalten auf Hintergrundwiedergabe antippen."
      }
      className="flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-text-primary"
    >
      {mode === "audio" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6v12l-5-4H2V10h2l5-4z" fill="currentColor" />
          <path
            d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
          <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" />
        </svg>
      )}
      <span className="text-xs font-medium">
        {mode === "audio" ? "Ton im Hintergrund" : "Bild-in-Bild"}
      </span>
    </button>
  );
}
