"use client";

import { useEffect, useState } from "react";
import {
  type BackgroundPlaybackMode,
  DEFAULT_PLAYER_SETTINGS,
  getPlayerSettings,
  setPlayerSettings,
  type PlayerSettings,
} from "@/lib/playerSettings";
import { useToast } from "@/components/ToastProvider";

const BACKGROUND_PLAYBACK_OPTIONS: { value: BackgroundPlaybackMode; label: string }[] = [
  { value: "audio", label: "Ton im Hintergrund" },
  { value: "pip", label: "Bild-in-Bild" },
];

type BooleanPlayerSettingsKey = {
  [K in keyof PlayerSettings]: PlayerSettings[K] extends boolean ? K : never;
}[keyof PlayerSettings];

const TOGGLES: { key: BooleanPlayerSettingsKey; label: string }[] = [
  { key: "autoResume", label: "Automatisch fortsetzen" },
  { key: "rememberPlaybackRate", label: "Wiedergabegeschwindigkeit merken" },
  { key: "markWatchedAt95", label: "Bei 95% als angesehen markieren" },
  { key: "replayAfterFinish", label: "Nach Ende erneut abspielen anbieten" },
  { key: "showPipButton", label: "Bild-in-Bild-Button anzeigen" },
];

export default function PlayerSettingsPage() {
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const { showToast } = useToast();

  useEffect(() => {
    setSettings(getPlayerSettings());
  }, []);

  const toggle = (key: BooleanPlayerSettingsKey) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setPlayerSettings({ [key]: next[key] });
    showToast("Einstellung gespeichert");
  };

  const setBackgroundPlaybackMode = (mode: BackgroundPlaybackMode) => {
    const next = { ...settings, backgroundPlaybackMode: mode };
    setSettings(next);
    setPlayerSettings({ backgroundPlaybackMode: mode });
    showToast("Einstellung gespeichert");
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Player</h1>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium">Beim Verlassen der App</p>
        <div className="flex gap-1.5">
          {BACKGROUND_PLAYBACK_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setBackgroundPlaybackMode(value)}
              className={`min-h-11 flex-1 rounded-md border px-3 text-sm font-medium ${
                settings.backgroundPlaybackMode === value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          Gilt nur, wenn die App verlassen wird - im geöffneten Player läuft das Video immer normal weiter.
        </p>
      </div>

      <div className="space-y-1">
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="flex min-h-11 items-center justify-between py-1">
            <span className="text-sm font-medium">{label}</span>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={() => toggle(key)}
              className="h-5 w-5 accent-accent"
            />
          </label>
        ))}
      </div>
    </main>
  );
}
